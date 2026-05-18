# FaceGateway — Edge

Sistema embarcado rodando na Raspberry Pi 4. Responsável por captura de frames, reconhecimento facial, atuação física (catraca e buzzer), cache local e publicação de eventos via MQTT.

## Convenções

- C++17, GCC 12+, build com CMake.
- Headers (`.hpp`) e implementação (`.cpp`) convivem no mesmo diretório do módulo. Sem `include/` separado.
- Cada pasta em `src/` é compilada como biblioteca estática independente.
- Binários em `apps/` linkam as libs de `src/` conforme a necessidade — não precisam linkar tudo.
- Estado em runtime (SQLite, embeddings gerados) é escrito em `/var/lib/facegate/` na placa. **Não** vai no repositório.

## Estrutura de pastas

```
edge/
├── models/                 # .onnx (BlazeFace, MobileFaceNet) — read-only
├── config/                 # config.toml
├── migrations/             # schema.sql (estrutura do SQLite)
├── apps/
│   ├── facegate/           # main do app principal (loop de reconhecimento)
│   └── enroll/             # main do CLI de cadastro
├── src/
│   ├── domain/             # structs do domínio (AccessEvent, Embedding, ...)
│   ├── config/             # loader do config.toml
│   ├── hardware/           # câmera CSI, GPIO relé, GPIO buzzer
│   ├── storage/            # SQLite (cache embeddings + fila offline)
│   ├── vision/             # inferência ONNX + matching por distância de cosseno
│   ├── mqtt/               # publisher + serialização JSON
│   └── pipeline/           # orquestrador do loop principal
├── CMakeLists.txt
└── DESIGN.md
```

## Diagrama de dependências

> Será preenchido em Mermaid assim que todos os módulos estiverem mapeados.

---

## Módulos (`src/`)

### `src/domain/`

**Propósito:** Define os tipos que representam os conceitos do sistema — funcionário, embedding, evento de acesso, falha de dispositivo. Módulo header-only, sem comportamento, sem dependências externas. É o vocabulário compartilhado consumido por todos os outros módulos.

**Dependências:** Nenhuma além da stdlib (`<cstdint>`, `<chrono>`, `<string>`, `<array>`, `<optional>`).

**Arquivos:**

| Arquivo | Conteúdo |
|---|---|
| `types.hpp` | Aliases básicos: `EmployeeId`, `Timestamp` |
| `employee.hpp` | `Employee` |
| `embedding.hpp` | `EMBEDDING_DIM`, `EmbeddingVector`, `Embedding` |
| `match.hpp` | `Match`, `MatchResult` |
| `events.hpp` | `AccessStatus`, `AccessEvent`, `FaultKind`, `DeviceFault`, `Heartbeat` |
| `domain.hpp` | Umbrella header — inclui todos os outros |

**API pública:**

Tipos utilitários:
- `EmployeeId` — `std::int64_t`, identificador de funcionário (alinhado com `BIGINT` do Postgres).
- `Timestamp` — `std::chrono::system_clock::time_point`, sempre tratado como UTC na serialização.

Entidades:
- `Employee { EmployeeId id; std::string name; }`
- `Embedding { EmployeeId owner; EmbeddingVector vector; }` com `EMBEDDING_DIM = 128`.

Resultado de reconhecimento:
- `Match { EmployeeId employee; float distance; }`
- `MatchResult = std::optional<Match>` — vazio indica rosto desconhecido.

Eventos:
- `AccessEvent { Timestamp, AccessStatus, optional<EmployeeId>, optional<float> distance }` — tentativa de passagem pela catraca.
- `AccessStatus ∈ { Granted, Denied, Unknown }` — Granted/Denied implicam employee preenchido; Unknown = rosto não identificado.
- `DeviceFault { Timestamp, FaultKind, std::string message }` — falha de infraestrutura (canal separado de `AccessEvent`).
- `FaultKind ∈ { CameraFailure, InferenceFailure, StorageFailure, Other }`.
- `Heartbeat { Timestamp }` — sinal de vida do dispositivo.

**Invariantes (não expressas no type system, responsabilidade do produtor):**
- `AccessEvent.employee` está preenchido se e somente se `status ∈ { Granted, Denied }`.
- `Embedding.vector` tem norma ≈ 1 (embeddings normalizados pela `vision/`).

**Decisões de projeto:**
- `std::array<float, 128>` em vez de `std::vector<float>`: contiguidade de memória e zero heap alloc em hot path.
- `std::optional` em vez de flags manuais para ausência de valor.
- `AccessEvent` e `DeviceFault` são tipos separados: eventos de negócio e falhas de infraestrutura trafegam em canais MQTT distintos.
- Nenhuma imagem bruta persiste ou transita pelo sistema — apenas embeddings (LGPD).

---

### `src/config/`

**Propósito:** Carrega e valida o arquivo `config.toml` no boot do sistema. Modela cada seção do TOML como uma struct aninhada, separando parsing (forma) de validação (conteúdo). Configuração circula por valor/const reference — cada módulo recebe só o subconjunto que consome.

**Dependências:** stdlib (`<cstdint>`, `<string>`, `<filesystem>`, `<stdexcept>`) e `toml++` (header-only, externa).

**Arquivos:**

| Arquivo | Conteúdo |
|---|---|
| `config.hpp` | Structs `Config` + seções (`VisionConfig`, `CameraConfig`, etc) + declaração de `load_config` |
| `config.cpp` | Implementação de `load_config`, funções internas de parsing por seção e `validate` |

**API pública:**

Structs (campos no header):
- `Config` — raiz, agrega todas as seções + `device_id`.
- `VisionConfig` — threshold, paths dos modelos ONNX, threads do ONNXRuntime.
- `CameraConfig` — device path, largura, altura, fps.
- `GpioConfig` — pinos do servo e buzzer (`servo_pin`, `buzzer_pin`), duração da janela aberta (`servo_open_ms`) e do beep (`buzzer_beep_ms`), flag `enabled`.
- `RecognitionConfig` — `idle_reset_seconds`, `unknown_throttle_seconds`. Parâmetros da deduplicação de notificações (ver `pipeline/`).
- `StorageConfig` — path do SQLite local.
- `MqttConfig` — host/porta do broker, client_id, keepalive, intervalo do heartbeat.
- `LoggingConfig` — nível de log.

Funções:
- `Config load_config(const std::filesystem::path& path)` — lê o TOML, preenche a struct, valida invariantes. Joga `std::runtime_error` em qualquer falha (arquivo ausente, sintaxe inválida, seção obrigatória faltando, invariante semântica violada). Mensagens de erro no formato `"Config: <seção>.<campo> <razão>"`.

**Invariantes validadas:**
- `device_id`, paths de modelo, device da câmera, `sqlite_path`, `broker_host`, `client_id` são obrigatórios.
- `vision.threshold ∈ [0.0, 2.0]`.
- `camera.width`, `camera.height`, `camera.fps`, `vision.onnx_threads` positivos.
- Quando `gpio.enabled = true`: `gpio.servo_pin`, `gpio.buzzer_pin` não-negativos e distintos entre si; `gpio.servo_open_ms`, `gpio.buzzer_beep_ms` positivos.
- `recognition.idle_reset_seconds`, `recognition.unknown_throttle_seconds` positivos. Seção `[recognition]` ausente é tolerada — defaults `3` e `10` aplicados.
- `mqtt.keepalive_seconds`, `mqtt.heartbeat_interval_seconds` positivos.
- `mqtt.broker_port ∈ [1, 65535]`.
- `logging.level ∈ {trace, debug, info, warn, error}`.

**Decisões de projeto:**
- **Parsing tolerante, validação rigorosa:** parse aplica defaults pra campos individuais ausentes; `validate` detecta sentinelas inválidas depois. Seções inteiras ausentes são erro fatal no parse.
- **Seção ausente é erro, campo ausente é tolerável:** diferença entre "usuário não deu nenhuma config de mqtt" (sem default sensato) e "usuário esqueceu um campo" (default serve).
- **Defaults funcionais onde existe canônico** (porta MQTT 1883, câmera 640×480@30fps, nível de log "info"); **sentinelas onde não existe** (`""` pra strings essenciais, `-1` pra pinos GPIO).
- **Exceções, não `std::optional`/`std::expected`:** config é carregada uma única vez no boot; se falhar, o programa não tem como continuar. Custo da exceção é irrelevante fora de hot path.
- **Structs aninhadas por seção, não monolito:** outros módulos recebem `const GpioConfig&` em vez de `const Config&`, tornando dependências explícitas nas assinaturas de função.
- **Para no primeiro erro de validação** (simplicidade). Acumular erros é evolução futura se virar dor.
---

### `src/hardware/`

**Propósito:** Encapsula os recursos físicos do dispositivo — câmera, servo da catraca e buzzer — em classes RAII que adquirem recurso no construtor e liberam no destrutor. Esconde detalhes das libs de baixo nível (`libgpiod` via PIMPL; OpenCV vaza na API pública da câmera porque `cv::Mat` é consumido diretamente pelo pipeline).

**Dependências:** stdlib (`<atomic>`, `<condition_variable>`, `<mutex>`, `<thread>`, `<chrono>`, `<optional>`, `<string>`), OpenCV (`opencv2/core.hpp`, `opencv2/videoio.hpp`), libgpiod (v2).

**Arquivos:**

| Arquivo | Conteúdo |
|---|---|
| `turnstile.hpp` / `turnstile.cpp` | Classe `Turnstile` — controla servo SG90 da catraca via PWM por software |
| `buzzer.hpp` / `buzzer.cpp` | Classe `Buzzer` — saída GPIO para sinalizar acesso negado |
| `camera.hpp` / `camera.cpp` | Classe `Camera` — captura contínua com latest-frame buffer |
| `hardware.hpp` | Umbrella header |

**API pública:**

```cpp
class Turnstile {
   Turnstile(const char* chip_path, int line_offset, int open_hold_ms,
             bool enabled, int open_pulse_us = 2000);
   void grant_access();   // não-bloqueante; (re)arma janela aberta
};

class Buzzer {
   Buzzer(const char* chip_path, int line_offset, int beep_ms, bool enabled);
   void beep_denied();    // pulsa beep_ms, bloqueante
};

class Camera {
   Camera(const std::string& source, int width, int height, int fps);
   std::optional<cv::Mat> capture();  // último frame clonado, ou nullopt
};
```

Todas as três classes são **não-copiáveis e não-móveis** (cópia/move `= delete`).

**Invariantes e contratos:**
- Construtores jogam `std::runtime_error` em falha de setup (chip GPIO inacessível, linha ocupada, câmera não abre). Caso não tome exceção, objeto está pronto pra uso.
- Operações em runtime (`grant_access`, `beep_denied`, `capture`) não jogam: retornam silenciosamente ou `std::nullopt` em falha. Consumidor decide o que fazer.
- `Turnstile::grant_access` é **não-bloqueante**: apenas bumpa um timestamp `open_until_` protegido por mutex e notifica a thread interna. Pode ser chamado a 30 fps sem efeito adverso — chamadas durante a janela aberta só *estendem* a janela, nunca reiniciam o ciclo abre/fecha.
- `Buzzer::beep_denied` **bloqueia** a thread chamadora por `beep_ms`. Não deve rodar na thread que faz captura/inferência se a duração for significativa.
- `Camera::capture` retorna um `cv::Mat` **clonado** — dono independente do buffer. Chamador pode segurar/modificar livremente.
- Até o primeiro frame ser capturado após o boot, `capture()` retorna `nullopt`.
- A thread interna do `Turnstile` dorme em condvar enquanto fechado; a linha GPIO permanece em LOW (servo de-energizado). Acorda em `grant_access`, pulsa a 50 Hz até `open_until_` expirar, e volta a dormir com a linha em LOW.

**Decisões de projeto:**
- **PIMPL em `Turnstile` e `Buzzer`** pra esconder `<gpiod.h>` do resto do código; tipos libgpiod nunca vazam pra outros módulos. Trocar a lib é mudança local.
- **PIMPL parcial em `Camera`**: `cv::VideoCapture` escondido no `Impl`, mas `cv::Mat` vaza na assinatura pública porque `vision/` consome direto. Não vale esconder.
- **Nomes semânticos em vez de mecânicos** (`grant_access`, `beep_denied`, não `pulse(ms)`). Duração vive dentro da classe; chamador declara intenção, não mecanismo.
- **`Turnstile` com thread interna** (diferente de `Buzzer`, que ainda bloqueia). Motivo: o servo precisa de pulsos contínuos a 50 Hz durante toda a janela aberta (5s default). Bloquear o `main_loop` da pipeline por 5s congelaria o reconhecimento. A thread emite PWM em background e a chamada de `grant_access` retorna imediatamente.
- **PWM apenas durante a janela aberta** (não contínuo). Quando fechado, a linha fica em LOW e o servo é totalmente de-energizado — não consome corrente, não trepida, não há jitter audível. Confia em viés mecânico (peso da haste, mola, ou gravidade no eixo correto) para manter a posição fechada. Alternativa rejeitada: PWM contínuo segurando posição fechada — funciona, mas mantém o SG90 energizado permanentemente, esquentando e desgastando o motor.
- **Software PWM via libgpiod** (não hardware PWM). Pi 4 tem duas linhas de hardware PWM (GPIO 12/13 ou 18/19), mas requer `pigpio` ou acesso direto ao registrador. Software PWM via `gpiod_line_request_set_value` + `sleep_for` tem jitter de ~50-100µs (Linux não-RT), o que se traduz em ~5° de erro angular — aceitável para uma catraca de barra que só precisa girar pra ~90°. Se virar problema, migrar pra hardware PWM é localizado a este arquivo.
- **Re-trigger estende a janela, não reinicia ciclo** (`new_target > open_until_` check). Com a deduplicação a 30 fps já não dispara mais por frame, mas mesmo se disparasse, o servo só veria pulsos contínuos a 50 Hz — sem comando de "fecha" → "abre" intermitente, que era o cenário que quebraria o motor.
- **Latest-frame buffer** na Camera: thread dedicada captura em loop infinito sobrescrevendo um único slot protegido por mutex; `capture()` retorna sempre o mais recente, frames antigos descartados por sobrescrita. Latência limitada a um intervalo de frame, não acumulativa.
- **`clone()` obrigatório em `capture()`** — sem ele, o consumer teria uma referência compartilhada (cv::Mat é reference-counted) e a thread de captura mutaria os pixels durante a inferência.
- **Log por transição de estado** na thread de captura: loga falha após 30 leituras consecutivas (~1s), loga recuperação ao voltar a funcionar. Não loga por frame. Usa `std::cerr` provisoriamente até existir módulo de logging.
- **Destrutor manual obrigatório na `Camera`**: ordem fixa é (1) `stop_ = true`, (2) `thread.join()`, (3) liberar `VideoCapture`. Inverter (1) e (2) causa deadlock; inverter (2) e (3) causa UB.
- **Destrutor do `Turnstile`** sinaliza `stop_ = true`, notifica condvar (pra desbloquear da espera ociosa), join na thread, depois força linha em LOW antes de liberar a request — garante que o servo fica de-energizado quando o processo sai.
- **Sem timeout em `cap.read`**: se o celular cai da rede, a thread pode travar. Aceito como custo do MVP — recuperação manual (reiniciar processo) é suficiente.

**Pendências / TBD:**
- Substituir `std::cerr` pelo módulo de logging quando ele existir.
- Migrar pra hardware PWM (`pigpio` ou `/sys/class/pwm`) se o jitter do software PWM virar um problema visível na catraca.
- Investigar `CAP_PROP_READ_TIMEOUT_MSEC` se a queda de rede virar dor operacional.

---

### `src/storage/`

**Propósito:** Persistência local em SQLite. Duas responsabilidades no mesmo arquivo `.db`: cache de embeddings cadastrados (lido no boot pelo pipeline, escrito pelo enrollment CLI) e fila offline de eventos MQTT pendentes de publicação (produtor: pipeline quando publish falha; consumidor: drainer quando a rede volta). Classe única `Storage` com mutex interno serializando todo acesso à conexão.

**Dependências:** stdlib (`<chrono>`, `<cstring>`, `<fstream>`, `<mutex>`, `<optional>`, `<sstream>`, `<stdexcept>`, `<string>`, `<vector>`), SQLiteCpp, e `domain/` para os tipos compartilhados.

**Arquivos:**

| Arquivo | Conteúdo |
|---|---|
| `storage.hpp` | Classe `Storage` + struct `PendingEvent` |
| `storage.cpp` | Implementação |
| `storage_all.hpp` | Umbrella header |

Schema do banco vive fora do módulo: `edge/migrations/schema.sql`.

**API pública:**

```cpp
struct PendingEvent {
   std::int64_t id;
   std::string topic;
   std::string payload;
   domain::Timestamp created_at;
};

class Storage {
   Storage(const std::string& db_path, const std::string& migrations_path);

   // Embeddings
   std::vector<domain::Embedding> load_all_embeddings();
   void insert_embedding(const domain::Embedding& embedding);
   void delete_employee_embeddings(domain::EmployeeId employee_id);

   // Fila offline
   void enqueue_pending_event(const std::string& topic, const std::string& payload);
   std::vector<PendingEvent> fetch_pending_events(int limit);
   void delete_pending_event(std::int64_t id);
};
```

Não-copiável e não-móvel (`= delete` nas 4 operações).

**Invariantes e contratos:**
- Construtor abre a conexão e aplica o schema idempotentemente (`CREATE ... IF NOT EXISTS`). Joga `std::runtime_error` em falha (arquivo inacessível, schema inválido, permissão).
- Todas as operações públicas jogam `std::runtime_error` em falha do SQLite. Diferente do hardware, storage não silencia erros — disco cheio, corrupção ou constraint violada são fatais e o chamador precisa saber.
- Todas as operações travam o mutex interno; acesso concorrente é serializado automaticamente. Chamador não precisa sincronizar.
- Embeddings são armazenados como BLOB de tamanho fixo (`EMBEDDING_DIM * sizeof(float)` bytes). Na leitura, tamanho é validado — BLOB com tamanho diferente resulta em exceção (indica corrupção ou embedding de modelo antigo).
- Timestamps são armazenados como epoch milliseconds (`INTEGER`). Conversão de/para `domain::Timestamp` é invisível pro consumidor.
- `fetch_pending_events` ordena por `id ASC` (FIFO, equivalente a ordem de inserção). Usado em batches: fetch → processa → delete.
- O diretório pai do `sqlite_path` **deve existir** antes do construtor rodar. Responsabilidade do `main`.

**Decisões de projeto:**
- **PIMPL** pra esconder `<SQLiteCpp/SQLiteCpp.h>` do resto do código. Trocar a lib (por sqlite3 C direto, por exemplo) é mudança local.
- **Mutex direto na classe**, não no Impl. Tipo da stdlib, esconder não adiciona valor.
- **Schema externo (`.sql`)** carregado do disco no boot. Legibilidade (syntax highlighting), inspecionabilidade (`sqlite3 cache.db < schema.sql`), evolução trivial.
- **Schema idempotente sem sistema de migrations versionadas.** Pro MVP, mudanças no schema são acompanhadas de instrução: "apague o `cache.db` local". Migrations versionadas (tabela `schema_version`, aplicação incremental) ficam pra quando o sistema for pra produção real.
- **Edge burro — só IDs, sem tabela `employees`.** Dados de funcionários (nome, cargo, etc) vivem no backend PostgreSQL. O edge só sabe que embedding N pertence ao `employee_id` X. Logs locais mostram IDs numéricos.
- **Embedding como BLOB.** Alternativas (128 colunas `REAL`, JSON) seriam 100× mais lentas de ler/escrever. BLOB é 512 bytes compactos, uma leitura, zero parse.
- **Timestamp como epoch millis `INTEGER`.** Compacto (8 bytes vs ~20 em ISO 8601), comparação é compare-inteiros, e conversão de/pra `std::chrono::system_clock::time_point` é trivial e sem perda.
- **`PendingEvent` vive no módulo, não no domain.** É detalhe de persistência — representa uma linha da tabela hidratada. Se a lib de persistência mudar, esse tipo muda com ela.
- **Fila genérica (`topic`, `payload`) em vez de tabelas por tipo de evento.** Adicionar novos tipos de mensagem MQTT (fault, heartbeat, futuro) não requer schema novo. Serialização é responsabilidade de `mqtt/`, storage só guarda bytes opacos.
- **Índice em `embeddings(employee_id)`**; sem índice em `pending_events` (FIFO via primary key já é ótimo).
- **Sem transação explícita em operações simples.** SQLite já é atômico por statement. Transações são responsabilidade do chamador quando operações múltiplas precisam de atomicidade — ex: enrollment CLI inserindo múltiplas fotos num lote deve abrir uma transação. API pública não expõe transação hoje (evitar vazar tipos da lib); se virar necessidade, adicionar `insert_embeddings(vector<Embedding>)` plural que internamente usa transação.
- **Construtor recebe paths crus** (`db_path`, `migrations_path`), não `StorageConfig`. Desacopla storage de config; quem monta chamada é o `main`.

**Pendências / TBD:**
- Política de retenção da fila offline (apagar eventos mais velhos que X dias). Sem isso, rede caída por dias pode inflar o banco indefinidamente.
- `insert_embeddings` plural com transação quando o enrollment CLI for implementado.
- `count_pending_events` se o dashboard vier a exibir "N eventos na fila".
- Sistema de migrations versionadas se o projeto for além do MVP.
- Substituir criação do diretório pai manual no `main` por lógica no construtor (decisão de escopo — manter responsabilidade fora ou trazer pra cá).

---

### `src/vision/`

**Propósito:** Pipeline de visão computacional. Detecta rostos no frame (BlazeFace), extrai embedding do rosto detectado (ArcFace) e compara contra o cache de embeddings cadastrados (distância de cosseno). Três classes públicas coesas por responsabilidade: `FaceDetector`, `FaceEmbedder`, `Matcher`. Uma classe interna (`OnnxSession`) encapsula ONNXRuntime e é reutilizada pelos dois inferenciadores.

**Dependências:** stdlib (`<algorithm>`, `<array>`, `<cmath>`, `<cstddef>`, `<cstdint>`, `<cstring>`, `<limits>`, `<memory>`, `<mutex>`, `<optional>`, `<string>`, `<utility>`, `<vector>`), OpenCV (`opencv2/core.hpp`, `opencv2/imgproc.hpp`), ONNXRuntime (`onnxruntime_cxx_api.h`), e `domain/`.

**Arquivos:**

| Arquivo | Conteúdo |
|---|---|
| `types.hpp` | `BBox`, `Keypoint`, `Keypoints`, `Detection`, `NUM_KEYPOINTS` |
| `matcher.hpp` / `.cpp` | Classe `Matcher` — distância de cosseno contra cache in-memory |
| `onnx_session.hpp` / `.cpp` | Wrapper interno sobre `Ort::Session` (não faz parte da API pública) |
| `face_detector.hpp` / `.cpp` | Classe `FaceDetector` — inferência BlazeFace + seleção do rosto mais confiante |
| `face_embedder.hpp` / `.cpp` | Classe `FaceEmbedder` — recorte da bbox, pré-processamento, inferência ArcFace, normalização L2 |
| `vision.hpp` | Umbrella header (não exporta `OnnxSession`) |

**API pública:**

```cpp
struct BBox { float x, y, width, height; };
struct Keypoint { float x, y; };
using Keypoints = std::array;
struct Detection { BBox bbox; Keypoints keypoints; float score; };

class Matcher {
   Matcher(std::vector cache, float threshold);
   domain::MatchResult find_match(const domain::EmbeddingVector& query) const;
   std::size_t cache_size() const noexcept;
};

class FaceDetector {
   FaceDetector(const std::string& model_path, int num_threads,
                float conf_threshold = 0.5f, float iou_threshold = 0.3f);
   std::optional detect_best(const cv::Mat& frame_bgr);
};

class FaceEmbedder {
   FaceEmbedder(const std::string& model_path, int num_threads);
   std::optional extract(
       const cv::Mat& frame_bgr, const Detection& detection);
};
```

Todas não-copiáveis e não-móveis (`= delete`).

**Fluxo do módulo:**
```
frame (cv::Mat BGR)
   ↓ FaceDetector::detect_best
Detection (bbox + keypoints + score)
   ↓ FaceEmbedder::extract
EmbeddingVector (L2-normalizado)
   ↓ Matcher::find_match
MatchResult (Match{id, distance} ou nullopt)
```

**Invariantes e contratos:**
- Construtores de `FaceDetector` e `FaceEmbedder` jogam `std::runtime_error` em falha de setup (modelo não carrega, ONNX inválido). `Matcher` não falha na construção.
- Operações em runtime (`detect_best`, `extract`, `find_match`) **não jogam** — retornam `std::optional<T>` vazio em falha ou ausência. Consumidor decide o que fazer.
- `FaceEmbedder::extract` retorna embeddings **sempre L2-normalizados** (|v| = 1). `Matcher` assume isso pro cosine distance funcionar direito.
- `Matcher::find_match` é `const` e thread-safe pra leituras concorrentes (cache imutável após construção). Múltiplas threads podem chamar simultaneamente.
- BlazeFace do `garavv` aceita imagem RGB 128×128 normalizada para `[0, 1]` (divisão por 255); ArcFace do `garavv` aceita RGB 112×112 normalizada por `(x - 127.5) / 128`. Pré-processamento é responsabilidade interna de cada classe.
- `OnnxSession::TensorView` tem ponteiros **válidos somente até o próximo `run()`** da mesma sessão. Consumidores copiam antes de rodar de novo.
- BBox retornada pelo detector está em **coordenadas de pixels** da imagem original (já desnormalizado do `[0, 1]` do modelo).

**Decisões de projeto:**
- **Três classes separadas** por responsabilidade. Pipeline orquestra. Permite testar/substituir cada etapa em isolado.
- **`OnnxSession` interno e reutilizado** pelas duas classes de inferência. Evita duplicação pesada do setup ONNX (Env, SessionOptions, MemoryInfo). Não é exportado no umbrella — detalhe de implementação.
- **BlazeFace (`blaze.onnx`) + ArcFace (`arc.onnx`)** do autor `garavv` no Hugging Face. Ambos públicos, download direto via wget, opset moderno. BlazeFace já inclui NMS embutido — evita implementar NMS manualmente.
- **Troca do MobileFaceNet 128D para ArcFace 512D.** MobileFaceNet original (foamliu) está em PyTorch `.pt` e requer conversão manual; ArcFace do mesmo autor do BlazeFace está pronto em ONNX. `EMBEDDING_DIM` foi atualizado para 512 no domain; impacto cascateia (BLOB passa de 512 bytes para 2048 bytes no SQLite, 4x mais trabalho no matching — ambos desprezíveis na prática).
- **Um rosto por frame** (`detect_best`). Se BlazeFace detectar múltiplos, escolhemos o de maior score. Rationale: uma catraca = uma pessoa por vez.
- **Sem alinhamento facial** usando os keypoints que BlazeFace entrega. Decisão pragmática para MVP; alinhamento melhora acurácia mas acrescenta warp afim não-trivial. Pendente.
- **Normalização L2 no `FaceEmbedder`**, não no `Matcher`. Embedder produz embeddings normalizados que circulam pelo sistema inteiro (storage, matching). Consumidor não precisa saber de normalização.
- **Matcher imutável após construção.** Atualizar cache = reconstruir. Para MVP, reinício do processo após enrollment é aceitável. Elimina necessidade de mutex/sincronização em hot path (`find_match` é thread-safe sem lock).
- **Threshold dentro do Matcher.** `find_match` retorna decisão já tomada (`MatchResult` com ou sem `Match`). Consumidor não lida com threshold.
- **Thresholds de detecção (`conf_threshold`, `iou_threshold`) hardcoded via defaults do construtor**, não no config.toml. Decisão: são hyperparâmetros internos do modelo, não do deploy. Se virar necessário configurar, adicionar em `[vision]` do config.
- **Loop de matching O(n) linear.** Para N ≤ ~1000 embeddings, HNSW/ball-tree não paga. Reavaliar se o sistema escalar pra dezenas de milhares.
- **`const_cast<float*>` no OnnxSession::run** para alimentar a API do ONNX que aceita ponteiro mutável. Semanticamente imutável; cast seguro.
- **Contratos de exceção distintos do hardware:** setup joga, runtime silencia (`optional`). Igual hardware. Diferente de config e storage (que jogam também em runtime).

**Pendências / TBD:**
- **Alinhamento facial** usando os 6 keypoints de BlazeFace antes da extração de embedding. Melhora acurácia em rostos não-frontais. Warp afim via `cv::getAffineTransform` + `cv::warpAffine`.
- **Processamento de múltiplos rostos por frame** se o caso de uso evoluir (múltiplas catracas simultâneas, controle de grupo).
- **Suporte a batching** no `OnnxSession` para inferência em lote (útil no enrollment CLI processando várias fotos).
- **Quantização INT8** dos modelos via ONNXRuntime para acelerar na Raspberry (trade-off com acurácia).
- **Mapeamento de inputs por nome, não por índice**, no `FaceDetector`. Atualmente assume ordem fixa de 4 inputs do BlazeFace; frágil se modelo for reexportado.

---

### `src/mqtt/`

**Propósito:** Comunicação com o broker MQTT. Serialização de tipos de domínio em JSON (uma função overload por tipo) e classe `MqttPublisher` com conexão assíncrona, thread interna gerenciada pela libmosquitto, publicação fire-and-queue com QoS 1. Falhas de publicação delegam pro storage offline (fila de `pending_events`).

**Dependências:** stdlib (`<atomic>`, `<chrono>`, `<cstdint>`, `<iostream>`, `<mutex>`, `<stdexcept>`, `<string>`), mosquittopp (`libmosquittopp.h`), nlohmann_json, e `domain/`.

**Arquivos:**

| Arquivo | Conteúdo |
|---|---|
| `topics.hpp` | Constantes dos tópicos MQTT (`kAccessEvent`, `kHeartbeat`, `kDeviceFault`) |
| `serialization.hpp` / `.cpp` | Funções livres `serialize(...)` overloaded por tipo de domínio |
| `mqtt_publisher.hpp` / `.cpp` | Classe `MqttPublisher` |
| `mqtt.hpp` | Umbrella header |

**API pública:**

```cpp
namespace topics {
   inline constexpr const char* kAccessEvent;
   inline constexpr const char* kHeartbeat;
   inline constexpr const char* kDeviceFault;
}

struct SerializedMessage {
   const char* topic;
   std::string payload;
};

SerializedMessage serialize(const domain::AccessEvent& event);
SerializedMessage serialize(const domain::Heartbeat& heartbeat, const std::string& device_id);
SerializedMessage serialize(const domain::DeviceFault& fault, const std::string& device_id);

class MqttPublisher {
   MqttPublisher(const std::string& client_id,
                 const std::string& broker_host,
                 int broker_port,
                 int keepalive_seconds);

   bool publish(const SerializedMessage& message);
   bool is_connected() const noexcept;
};
```

`MqttPublisher` não-copiável e não-móvel.

**Tópicos:**
- `facegate/events/access` — `AccessEvent` (campos: `timestamp_ms`, `status` ∈ `granted|denied|unknown`, `employee_id` nullable, `distance` nullable).
- `facegate/health/heartbeat` — `Heartbeat` (campos: `timestamp_ms`, `device_id`).
- `facegate/health/fault` — `DeviceFault` (campos: `timestamp_ms`, `device_id`, `kind` ∈ `camera_failure|inference_failure|storage_failure|other`, `message`).

**Invariantes e contratos:**
- Construtor de `MqttPublisher` joga `std::runtime_error` em falha de inicialização da lib ou criação do cliente. **Não** joga se broker está offline — conexão é assíncrona e reconexão é automática.
- `publish()` **nunca joga**. Retorna `true` se a mensagem foi enfileirada pela libmosquitto E o cliente está conectado; `false` caso contrário. Chamador trata `false` enfileirando no storage offline.
- `is_connected()` é thread-safe (leitura atômica), `noexcept`.
- Callbacks da lib (`on_connect`, `on_disconnect`) rodam na thread interna da libmosquitto — daí o flag `connected_` ser `std::atomic<bool>`.
- Serialização é pura (funções livres sem estado). Pode ser chamada de qualquer thread.
- Payloads são JSON compacto (uma linha). Timestamps como epoch millis (`int64`). Enums serializados como string lowercase (robusto a reordenação em C++).

**Decisões de projeto:**
- **Modelo assíncrono com thread interna da libmosquitto** (`loop_start()`). Publisher não tem thread própria; delega pra lib. API pública é fire-and-queue.
- **QoS 1** padrão pra todas as publicações. At-least-once delivery; broker acknowledga e retenta se não receber ACK.
- **Retained flag `false`** — eventos são efêmeros, não devem persistir no broker pra novos subscribers.
- **Reconexão automática** via `reconnect_delay_set(1, 30, true)` — exponential backoff entre 1 e 30 segundos se conexão cair.
- **Tópicos hardcoded como constantes**, não configuráveis. São parte do contrato com o backend; mudar tópico quebra comunicação. `#define` disfarçado de `inline constexpr` com escopo de namespace pra type-safety.
- **Serialização separada do publisher** em arquivos distintos. Funções puras, fáceis de testar. Reutilizáveis pelo storage drainer (serializa ao enqueue, sem precisar do publisher vivo).
- **Overload de `serialize` por tipo** em vez de nome único (`serialize_access_event`, etc). C++ resolve pelo tipo; código de chamada fica uniforme.
- **`device_id` passado como parâmetro** em `serialize(Heartbeat)` e `serialize(DeviceFault)`. Não está no tipo de domínio (que é só timestamp + dado específico). Publisher injeta o ID do config.
- **`AccessEvent` não carrega `device_id` no payload** — backend correlaciona pelo `client_id` MQTT (que é o mesmo que `device_id`). Redundância minimizada.
- **JSON via nlohmann_json** pela legibilidade do código de serialização. Custo de compile time aceitável pro tamanho do projeto.
- **PIMPL em `MqttPublisher`** — `Impl` herda de `mosqpp::mosquittopp` (padrão da lib pra callbacks virtuais). Esconde `<libmosquittopp.h>` do resto do código.
- **`std::once_flag` + `mosqpp::lib_init`** — inicialização global da libmosquitto uma única vez, mesmo com múltiplas instâncias de `MqttPublisher` (embora na prática haja só uma).
- **Log provisório em `std::cerr`** — callbacks de `on_connect`/`on_disconnect` logam diretamente. TODO para substituir pelo módulo de logging.
- **Falha de publicação não é tratada internamente pela classe** — não há fila interna. Responsabilidade do chamador: se `publish` retorna `false`, chama `storage.enqueue_pending_event(msg.topic, msg.payload)`.

**Pendências / TBD:**
- Substituir `std::cerr` pelo módulo de logging.
- Callback `on_publish` pra confirmação explícita de ACK QoS 1 (se o caso de uso evoluir para tracking de entrega por mensagem).
- Suporte a TLS/MQTTS via `tls_set`/`tls_opts_set`. Pro MVP em rede local, plain MQTT basta.
- Autenticação via `username_pw_set` quando Mosquitto for configurado com auth em produção.
- Tuning de `max_inflight_messages_set` se a fila interna da lib virar gargalo.
- Versionamento dos payloads (adicionar `schema_version` no JSON) quando o contrato com backend precisar evoluir sem breaking change.

---

### `src/pipeline/`

**Propósito:** Orquestrador do sistema. Consome `Camera`, `FaceDetector`, `FaceEmbedder`, `Matcher` para reconhecimento, e `Turnstile`, `Buzzer`, `Storage`, `MqttPublisher` para atuação e comunicação. Duas threads internas: loop principal (captura → detect → embed → match → **decide se deduplica** → atua → publica) e loop auxiliar (heartbeat periódico e drainer da fila offline). Não é dono de nenhum componente — recebe referências do `main`.

**Dependências:** stdlib (`<atomic>`, `<chrono>`, `<condition_variable>`, `<iostream>`, `<mutex>`, `<stdexcept>`, `<string>`, `<thread>`, `<utility>`), e todos os outros módulos internos (`domain`, `hardware`, `vision`, `storage`, `mqtt`).

**Arquivos:**

| Arquivo | Conteúdo |
|---|---|
| `pipeline.hpp` | Classe `Pipeline` |
| `pipeline.cpp` | Implementação |
| `pipeline_all.hpp` | Umbrella header |

**API pública:**

```cpp
class Pipeline {
   Pipeline(
       hardware::Camera& camera,
       vision::FaceDetector& detector,
       vision::FaceEmbedder& embedder,
       vision::Matcher& matcher,
       hardware::Turnstile& turnstile,
       hardware::Buzzer& buzzer,
       storage::Storage& storage,
       mqtt::MqttPublisher& publisher,
       std::string device_id,
       int heartbeat_interval_seconds,
       int idle_reset_seconds,
       int unknown_throttle_seconds
   );

   void request_stop();
   void wait();
};
```

Não-copiável e não-móvel.

**Fluxo do loop principal:**
```
frame ← camera.capture()                      → se vazio, sleep 10ms, retry
detection ← detector.detect_best(frame)       → se vazio, sleep 10ms, retry
embedding ← embedder.extract(frame, detection)
   └─ se falha → publica DeviceFault(InferenceFailure), retry
match ← matcher.find_match(embedding)
deduplicação (estado por iteração — ver abaixo)
   ├─ se deve emitir e MATCH → AccessEvent(Granted), turnstile.grant_access()
   ├─ se deve emitir e Unknown → AccessEvent(Unknown), buzzer.beep_denied()
   └─ caso contrário → segue silenciosamente
publica evento (com fallback no storage se desconectado)
```

**Deduplicação de notificações:**

A câmera roda a 30 fps; sem deduplicação, uma pessoa parada na frente da câmera geraria ~180 eventos/minuto. O loop principal mantém estado entre iterações para colapsar isso em eventos significativos:

- `last_status` (`Granted` / `Unknown` / vazio) — última decisão publicada.
- `last_employee` — id do funcionário do último `Granted` publicado.
- `last_face_seen_at` — `steady_clock::time_point` do último frame com detecção.
- `last_unknown_emitted_at` — `steady_clock::time_point` do último `Unknown` publicado.

Regras (avaliadas a cada frame com detecção):

1. **Reset por inatividade**: se `now - last_face_seen_at > idle_reset_seconds` (default 3s), o estado de deduplicação é limpo. A próxima detecção emite evento, mesmo se for a mesma pessoa que passou antes.
2. **Granted**: emite se for a primeira detecção desde o último reset, **OU** se o `employee_id` mudou, **OU** se a última emissão foi `Unknown`. Mesmo funcionário continuando à frente da câmera → silencioso.
3. **Unknown**: emite na primeira detecção / transição a partir de `Granted`, e depois em throttle de `unknown_throttle_seconds` (default 10s). Enquanto um rosto não-reconhecido continua à frente da câmera, emite no máximo um evento a cada N segundos.

Resultado prático: uma pessoa que se aproxima, é reconhecida, e fica parada = 1 evento (`Granted`). Uma pessoa não reconhecida que insiste por 30 segundos = 4 eventos (`Unknown` no t=0, t=10, t=20, t=30). Duas pessoas se revezando = 1 evento por troca.

Os parâmetros vêm do `[recognition]` do `config.toml` via `RecognitionConfig`.

**Fluxo do loop auxiliar (a cada ~1s):**
```
se (now - last_heartbeat >= heartbeat_interval):
   publica Heartbeat, atualiza last_heartbeat
se (publisher.is_connected):
   fetch até 50 pending_events
   para cada: publish; se ok → delete_pending_event; se falha → break
```

**Invariantes e contratos:**
- Construtor dispara as duas threads; a partir daí o pipeline está rodando. Joga em falha rara de criação de thread.
- `request_stop()` é idempotente e thread-safe. Seta atomic + notifica condition_variable.
- `wait()` bloqueia a thread chamadora até alguém chamar `request_stop()`. Contrato: só "dono" chama `wait` — tipicamente a main thread.
- Destrutor chama `request_stop()` + `join()` das duas threads. Bloqueia até elas pararem.
- Pipeline nunca joga exceção a partir dos loops internos — todas as falhas viram `optional`/`bool`/`DeviceFault`. Uma exceção vazando indica bug grave e deve crashar o processo (fail-fast).
- Ordem de shutdown: sinal de stop → threads saem dos loops → `join` termina → destrutor limpa.

**Decisões de projeto:**
- **Duas threads em vez de três** (ou uma): separa o hot path de captura/inferência do trabalho periódico (heartbeat, drainer), sem explodir a complexidade de três threads. Trade-off consciente.
- **RAII** — pipeline ativo ≡ objeto vivo. Sem `start()`/`stop()` explícitos na API. Shutdown via `request_stop()` + destruição natural por escopo no `main`.
- **`condition_variable` no `auxiliary_loop`** para shutdown responsivo — em vez de `sleep_for(1s)` dumb, `wait_for(1s, predicate)` acorda instantaneamente quando `request_stop()` é chamado.
- **`wait()` bloqueia o main thread** via CV. Handler de SIGINT (no main) chama `request_stop()`, CV acorda, `wait()` retorna, destruição por escopo limpa tudo.
- **Dependências por referência** (não ponteiro, não unique_ptr): indica não-ownership, `main` é dono de tudo. Ordem de construção no `main` garante que referências sobrevivem ao pipeline.
- **`DeviceFault` publicado apenas em `InferenceFailure`** no MVP. Falhas de captura (frame vazio) e detecção (sem rosto) são consideradas operação normal, não geram fault.
- **`Denied` mantido no enum de `AccessStatus` mas não emitido** no MVP. Infraestrutura pronta para quando regras de acesso (turnos, bloqueios administrativos) forem implementadas.
- **Helper `try_publish_or_enqueue`** encapsula o padrão "publica ou enfileira no storage" para evitar duplicação nos três pontos onde a gente publica (AccessEvent, Heartbeat, DeviceFault).
- **Distância não reportada em eventos `Unknown`** — o `Matcher::find_match` retorna `nullopt` sem expor a melhor distância encontrada. Trade-off: simplicidade da API vs capacidade de ajustar threshold via analytics. Pendente para v2.
- **Deduplicação no edge, não no backend.** Razão: o backend processa eventos vindo de vários dispositivos e gravar 180 eventos/minuto por pessoa parada infla o banco e os dashboards. Filtrar próximo da fonte reduz tráfego de rede também. Backend recebe apenas transições significativas.
- **Estado de deduplicação só no `main_loop`, não em campo da classe.** Vive como variáveis locais da função porque é estado privado dessa thread; ninguém de fora precisa observar/modificar. Reduz superfície de concorrência.
- **`turnstile.grant_access()` é não-bloqueante**, então o loop principal continua reconhecendo durante os 5s de janela aberta. `buzzer.beep_denied()` ainda bloqueia por `buzzer_beep_ms` (300ms default) — aceitável porque eventos `Unknown` são raros após deduplicação.
- **`steady_clock` para medir intervalos** (heartbeat, deduplicação), `system_clock` para timestamps dos eventos. Separação consciente: steady é monotônico (não anda pra trás), system representa tempo real.
- **Sleeps de 10ms** nas saídas precoces do loop principal (sem frame, sem rosto) para evitar busy-waiting.

**Pendências / TBD:**
- **Retorno da menor distância** do `Matcher::find_match` mesmo em `Unknown` — útil para ajustar threshold com dados reais.
- **Thread separada para `buzzer.beep_denied()`** se a duração do beep ficar significativa — hoje 300ms é tolerável.
- **Publicação de `Denied`** quando regras de acesso forem implementadas (turnos, bloqueios).
- **Substituir `std::cerr`** pelo módulo de logging quando existir.
- **Métricas do pipeline** (fps real, latência de inferência por etapa) como contadores acessíveis externamente (prometheus, etc).
- **Ajuste fino dos defaults de deduplicação** (`idle_reset_seconds=3`, `unknown_throttle_seconds=10`) com base no uso real. Os valores são chutes informados; logs do backend devem dizer se ficaram bons.

---

### `apps/`

**Propósito:** Dois executáveis que consomem as bibliotecas de `src/`. `facegate` é o daemon principal — reconhecimento em tempo real rodando na Raspberry. `enroll` é o CLI de cadastro — ferramenta manual pra registrar funcionários, roda pontualmente (pode rodar no laptop sem GPIO).

**Estrutura:**

```
apps/
├── facegate/
│   └── main.cpp    # daemon de reconhecimento
└── enroll/
   └── main.cpp    # CLI de cadastro
```

Cada executável é um `add_executable()` independente no CMake, linkando somente as libs que precisa.

**Dependências por app:**

| App | Linka |
|---|---|
| `facegate` | `config`, `domain`, `hardware`, `storage`, `vision`, `mqtt`, `pipeline` |
| `enroll` | `config`, `domain`, `hardware`, `storage`, `vision` |

Note que `enroll` **não linka** `mqtt` nem `pipeline` — não precisa. Facilita desenvolvimento e permite cadastro sem broker ou GPIO disponíveis.

#### `apps/facegate/`

**Propósito:** Daemon principal. Parseia args, carrega config, constrói todos os componentes na ordem correta, monta o pipeline, instala signal handler, bloqueia esperando SIGINT/SIGTERM, sai por RAII.

**Uso:**

```
./facegate --config <path/to/config.toml>
```

**Códigos de saída:**
- `0` — shutdown limpo via SIGINT/SIGTERM.
- `1` — erro fatal no boot (config inválido, modelo não encontrado, broker inalcançável, etc).
- `2` — args inválidos (mostra usage e sai).

**Ordem de construção** (no `try`):
1. `load_config(path)` — parse + validação.
2. `ensure_parent_directory(sqlite_path)` — cria diretório se não existir.
3. `Storage(sqlite_path, migrations_path)` — abre banco, aplica schema.
4. `Camera(source, w, h, fps)` — abre stream (IP Webcam ou `/dev/video0`).
5. `Turnstile(chip, servo_pin, servo_open_ms, enabled)` / `Buzzer(chip, buzzer_pin, buzzer_beep_ms, enabled)` — GPIO (ou mock se desabilitado).
6. `FaceDetector(model_path, threads)` / `FaceEmbedder(...)` — carrega ONNX.
7. `storage.load_all_embeddings()` → `Matcher(embeddings, threshold)`.
8. `MqttPublisher(client_id, host, port, keepalive)` — conecta async.
9. `install_signal_handlers()` — intercepta SIGINT, SIGTERM.
10. `Pipeline(...)` — começa a rodar.

**Loop do main:**
```cpp
while (!g_stop_requested.load()) {
   std::this_thread::sleep_for(100ms);
}
pipeline.request_stop();
// destruição por RAII limpa o resto
```

**Signal handler:**

Mínimo async-signal-safe. Só seta o flag atomic `g_stop_requested`. Nada de alocação ou I/O.

**Decisões de projeto:**
- **Parsing manual de args** (não `getopt`, nem lib externa). Único parâmetro obrigatório (`--config`). Lib seria overengineering.
- **Polling de 100ms no `main`** em vez de `pipeline.wait()` com CV. Razão: integração com signal handler é mais simples via atomic global do que via self-pipe trick. Overhead de 100ms no shutdown é imperceptível.
- **Ordem de destruição garantida por RAII** e ordem dos membros. Pipeline sai primeiro (join threads), depois publisher, matcher, detector/embedder, hardware, storage. Sem orquestração manual.
- **`kGpioChipPath = "/dev/gpiochip0"` hardcoded**. Padrão da Raspberry Pi 4. Se virar necessário configurar, vai pro config.toml.
- **`ensure_parent_directory` cria diretório do SQLite automaticamente** via `std::filesystem::create_directories`. Reduz fricção de boot (não precisa operador criar `/var/lib/facegate/` manualmente).
- **Logs de boot verbosos** em `std::cerr` (`facegate: loading config...`, etc). Útil pra diagnosticar falhas no boot. Substitui quando tiver módulo de logging.
- **`const` no `cfg`** documenta intenção (config imutável após load) e permite otimizações.

**Pendências / TBD:**
- **Path do `migrations/schema.sql`** hardcoded relativo ao CWD. Assume execução de `edge/`. Alternativa: adicionar `migrations_path` no config, ou resolver relativo ao binário. Escolhido hardcode pro MVP — menos dependência, mais fricção operacional.
- **Handler para SIGHUP** (tradicional sinal de "reload config"). Hoje é tratado como SIGTERM (sai). Se config muito dinâmica virar necessário, implementa reload sem restart.
- **Pid file** (`/var/run/facegate.pid`) para integração com systemd. Não necessário se o binário rodar sob supervisão de unidade systemd direto.

---

## Hardware setup — servo SG90 na Raspberry Pi 4

Esta seção documenta como o servo motor da catraca é fisicamente conectado à Raspberry Pi 4 Model B e como o software acima o aciona. Quem mexer no GPIO precisa ler antes — fiação errada queima o servo, a Pi, ou ambos.

### Pinagem física

A Pi 4 expõe um conector de 40 pinos. Usamos:

| Função | GPIO (BCM) | Pino físico | Cor de fio típica do SG90 |
|---|---|---|---|
| Sinal PWM do servo | GPIO 17 | pino 11 | laranja / amarelo |
| GND comum | — | pino 6 (ou qualquer GND) | marrom / preto |
| Buzzer (sinal) | GPIO 27 | pino 13 | — |

O número BCM (17) é o que entra em `config.toml` como `gpio.servo_pin`. O pino físico (11) é o que você conta com o dedo no conector. Não confundir — a numeração não casa.

> Referência completa do pinout: https://pinout.xyz/ — ou `pinout` no terminal da Pi.

### Alimentação do servo

**Não alimentar o SG90 pelo pino 5V da Pi.** Em movimento, o SG90 puxa picos de ~500-700 mA. A Pi consegue fornecer isso da regulagem interna, mas a queda transiente de tensão geralmente trava ou reseta a placa.

Esquema correto:

```
                    ┌─────────────────────┐
                    │   Fonte 5V externa  │ (mín. 1A; recomendado 2A)
                    │  (carregador USB,   │
                    │   bateria, fonte    │
                    │   bancada, etc.)    │
                    └────┬────────────┬───┘
                         │ +5V        │ GND
                         │            │
                  ┌──────┴────┐       │
   vermelho do  ──┤  SG90     │       │
   servo (VCC)    │           │       │
                  │           │       │
   marrom do    ──┤  GND      ├───────┤────────┐
   servo (GND)    │           │       │        │
                  │           │       │        │
   laranja do   ──┤  sinal    │       │        │
   servo (PWM)    └───────────┘       │        │
                         │            │        │
                         │            │        │
                         │      ┌─────┴───┐    │
                         │      │  Pi 4   │    │
                         │      │         │    │
                         │      │ GPIO 17 │←───┘
                         │      │ (pino   │
                         │      │  11)    │
                         │      │         │
                         │      │ GND     ├──── liga ao GND comum
                         │      │ (pino 6)│     da fonte externa
                         │      └─────────┘
```

Pontos críticos:

1. **GND comum obrigatório.** O GND da fonte externa **precisa** estar conectado a um GND da Pi (pino 6, 9, 14, 20, 25, 30, 34 ou 39). Sem essa referência comum, o servo "não enxerga" o sinal PWM da Pi e fica tremendo aleatoriamente.
2. **Nunca conectar o +5V externo ao pino 5V da Pi.** Backfeed pode queimar a placa.
3. **Sinal vai direto da GPIO 17 para o fio laranja do servo.** Nada de level shifter — o SG90 aceita lógica de 3.3V sem resistor de série (a maioria das versões).
4. **Capacitor de bypass** (eletrolítico 470µF–1000µF entre +5V e GND do servo, próximo ao motor) é opcional mas reduz ruído elétrico que pode resetar a Pi em movimentos bruscos.

### Sinal PWM gerado pelo software

O `Turnstile` (em `src/hardware/turnstile.cpp`) gera o PWM via software usando `libgpiod` v2:

- **Frequência:** 50 Hz (período de 20.000 µs). Padrão da indústria pra servos hobby.
- **Largura do pulso (aberto):** 2000 µs → posição ~90° (configurável via construtor, parâmetro `open_pulse_us`).
- **Largura do pulso (fechado):** linha em LOW contínuo — servo de-energizado, posição mantida mecanicamente.
- **Duração da janela aberta:** `gpio.servo_open_ms` (default 5000 ms).

O loop fica `wait`-ado num `condition_variable` enquanto fechado (não consome CPU, não envia pulso). Em `grant_access()`, acorda, emite ~250 pulsos durante os 5s (50 Hz × 5s), e volta a dormir com a linha em LOW.

### Calibração da posição angular

Se o SG90 não chegar exatamente nos ângulos certos (fabricantes variam), ajustar `open_pulse_us` no construtor. Range útil seguro do SG90:

| Largura do pulso | Ângulo aproximado |
|---|---|
| 500 µs | 0° (extremo) |
| 1000 µs | ~45° |
| 1500 µs | 90° (centro) |
| 2000 µs | ~135° (default `open`) |
| 2500 µs | 180° (extremo) |

Não passar dos extremos — o servo trava mecanicamente e o motor pode queimar tentando forçar.

### Modo mock (sem hardware)

Em desenvolvimento sem Raspberry, definir `gpio.enabled = false` no `config.toml`. O construtor do `Turnstile` retorna cedo sem abrir o chip GPIO, e `grant_access()` apenas loga `Turnstile: grant_access (mock)` no `std::cerr`. Mesma coisa pro `Buzzer`. Permite rodar o `facegate` em laptop com IP Webcam pra debug.

### Diagnóstico rápido

| Sintoma | Causa provável |
|---|---|
| Servo treme constantemente | GND não comum entre fonte externa e Pi |
| Pi reseta quando o servo move | Servo alimentado pelo 5V da Pi — usar fonte externa |
| Servo não responde a `grant_access` | `gpio.enabled = false` no config, ou pino BCM errado |
| Servo move mas não chega aos 90° | Ajustar `open_pulse_us` (provável que o motor precise de 1800-2200 µs) |
| Servo gira pro lado errado | Trocar `open_pulse_us` para um valor menor que o de fechado (~500-1000 µs) |
| `facegate: failed to request GPIO line` no boot | Outro processo segurando a linha (verificar `gpioinfo`), ou rodar com `sudo` (ou adicionar usuário ao grupo `gpio`) |

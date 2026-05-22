# FaceGateway — Guia de Código (file-by-file)

Documento de referência exaustivo de cada arquivo que contém código no
projeto. Para cada arquivo: o que ele faz, quais funções/classes expõe,
suas assinaturas, e como ele se comunica com os outros arquivos. Leia
isto em paralelo com os arquivos: o objetivo é que, após terminar, você
consiga abrir qualquer arquivo do projeto e saber exatamente o papel
dele e por quem é consumido.

> Recursos relacionados (já existentes no repositório):
> - `README.md` — visão geral, setup do ambiente
> - `edge/DESIGN.md` — racional de design profundo do módulo embarcado (referência primária para o "porquê" das decisões em C++)
> - `docs/Documentacao/` — relatório em prosa por subsistema

---

## 1. Arquitetura macro

Três processos cooperam sobre um banco PostgreSQL e um broker MQTT
Mosquitto:

```
            ┌────────────────────────────────────────────┐
            │                Painel (Ionic/Angular)      │
            │  - Login, dashboard, CRUD de funcionários  │
            │  - Inferência facial em browser (ORT-Web)  │
            │  - Sobe embeddings (vetor 512-d) via HTTPS │
            └──────────────┬─────────────────────────────┘
                           │ REST (JWT)
                           ▼
            ┌────────────────────────────────────────────┐
            │                Backend (Rust/Axum)         │
            │  - /auth, /employees, /embeddings,         │
            │    /analytics, /users, /system             │
            │  - Subscriber MQTT (events/access)         │
            │  - Publisher MQTT (sync/embeddings/upsert) │
            └─────┬────────────────────────────┬─────────┘
                  │ SQL (sqlx + pgvector)      │ MQTT (rumqttc)
                  ▼                            ▼
            ┌──────────────┐         ┌────────────────────┐
            │ PostgreSQL   │         │ Mosquitto (broker) │
            │ + pgvector   │         │                    │
            └──────────────┘         └──────┬─────────────┘
                                            │ MQTT QoS 1
                                            ▼
            ┌────────────────────────────────────────────┐
            │     Edge (Raspberry Pi 4, C++ binário)     │
            │  - apps/facegate (daemon de reconhecimento)│
            │  - apps/enroll   (CLI manual de cadastro)  │
            │  - libs: pipeline, vision, hardware,       │
            │    storage (SQLite), config, domain, mqtt  │
            └────────────────────────────────────────────┘
```

Tópicos MQTT trafegados:
- `facegate/events/access` — edge → backend, evento de catraca (Granted/Unknown)
- `facegate/health/heartbeat` — edge → backend, sinal de vida periódico
- `facegate/health/fault` — edge → backend, falha de infraestrutura
- `facegate/sync/embeddings/upsert/{id}` — backend → edge, sincronização
  do catálogo de embeddings (retained: edge recém-iniciado recebe snapshot)

Dado nunca trafega como imagem facial; apenas o vetor 512-d (ArcFace) circula.

---

## 2. Mapa de pastas

```
.
├── README.md                       # Setup, modelos ONNX, slides, badge CI, testes
├── TODO-Apresentacao-27-05.md      # Roadmap específico para apresentação
├── .env / .env.example             # Variáveis de ambiente (POSTGRES_*, JWT_SECRET, MQTT_*)
├── .github/
│   └── workflows/
│       └── ci.yml                  # 3 jobs paralelos (backend, panel, edge) + coverage
├── infra/                          # Docker stack + migrations Postgres
│   ├── docker-compose.yml          # Postgres (pgvector/pg16) + Mosquitto
│   ├── mosquitto.conf              # Broker config (anônimo, porta 1883)
│   └── migrations/                 # SQL aplicado em primeiro boot do volume
│       ├── 00_init.sql
│       ├── 01_add_direction.sql
│       └── 02_upgrade_to_arcface.sql
├── backend/                        # Rust (Axum + sqlx + rumqttc + JWT)
│   ├── Cargo.toml
│   ├── src/
│   │   ├── lib.rs                  # expõe módulos para os testes de integração
│   │   ├── main.rs
│   │   ├── config.rs
│   │   ├── db.rs
│   │   ├── models/mod.rs
│   │   ├── mqtt/mod.rs
│   │   └── routes/
│   │       ├── mod.rs
│   │       ├── auth.rs
│   │       ├── employees.rs
│   │       ├── embeddings.rs
│   │       ├── users.rs
│   │       ├── analytics.rs
│   │       └── system.rs
│   └── tests/                      # 63 testes — auth, employees, users, embeddings, mqtt_handler, analytics
│       ├── common/mod.rs           # harness (pool, spawn_app, seed helpers)
│       ├── auth.rs / employees.rs / users.rs / embeddings.rs
│       ├── mqtt_handler.rs / analytics.rs
│       └── README.md               # como rodar + cobertura
├── edge/                           # C++ (Raspberry Pi 4)
│   ├── CMakeLists.txt              # opt-in BUILD_TESTING para testes
│   ├── DESIGN.md                   # ⚠ leia para o "porquê" de cada decisão
│   ├── apps/
│   │   ├── facegate/main.cpp       # daemon de reconhecimento
│   │   └── enroll/main.cpp         # CLI de cadastro de rosto
│   ├── src/
│   │   ├── domain/                 # types.hpp, employee.hpp, embedding.hpp, ...
│   │   ├── config/                 # config.{hpp,cpp}
│   │   ├── hardware/               # camera, turnstile, buzzer
│   │   ├── storage/                # SQLite (cache + fila offline)
│   │   ├── vision/                 # face_detector, face_embedder, matcher, onnx_session
│   │   ├── mqtt/                   # publisher, subscriber, serialization, topics
│   │   └── pipeline/               # pipeline.{hpp,cpp} (orquestrador)
│   └── tests/                      # 39 testes — matcher, serialization, storage, config
│       ├── CMakeLists.txt
│       ├── matcher_test.cpp / serialization_test.cpp / storage_test.cpp / config_test.cpp
│       └── README.md
└── panel/                          # Ionic + Angular (PWA admin)
    ├── angular.json, package.json, capacitor.config.ts ...
    ├── karma.conf.js               # launcher ChromeHeadlessCI para o CI
    └── src/
        ├── main.ts, polyfills.ts, zone-flags.ts
        ├── environments/
        ├── theme/variables.scss
        └── app/
            ├── app.component.ts, app.routes.ts, app.config.ts
            ├── TESTING.md          # guia da suíte do painel (54 testes)
            ├── core/               # versão "nova" — usar nas novas features
            │   ├── api/            # serviços HTTP (1 arquivo por endpoint) + *.spec.ts
            │   ├── auth/           # AuthService, guard, interceptor + *.spec.ts
            │   ├── models/         # DTOs/interfaces espelhando o backend
            │   └── vision/         # FaceEmbeddingService (ORT-Web)
            ├── features/           # páginas "novas"
            │   ├── login/, dashboard/, employees/, employee-detail/
            │   ├── enrollment/, events/, reports/, settings/
            ├── shared/             # employee-card, event-card, stat-card
            │
            ├── home/, login/, cadastro/, dashboard/, perfil/   # versão "legada" + *.spec.ts
            ├── employees/, employee-card/, event-card/        # legado + *.spec.ts
            └── analytics/                                     # legado
```

> **Convivência de pastas legadas e novas no painel:**
> O `panel/src/app/` tem duas gerações. A "legada" (rotas `/home`,
> `/login`, `/cadastro`, `/dashboard`, `/perfil` em `app.routes.ts`)
> está em uso e é o que o app atualmente serve. A "nova" em `core/` +
> `features/` é a base para a próxima iteração (login com Reactive
> Forms, signals, dashboard com ECharts, cadastro facial via ONNX no
> browser, etc.) mas ainda **não foi ligada às rotas** — `app.routes.ts`
> só importa as páginas legadas. Quando entrar em uso, `app.routes.ts`
> e `main.ts` devem migrar para `app.config.ts` (que já registra o
> interceptor novo, ECharts core, etc.).

---

## 3. EDGE — C++ (Raspberry Pi 4)

Convenções (ver `edge/DESIGN.md` para racional completo):
- C++17, GCC 12+, CMake. Cada pasta de `src/` vira uma biblioteca estática
  (`facegate_<modulo>`); cada `apps/<bin>` linka somente o que precisa.
- Headers (`.hpp`) e implementação (`.cpp`) ficam no mesmo diretório.
- Tudo dentro de `namespace facegate::<modulo>`.
- Classes que possuem recursos físicos ou conexões são **não-copiáveis e
  não-móveis** (cópia/move = `delete`), construídas no `main` e passadas
  por referência (sem ponteiros, sem `unique_ptr` — `main` é o dono).

### 3.1 `edge/CMakeLists.txt`
- Cria seis bibliotecas estáticas (`facegate_domain` é INTERFACE, só
  expõe includes; as outras são `STATIC`).
- Resolve dependências externas via `find_package` (OpenCV, tomlplusplus,
  SQLiteCpp, nlohmann_json, Threads) e `pkg_check_modules` (libgpiod,
  libonnxruntime, libmosquittopp).
- Define dois executáveis em `apps/`:
  - `facegate` linka **todas** as libs (config, domain, hardware,
    storage, vision, mqtt, pipeline).
  - `enroll` linka apenas config, domain, hardware, storage, vision
    (sem mqtt nem pipeline — roda offline, mesmo em laptop sem GPIO).

### 3.2 `edge/src/domain/` (header-only, sem `.cpp`)

Vocabulário compartilhado. Zero dependências externas; só stdlib.

| Arquivo | Define | Observações |
|---|---|---|
| `types.hpp` | `EmployeeId` (`std::int64_t`), `Timestamp` (`std::chrono::system_clock::time_point`) | Tempo sempre UTC na serialização |
| `employee.hpp` | `Employee { EmployeeId id; std::string name; }` | |
| `embedding.hpp` | `EMBEDDING_DIM=512`, `EmbeddingVector = std::array<float, 512>`, `Embedding { std::int64_t id; EmployeeId owner; EmbeddingVector vector; }` | `id != 0` indica embedding que veio do backend (sync); `id == 0` é local. Vetores assumem L2-normalizados. |
| `match.hpp` | `Match { EmployeeId employee; float distance; }`, `MatchResult = std::optional<Match>` | `MatchResult` vazio = rosto desconhecido |
| `events.hpp` | `enum AccessStatus { Granted, Denied, Unknown }`, `AccessEvent`, `enum FaultKind { CameraFailure, InferenceFailure, StorageFailure, Other }`, `DeviceFault`, `Heartbeat` | `AccessEvent.employee` preenchido se e só se `status ∈ {Granted, Denied}` |
| `domain.hpp` | Umbrella — inclui todos | Todos os outros módulos incluem `domain/domain.hpp` |

### 3.3 `edge/src/config/`

Carrega `config.toml` no boot e devolve uma struct validada.

**`config.hpp`** — declara as structs (uma por seção: `VisionConfig`,
`CameraConfig`, `GpioConfig`, `RecognitionConfig`, `StorageConfig`,
`MqttConfig`, `LoggingConfig`) agregadas em `Config`. Função pública:

```cpp
namespace facegate::config {
    Config load_config(const std::filesystem::path& path);
}
```

**`config.cpp`** — implementa `load_config` em três passos:
1. Parsing por seção (uma função interna `parse_<section>` por struct)
   usando `toml++`. Defaults sensatos por campo (porta 1883, 640×480@30fps,
   log level `info`); sentinelas para campos sem default (`""` em strings
   obrigatórias, `-1` em pinos GPIO).
2. Seção ausente → exceção fatal. Campo ausente dentro de seção presente
   → default aplicado.
3. `validate(Config&)` checa invariantes (threshold ∈ [0, 2], pinos
   distintos, porta MQTT em [1, 65535], etc.) e joga `std::runtime_error`
   com mensagem `"Config: <seção>.<campo> <razão>"` na primeira falha.

**Consumidores:** `apps/facegate/main.cpp` e `apps/enroll/main.cpp`. Cada
módulo recebe apenas a sub-struct que precisa por referência.

### 3.4 `edge/src/hardware/`

Encapsula recursos físicos em classes RAII. Construtor jogue
`std::runtime_error` se o setup falhar; métodos de runtime
**não jogam** — falham silenciosamente ou retornam `std::nullopt`.

**`camera.hpp` / `camera.cpp`** — `class Camera`
```cpp
Camera(const std::string& source, int width, int height, int fps);
std::optional<cv::Mat> capture();   // último frame clonado, ou nullopt
```
- Thread interna (`capture_loop`) faz `cap.read(...)` num loop infinito
  sobrescrevendo um único slot protegido por `frame_mutex_`. `capture()`
  retorna **sempre o frame mais recente clonado** (latência ≤ 1 frame,
  sem acumulação).
- Destrutor: ordem rígida — `stop_=true` → `join` → liberar
  `cv::VideoCapture`. Inverter qualquer um dos dois últimos causa UB ou
  deadlock.

**`turnstile.hpp` / `turnstile.cpp`** — `class Turnstile`
```cpp
Turnstile(const char* chip_path, int line_offset, int open_hold_ms,
          bool enabled, int open_pulse_us = 2000);
void grant_access();   // não-bloqueante
```
- Software PWM 50 Hz via `libgpiod` v2, com PIMPL (`struct Impl` esconde
  `<gpiod.h>`).
- `grant_access()` apenas bumpa `open_until_` (timestamp `steady_clock`)
  e notifica a condvar; pode ser chamado a 30 fps sem efeito adverso.
  Re-trigger durante a janela aberta **estende** o `open_until_`, nunca
  reinicia o ciclo abre/fecha (evitaria queimar o SG90).
- Fora da janela aberta a linha fica em LOW e o servo de-energizado
  (depende de viés mecânico/gravidade para manter posição fechada).
- Modo mock: `enabled=false` → construtor retorna cedo; `grant_access`
  só loga `std::cerr`. Permite rodar em laptop sem GPIO.

**`buzzer.hpp` / `buzzer.cpp`** — `class Buzzer`
```cpp
Buzzer(const char* chip_path, int line_offset, int beep_ms, bool enabled);
void beep_denied();   // BLOQUEIA por beep_ms
```
- Diferente do `Turnstile`, `beep_denied()` bloqueia. Mantido bloqueante
  porque `unknown` é raro após deduplicação no `Pipeline` (300ms tolerável).
  Documentado em DESIGN.md como TBD migrar para thread separada.

**`hardware.hpp`** — umbrella que inclui os três.

**Consumidores:** `pipeline.cpp` (todos), `apps/enroll/main.cpp` (só
`Camera`).

### 3.5 `edge/src/storage/`

Persistência local em SQLite. Cache de embeddings + fila offline de
mensagens MQTT pendentes. Mutex interno serializa todo acesso.

**`storage.hpp`** — `struct PendingEvent` e `class Storage`. Métodos:
```cpp
Storage(const std::string& db_path, const std::string& migrations_path);

// Cache de embeddings (usado por Matcher no boot, e pelo enroll/sync MQTT)
std::vector<domain::Embedding> load_all_embeddings();
void insert_embedding(const domain::Embedding& embedding);
void delete_employee_embeddings(domain::EmployeeId employee_id);

// Sync com backend (usado por mqtt::MqttSubscriber em retained messages)
void upsert_embedding(const domain::Embedding& embedding);  // exige id != 0
void delete_embedding(std::int64_t embedding_id);

// Fila offline (usado por Pipeline quando publish falha)
void enqueue_pending_event(const std::string& topic, const std::string& payload);
std::vector<PendingEvent> fetch_pending_events(int limit);  // FIFO por id
void delete_pending_event(std::int64_t id);
```

- Schema vem de arquivo `.sql` externo (`migrations/schema.sql` relativo
  ao CWD, não confundir com `infra/migrations/` do backend).
- Embeddings armazenados como BLOB de tamanho fixo
  (`EMBEDDING_DIM * sizeof(float)` = 2048 bytes). Tamanho diferente na
  leitura → exceção (indica corrupção).
- Timestamps gravados como epoch ms (`INTEGER`).
- Construtor aplica schema idempotentemente
  (`CREATE … IF NOT EXISTS`). Joga `std::runtime_error` em qualquer falha.
- Métodos públicos jogam em falha do SQLite (storage **não silencia**,
  diferente de hardware/vision).

### 3.6 `edge/src/vision/`

Pipeline de visão computacional. ONNX Runtime carrega BlazeFace (detecção
de rosto) e ArcFace (embedding de 512-d). Tudo BGR/cv::Mat na fronteira.

**`types.hpp`** — `BBox { x, y, width, height }`, `Keypoint { x, y }`,
`Keypoints = std::array<Keypoint, 6>`, `Detection { BBox bbox; Keypoints
keypoints; float score; }`, `NUM_KEYPOINTS = 6`.

**`onnx_session.hpp` / `onnx_session.cpp`** — wrapper interno sobre
`Ort::Session` (não exportado no umbrella). Reutilizado por
`FaceDetector` e `FaceEmbedder` para esconder ONNX Runtime e evitar
duplicar o setup. `TensorView` retornado por `run()` é válido até a
próxima chamada de `run()` da mesma sessão (consumidor copia antes de
re-rodar).

**`face_detector.hpp` / `face_detector.cpp`** — `class FaceDetector`
```cpp
FaceDetector(const std::string& model_path, int num_threads,
             float conf_threshold = 0.5f, float iou_threshold = 0.3f);
std::optional<Detection> detect_best(const cv::Mat& frame_bgr);
```
- BlazeFace aceita RGB 128×128 normalizado em [0, 1]. Conversão BGR→RGB
  + resize + escala interna ao método.
- BlazeFace já inclui NMS embutido; `detect_best` simplesmente pega a
  primeira detecção (maior score). Retorna `nullopt` se nenhum rosto
  passa o threshold.
- BBox retornada em **pixels da imagem original** (não normalizada).

**`face_embedder.hpp` / `face_embedder.cpp`** — `class FaceEmbedder`
```cpp
FaceEmbedder(const std::string& model_path, int num_threads);
std::optional<domain::EmbeddingVector> extract(const cv::Mat& frame_bgr,
                                                const Detection& detection);
```
- ArcFace aceita RGB 112×112 normalizado por `(p - 127.5) / 128`, NHWC.
- Recorta o bbox da imagem original, pré-processa, infere, **normaliza
  L2** o vetor de 512-d antes de retornar. Consumidores assumem
  embeddings normalizados (Matcher depende disso).
- Sem alinhamento facial via keypoints (TBD do MVP).

**`matcher.hpp` / `matcher.cpp`** — `class Matcher`
```cpp
Matcher(std::vector<domain::Embedding> cache, float threshold);
domain::MatchResult find_match(const domain::EmbeddingVector& query) const;
std::optional<float> best_distance(const domain::EmbeddingVector& query) const;
std::size_t cache_size() const noexcept;

// chamadas pelo MqttSubscriber em sync de embeddings
void upsert(const domain::Embedding& embedding);
void remove(std::int64_t embedding_id);
```
- Cache in-memory + `std::mutex` (`mutable`) sincroniza leituras
  (`find_match`) com escritas (`upsert`/`remove`). Várias threads de
  leitura podem coexistir.
- `find_match` faz distância de cosseno linear O(n), retorna o melhor
  match se `distance < threshold`; senão `nullopt`. Threshold vive
  dentro do Matcher — chamador não decide.

**`vision.hpp`** — umbrella (não exporta `OnnxSession`).

### 3.7 `edge/src/mqtt/`

Conexão com o broker. Separa **serialização** (funções livres puras) do
**transporte** (classes com `mosqpp::mosquittopp` no PIMPL).

**`topics.hpp`** — constantes `kAccessEvent`,  `kHeartbeat`,
`kDeviceFault` no namespace `facegate::mqtt::topics`.

**`serialization.hpp` / `serialization.cpp`** — funções livres
`serialize(...)` overloaded por tipo de domínio:
```cpp
struct SerializedMessage { const char* topic; std::string payload; };

SerializedMessage serialize(const domain::AccessEvent&);
SerializedMessage serialize(const domain::Heartbeat&, const std::string& device_id);
SerializedMessage serialize(const domain::DeviceFault&, const std::string& device_id);
```
- JSON compacto via `nlohmann::json`. Timestamps como epoch ms (int64).
  Enums serializados como string lowercase. `device_id` é injetado pelo
  caller (não está nos tipos de domínio).

**`mqtt_publisher.hpp` / `mqtt_publisher.cpp`** — `class MqttPublisher`
```cpp
MqttPublisher(const std::string& client_id, const std::string& broker_host,
              int broker_port, int keepalive_seconds);

bool publish(const SerializedMessage& message);   // nunca joga
bool is_connected() const noexcept;
```
- PIMPL onde `Impl` herda de `mosqpp::mosquittopp` (padrão de callbacks
  virtuais). `loop_start()` cria thread interna na libmosquitto.
- QoS 1, `retained=false`, reconexão automática com backoff
  exponencial (1–30s).
- Falha de publish → caller é responsável por enfileirar no `Storage`.

**`mqtt_subscriber.hpp` / `mqtt_subscriber.cpp`** — `class MqttSubscriber`
```cpp
MqttSubscriber(const std::string& client_id, const std::string& broker_host,
               int broker_port, int keepalive_seconds,
               storage::Storage& storage,
               vision::Matcher& matcher);
bool is_connected() const noexcept;
```
- Subscreve em `facegate/sync/embeddings/upsert/+`. Cada mensagem tem o
  `embedding_id` no topic suffix.
- Payload vazio = tombstone → `storage.delete_embedding(id)` +
  `matcher.remove(id)`.
- Payload JSON = upsert → parse, valida tamanho do vetor (512),
  `storage.upsert_embedding(...)` + `matcher.upsert(...)`.
- `clean_session=false` + `client_id` estável: broker mantém fila de
  retained messages enquanto o Pi está fora do ar; ao reconectar, o edge
  recebe o estado completo do catálogo.

### 3.8 `edge/src/pipeline/`

Orquestrador. **Não é dono** de nenhum componente; recebe tudo por
referência do `main`.

**`pipeline.hpp` / `pipeline.cpp`** — `class Pipeline`
```cpp
Pipeline(hardware::Camera&, vision::FaceDetector&, vision::FaceEmbedder&,
         vision::Matcher&, hardware::Turnstile&, hardware::Buzzer&,
         storage::Storage&, mqtt::MqttPublisher&,
         std::string device_id, int heartbeat_interval_seconds,
         int idle_reset_seconds, int unknown_throttle_seconds);
void request_stop();
void wait();
```
- Construtor dispara duas threads:
  - **`main_loop`**: hot path. Captura frame → detecta → extrai
    embedding → match → **deduplicação** → atua (`grant_access` ou
    `beep_denied`) → publica `AccessEvent` (com fallback no `Storage` se
    desconectado).
  - **`auxiliary_loop`**: a cada ~1s, publica `Heartbeat` periódico e
    drena até 50 `pending_events` se reconectado.
- Deduplicação no `main_loop` (estado local da função, não da classe):
  reduz ~180 eventos/min (pessoa parada, 30 fps) para 1 evento. Regras:
  1. Reset de estado se `last_face_seen_at` é antigo (> `idle_reset_seconds`).
  2. `Granted` emitido na transição (primeira detecção, troca de pessoa,
     ou vinha de Unknown). Mesma pessoa parada → silêncio.
  3. `Unknown` emitido na transição + em throttle de `unknown_throttle_seconds`.
- Shutdown:
  `request_stop()` → atomic + condvar → loops saem → `~Pipeline` chama
  `join()` nas duas threads. Quem é dono (main) chama `request_stop` via
  signal handler.

**`pipeline_all.hpp`** — umbrella.

### 3.9 `edge/apps/`

**`apps/facegate/main.cpp`** — daemon principal. Uso:
```
./facegate --config <path/to/config.toml>
```
Códigos de saída: 0 (shutdown limpo), 1 (erro fatal de boot), 2 (args inválidos).

Funções/símbolos locais (anônimo namespace):
- `std::atomic<bool> g_stop_requested` — flag levantado pelo handler.
- `void signal_handler(int)` — async-signal-safe: só seta a flag.
- `void install_signal_handlers()` — registra SIGINT/SIGTERM.
- `void print_usage(const char*)` — imprime ajuda no stderr.
- `std::string parse_config_path(int, char**)` — parser manual (sem
  `getopt`).
- `void ensure_parent_directory(const std::string&)` — cria diretório do
  SQLite com `std::filesystem::create_directories` (responsabilidade do
  `main`, não do `Storage`).
- `constexpr const char* kGpioChipPath = "/dev/gpiochip0"` — hardcoded
  para Pi 4.

Ordem de construção dentro do `try`:
1. `config::load_config(path)`  → 2. `ensure_parent_directory` → 3. `Storage` →
4. `Camera` → 5. `Turnstile`/`Buzzer` → 6. `FaceDetector`/`FaceEmbedder` →
7. `storage.load_all_embeddings()` + `Matcher` → 8. `MqttPublisher` →
9. `MqttSubscriber` (`client_id + "-sync"` para não colidir no broker) →
10. `install_signal_handlers` → 11. `Pipeline`.

Main bloqueia em loop polling de 100ms até `g_stop_requested`. Destruição
por RAII na ordem inversa.

**`apps/enroll/main.cpp`** — CLI de cadastro manual. Uso:
```
./enroll --config <path> --employee-id <id> [--photos N] [--append]
```
- Por padrão `--photos=5`. Sem `--append`, apaga embeddings prévios do
  funcionário antes de cadastrar.
- Funções locais: `struct Args`, `parse_args(int, char**)` retorna
  `std::optional<Args>` (manual, sem lib), `ensure_parent_directory`
  (cópia local), `wait_for_enter()`.
- Loop: aguarda Enter → `camera.capture()` → `detector.detect_best` →
  `embedder.extract` → monta `domain::Embedding` (com `id=0`, owner =
  employee_id passado, vector = saída do embedder) → `storage.insert_embedding`.
- **Não linka MQTT nem pipeline.** Pode rodar em laptop sem GPIO.

---

## 4. BACKEND — Rust (Axum + sqlx + rumqttc + JWT)

### 4.1 `backend/Cargo.toml`
Edition 2024. Dependências chave:
- `axum 0.7` (HTTP, com feature `multipart`)
- `tokio 1` (runtime async, `full`)
- `sqlx 0.7` (Postgres + chrono + tls-rustls)
- `pgvector 0.3` (tipo `Vector` mapeável para `vector(N)` do pgvector)
- `rumqttc 0.24` (cliente MQTT)
- `jsonwebtoken 9` (JWT HS256)
- `sha2 0.11` (hash de senha SHA-256 — TODO migrar para argon2)
- `tower-http 0.5` (CORS, ServeDir)
- `dotenvy 0.15` (lê `.env`)
- `tracing` + `tracing-subscriber` (logs)
- `chrono`, `serde`, `serde_json`, `thiserror`, `anyhow`, `uuid`

### 4.2 `backend/src/main.rs`
```rust
#[tokio::main]
async fn main() -> Result<()>
```
Sequência:
1. `tracing_subscriber` com filtro `backend=debug` por padrão.
2. `dotenvy::dotenv().ok()` carrega `.env` (não é erro se não existe).
3. `config::Config::from_env()` valida envvars.
4. `db::connect(&config.database_url)` cria pool sqlx (max 10 conexões).
5. `mqtt::start_subscriber(pool, host, port)` retorna
   `(MqttStateHandle, AsyncClient)` — conecta sincronicamente e dispara
   task de polling.
6. CORS: `tower-http` libera origin `http://localhost:8100` (Ionic dev),
   métodos GET/POST/PATCH/DELETE/OPTIONS, headers `Any`.
7. `routes::create_router(...)` monta o `Router` com `AppState` injetado.
8. `axum::serve` em `0.0.0.0:<SERVER_PORT>`.

### 4.3 `backend/src/config.rs`
```rust
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub mqtt_host: String,
    pub mqtt_port: u16,
    pub server_port: u16,
}
impl Config { pub fn from_env() -> Result<Self> { ... } }
```
- `DATABASE_URL` e `JWT_SECRET` são obrigatórias; falha com mensagem em
  português via `anyhow::Context`.
- `MQTT_HOST` (default `localhost`), `MQTT_PORT` (default `1883`),
  `SERVER_PORT` (default `3000`) são opcionais.

### 4.4 `backend/src/db.rs`
```rust
pub async fn connect(database_url: &str) -> Result<PgPool>
```
Pool sqlx com `max_connections(10)`. Reutilizado por todas as rotas.

### 4.5 `backend/src/models/mod.rs`
Define o struct `Employee` espelhando a tabela. Hoje só `Employee` mora
aqui; outros modelos vivem ao lado das rotas que os usam (decisão
explícita de proximidade — ver `EventRow` em `analytics.rs`, `UserRow` em
`users.rs`).
```rust
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Employee {
    pub id: i32,
    pub name: String,
    pub shift: Option<String>,   // 'manhã' | 'tarde' | 'noite' | null
    pub created_at: DateTime<Utc>,
}
```

### 4.6 `backend/src/mqtt/mod.rs`
**Subscriber MQTT** + cliente compartilhado para publicar sync.

Constantes:
- `CLIENT_ID = "facegate-backend"`
- `TOPIC_ACCESS = "facegate/events/access"`
- `TOPIC_HEALTH = "facegate/health/#"`

Tipos:
```rust
pub struct MqttState {
    pub connected: bool,
    pub last_message_at_ms: Option<i64>,
}
pub type MqttStateHandle = Arc<RwLock<MqttState>>;

#[derive(Deserialize)]
struct AccessEvent {
    timestamp_ms: i64,
    status: String,                 // "granted" | "unknown"
    employee_id: Option<i32>,
    distance: Option<f64>,
    device_id: Option<String>,
    direction: String,              // default "in"
}
```

Funções:
- `pub async fn start_subscriber(pool, host, port) -> Result<(MqttStateHandle, AsyncClient)>`
  - `clean_session=false` + client_id estável → broker enfileira mensagens
    QoS 1 enquanto o backend está fora; "nenhum evento perdido".
  - Faz SUBSCRIBE em `TOPIC_ACCESS` e `TOPIC_HEALTH`, depois `tokio::spawn(run_loop(...))`.
- `async fn run_loop(pool, EventLoop, MqttStateHandle)` — polling
  infinito. ConnAck → flag `connected=true`; Publish → atualiza
  `last_message_at_ms` + dispatcha; Err → flag `false`, sleep 5s.
- `async fn handle_publish(pool, topic, payload)` — para `TOPIC_ACCESS`
  desserializa o JSON, valida `status ∈ {granted, unknown}` e
  `direction ∈ {in, out}`, faz INSERT em `access_events`. Para
  `facegate/health/#` apenas loga (heartbeat é trabalho futuro). Outros
  tópicos são debug-logados.
- `fn now_ms() -> i64`.

### 4.7 `backend/src/routes/mod.rs`
```rust
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: String,
    pub mqtt: MqttStateHandle,
    pub mqtt_client: AsyncClient,
}
pub fn create_router(pool, jwt_secret, mqtt, mqtt_client) -> Router
async fn health() -> &'static str   // "ok"
```
Mapeia rotas:
- Públicas: `GET /health`, `POST /auth/login`.
- Estáticas: `nest_service("/models", ServeDir::new("../edge/models"))` —
  serve `blaze.onnx` e `arc.onnx` para o painel rodar inferência em browser.
- Protegidas (via `Claims` extractor — basta o handler aceitar `Claims`
  como parâmetro): `/employees`, `/employees/:id`, `/employees/:id/embeddings`,
  `/users`, `/system/mqtt-status`, `/analytics/*`.

### 4.8 `backend/src/routes/auth.rs`
Constantes: `TOKEN_TTL_SECS = 60 * 60 * 8` (8h).

Tipo central:
```rust
#[derive(Serialize, Deserialize)]
pub struct Claims { pub sub: i32; pub email: String; pub exp: usize; }
```

Extractor:
```rust
#[axum::async_trait]
impl FromRequestParts<AppState> for Claims {
    type Rejection = (StatusCode, &'static str);
    async fn from_request_parts(...) -> Result<Self, Self::Rejection>
}
```
- Lê header `Authorization`, valida prefixo `Bearer `, decodifica o JWT
  com `state.jwt_secret`. Qualquer falha → 401.
- **Convenção do projeto:** qualquer handler que recebe `Claims` como
  parâmetro é automaticamente protegido (rejection é 401 antes do corpo
  do handler rodar).

Handler:
```rust
pub async fn login(State<AppState>, Json<LoginRequest>)
    -> Result<Json<LoginResponse>, (StatusCode, &'static str)>
```
- Hash da senha em SHA-256 hex (combina com o seed do admin no `00_init.sql`).
- Um único SELECT que busca por `email AND password_hash` — não vaza qual
  dos dois estava errado. Falha → 401 genérico.
- Sucesso → cria `Claims` com expiry agora+8h, assina HS256.

### 4.9 `backend/src/routes/employees.rs`
Constantes: `SYNC_UPSERT_PREFIX = "facegate/sync/embeddings/upsert"`.

Tipos:
- `CreateEmployee { name: String, shift: Option<String> }`
- `UpdateEmployee { name: Option<String>, shift: Option<Option<String>> }`
  — o `Option<Option<T>>` distingue "campo ausente" (manter) de "campo
  explicitamente `null`" (limpar), via deserializador customizado
  `double_option`.

Helper privado:
- `async fn publish_embedding_tombstone(client, embedding_id)` — publica
  payload vazio retained em `facegate/sync/embeddings/upsert/{id}` para
  notificar os edges a apagar.

Handlers (todos recebem `_claims: Claims` ⇒ auth obrigatória):
- `GET /employees` → `list` — `SELECT … ORDER BY name`.
- `GET /employees/:id` → `get_one` — 404 se ausente.
- `POST /employees` → `create` — valida nome não-vazio.
- `PATCH /employees/:id` → `update` — read-modify-write em memória,
  depois UPDATE com os valores finais. Suporta `shift = null`
  explicitamente.
- `DELETE /employees/:id` → `delete` — antes do DELETE, coleta os
  `embedding_ids` (que serão cascateados pelo FK). Após DELETE bem
  sucedido (204), publica tombstone para cada embedding. Sincronização
  best-effort: falha de publish é logada mas não falha o request.

### 4.10 `backend/src/routes/embeddings.rs`
Constante: `EMBEDDING_DIM = 512`, `SYNC_UPSERT_PREFIX` idem.

Tipos:
- `CreateEmbedding { vector: Vec<f32> }` (request)
- `EmbeddingResponse { id, vector, created_at }` (response)
- `EmbeddingRow { id, vector: pgvector::Vector, created_at }` (DB row)
- `EmbeddingSyncMsg<'a>` (payload MQTT)

Helper:
- `async fn publish_embedding_upsert(client, embedding_id, employee_id, vector, created_at)`
  — publica retained `facegate/sync/embeddings/upsert/{id}` com JSON
  `{ embedding_id, employee_id, vector, created_at_ms }`. Best-effort.

Handlers:
- `POST /employees/:id/embeddings` → `create` — valida `vector.len() == 512`,
  INSERT, captura FK violation → 404. Após sucesso, publica sync.
- `GET /employees/:id/embeddings` → `list` — primeiro EXISTS-check do
  funcionário (404 se ausente), depois SELECT ordenado por `created_at DESC`.

> ⚠ O backend **nunca recebe imagens faciais.** A extração de embedding
> acontece no painel (browser, via `onnxruntime-web`) ou no edge.

### 4.11 `backend/src/routes/users.rs`
Auth de operadores do painel. Single-tier (qualquer user logado pode
listar/criar — RBAC fica para depois).

Tipos:
- `UserRow { id, email, created_at }`
- `CreateUser { email, password }`

Handlers:
- `GET /users` → `list` — `ORDER BY created_at`.
- `POST /users` → `create` — valida email/password mínimos, hash SHA-256
  hex, INSERT. Constraint UNIQUE → 409.

Helper privado: `sha256_hex(&[u8]) -> String`.

### 4.12 `backend/src/routes/analytics.rs`
Constante: `TZ = "America/Sao_Paulo"`. Todo agrupamento por hora/DOW é
feito em SP local time (sem isso, eventos das 21h–23h59 SP cairiam no
"amanhã" em UTC).

Todos os handlers recebem `_claims: Claims`.

Endpoints e seus tipos:

| Rota | Handler | Tipo de resposta |
|---|---|---|
| `GET /analytics/access-by-hour` | `access_by_hour` | `Vec<HourCount { hour, count }>` — sempre 24 itens (zero-fill no Rust) |
| `GET /analytics/events?employee_id&status&from&to&limit&offset` | `events` | `Vec<EventRow { id, employee_name?, status, distance?, timestamp_ms }>` — `LEFT JOIN employees`, `limit` clamp 1..=200, default 50 |
| `GET /analytics/avg-delay` | `avg_delay` | `Vec<AvgDelay { employee_id, name, avg_delay_minutes, days_observed }>` — CTE: `first_per_day` + `delays` (turno→horário hardcoded em SQL `CASE`) |
| `GET /analytics/presence-heatmap` | `presence_heatmap` | `Vec<HeatmapCell { day (DOW), hour, count }>` — sparse, frontend zera as células ausentes |
| `GET /analytics/present-today` | `present_today` | `Vec<PresentEmployee { employee_id, name, last_entry_ms }>` — CTE `today_in` vs `today_out`, retém quem entrou e não saiu |
| `GET /analytics/summary-today` | `summary_today` | `SummaryToday { total, granted, unknown }` |

### 4.13 `backend/src/routes/system.rs`
```rust
pub async fn mqtt_status(_claims: Claims, State<AppState>) -> Json<MqttState>
```
Snapshot do `MqttStateHandle` (lock só durante o clone). Frontend `settings`
faz poll de 10s.

---

## 5. INFRA — Docker + PostgreSQL + Mosquitto

### 5.1 `infra/docker-compose.yml`
- Serviço `postgres` — imagem `pgvector/pgvector:pg16`, exposto em 5432.
  Volumes: `pgdata:/var/lib/postgresql/data`, `./migrations:/docker-entrypoint-initdb.d`
  (migrations só rodam no **primeiro boot** do volume).
- Serviço `mosquitto` — `eclipse-mosquitto:2`, exposto em 1883. Volume
  `./mosquitto.conf` → broker config. Dados/logs em volumes `mqttdata` e
  `mqttlogs`.

### 5.2 `infra/mosquitto.conf`
Configuração mínima: aceita conexões anônimas na porta 1883 (modo MVP
sem TLS nem auth).

### 5.3 `infra/migrations/00_init.sql`
- Habilita extensão `vector` (pgvector).
- Cria `employees(id SERIAL, name TEXT NOT NULL, shift TEXT, created_at TIMESTAMPTZ)`.
  Índice `idx_employees_name`.
- Cria `access_events(id, employee_id REFERENCES employees ON DELETE SET NULL,
  status CHECK in granted/unknown, distance, timestamp_ms BIGINT, device_id,
  created_at)`. Três índices: `timestamp_ms DESC`, `employee_id`, `status`.
- Cria `users(id, email UNIQUE, password_hash, created_at)`. Seed do admin
  default: `admin@facegate.local` / `admin123` (hash SHA-256 hex).
- Cria `embeddings(id, employee_id REFERENCES employees ON DELETE CASCADE,
  vector vector(128), created_at)`. Política CASCADE distinta dos eventos
  (embeddings são dado pessoal; eventos são audit log).

### 5.4 `infra/migrations/01_add_direction.sql`
Adiciona coluna `direction TEXT NOT NULL DEFAULT 'in' CHECK in ('in', 'out')`
em `access_events` + índice. `IF NOT EXISTS` para idempotência. Edge ainda
não publica direction, então o default vale.

### 5.5 `infra/migrations/02_upgrade_to_arcface.sql`
- `TRUNCATE TABLE embeddings` (vetores 128-d do MobileFaceNet são
  matematicamente incompatíveis com 512-d do ArcFace).
- `ALTER TABLE embeddings ALTER COLUMN vector TYPE vector(512)`.

---

## 6. PANEL — Ionic + Angular

> Aviso: existem **duas gerações** convivendo. Ver §2 acima. Esta seção
> documenta as duas — a legada (atualmente roteada) e a nova
> (`core/` + `features/`, base para a próxima iteração).

### 6.1 Bootstrap, configuração, ambiente

#### `panel/src/main.ts`
```ts
bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptors([authInterceptor])),  // <- core/auth/auth.interceptor
  ],
});
```
Entry-point efetivo do bundle. Após a consolidação do auth (ver
`core/auth/auth.service.ts`), aponta para o interceptor de
`core/auth/auth.interceptor.ts`. O bootstrap alternativo via
`app.config.ts` continua presente para uma migração futura para
`bootstrapApplication(AppComponent, appConfig)` mas ainda não está em uso.

#### `panel/src/app/app.component.ts`
Componente raiz vazio — só renderiza `<ion-app><ion-router-outlet /></ion-app>`
via template. Standalone, importa `IonApp`, `IonRouterOutlet`.

#### `panel/src/app/app.routes.ts`
Rotas atuais (legadas):
- `/home` (HomePage) — pública
- `/login` (LoginPage legada)
- `/cadastro` (CadastroPage legada)
- `/dashboard` (DashboardPage legada) — guard `authGuard` (legado)
- `/perfil` (PerfilPage) — guard
- `''` → `/home`

Todas com `loadComponent` (lazy loading por rota).

#### `panel/src/app/app.config.ts`
**Não usado pelo `main.ts` atual** — é a configuração futura para a
versão `core/`. Diferenças:
- `provideRouter(routes, withPreloading, withComponentInputBinding())`
  — `withComponentInputBinding` ativa o binding automático de
  parâmetros de rota a `input()` do componente (usado por
  `features/employee-detail/employee-detail.page.ts`).
- `provideHttpClient(withInterceptors([authInterceptor]))` — apontando
  para `core/auth/auth.interceptor` (versão nova).
- `provideEchartsCore({ echarts: () => import('echarts') })` — carrega
  ECharts lazy (~900kb fora do bundle inicial).

#### `panel/src/environments/environment.ts` / `environment.prod.ts`
- `apiBaseUrl: 'http://localhost:3000'` em ambos. Trocar em build de
  produção. Versão legada referencia diretamente; versão nova passa por
  `core/api/api.config.ts` (que ainda lê localStorage como override).

#### `panel/src/main.ts` (idem), `polyfills.ts`, `zone-flags.ts`, `test.ts`
Padrão Angular/Ionic; importam zone.js, configuração de testes. Sem
lógica de negócio.

#### `panel/capacitor.config.ts`
Config Capacitor (para empacotamento Android/iOS — não usado no fluxo de
demonstração web).

---

### 6.2 Versão "core/" — serviços de API novos

Padrão: 1 arquivo por endpoint backend, retorna `Observable<T>` com tipos
de `core/models/`.

#### `panel/src/app/core/api/api.config.ts`
- `API_BASE_URL` é resolvido **uma vez** no carregamento do módulo:
  primeiro tenta `localStorage['facegate.apiBaseUrl']`; se vazio, usa
  default `http://localhost:3000`.
- Exporta também `API_BASE_URL_DEFAULT` e `API_BASE_URL_STORAGE_KEY`,
  consumidos pela página de settings (que oferece UI pra editar e
  resetar a URL).

#### `panel/src/app/core/auth/auth.service.ts`
Singleton (`providedIn: 'root'`).
```ts
readonly isLoggedIn = signal<boolean>(this.hasToken());
getToken(): string | null
login(email, password): Observable<LoginResponse>   // tap() armazena token + flip signal
logout(): void                                       // limpa token + nav para /login
```
Token em `localStorage['facegate.jwt']`.

#### `panel/src/app/core/auth/auth.guard.ts`
`CanActivateFn` funcional — `auth.isLoggedIn()` ? true : `createUrlTree(['/login'])`.

#### `panel/src/app/core/auth/auth.interceptor.ts`
`HttpInterceptorFn`. Responsabilidades:
1. **Proativa**: decodifica o JWT (`atob` no payload), se `exp - 10s` já
   passou, exibe toast "Sessão expirou", chama `auth.logout()`, joga
   error → não envia o request.
2. **Atacha token**: se não é fluxo de auth (`/auth/`), clona o request
   com `Authorization: Bearer <token>`.
3. **Reativa**: se a resposta vier 401, mesmo toast + logout.

#### `panel/src/app/core/api/employees.service.ts`
```ts
list(): Observable<Employee[]>
get(id): Observable<Employee>
create(dto: CreateEmployeeDto): Observable<Employee>
update(id, dto: UpdateEmployeeDto): Observable<Employee>
delete(id): Observable<void>
```
Tipos vêm de `core/models/employee.model.ts` — espelham `Employee` em
`backend/src/models/mod.rs` exatamente (campos `name`, `shift`,
`created_at`).

#### `panel/src/app/core/api/events.service.ts`
```ts
list(query: EventsQuery = {}): Observable<AccessEvent[]>
```
Constrói `HttpParams` condicionalmente (omite chaves sem valor — `HttpParams`
é imutável; cada `.set` retorna nova instância).

#### `panel/src/app/core/api/analytics.service.ts`
Quatro métodos: `accessByHour()`, `summaryToday()`, `avgDelay()`,
`presenceHeatmap()`. **Não** expõe `events` (essa é a `EventsService`).

#### `panel/src/app/core/api/presence.service.ts`
```ts
list(): Observable<PresentEmployee[]>  // GET /analytics/present-today
```

#### `panel/src/app/core/api/system.service.ts`
```ts
health(): Observable<string>     // responseType: 'text' (backend devolve "ok" plain)
mqttStatus(): Observable<MqttStatus>
```

#### `panel/src/app/core/api/users.service.ts`
```ts
list(): Observable<User[]>
create(dto: CreateUserDto): Observable<User>
```

#### `panel/src/app/core/api/enrollment.service.ts`
```ts
enrollVector(employeeId, vector: Float32Array): Observable<EnrollResponse>
```
Faz `POST /employees/:id/embeddings` com `Array.from(vector)` como JSON
(`Float32Array` não serializa nativo). Resposta: `{ id, vector, created_at }`.

#### `panel/src/app/core/vision/face-embedding.service.ts`
**Em-browser face embedding.** Roda BlazeFace + ArcFace via
`onnxruntime-web` (WASM backend, `ort.env.wasm.wasmPaths = "/assets/ort/"`).

Constantes:
- `BLAZE_INPUT_SIZE = 128`, `ARC_INPUT_SIZE = 112`, `EMBEDDING_DIM = 512`.
- `CONF_THRESHOLD = 0.5`, `IOU_THRESHOLD = 0.3`.
- `FLOATS_PER_DETECTION = 16` (formato de saída do BlazeFace pós-NMS).

Métodos:
- `async preload(): Promise<void>` — pré-aquece os dois `InferenceSession`s.
- `async embedFromCanvas(source: HTMLCanvasElement): Promise<Float32Array | null>`
  — pipeline completo: `detect` → `embed`. `null` se não detectou rosto.
- Privados:
  - `detector()` / `embedder()` — lazy loading dos `InferenceSession`s
    via `ort.InferenceSession.create('${API_BASE_URL}/models/blaze.onnx')`
    (backend serve via `ServeDir`).
  - `detect(session, canvas)` — redimensiona pra 128×128, monta tensor
    NCHW float32 RGB [0,1], roda BlazeFace, decodifica primeira bbox.
  - `embed(session, canvas, bbox)` — recorta bbox, redimensiona pra
    112×112, NHWC `(p - 127.5) / 128`, roda ArcFace, normaliza L2 o
    vetor de 512 antes de retornar.

⚠ Mesmo pré-processamento que o edge (`face_detector.cpp` /
`face_embedder.cpp`). Vetores produzidos no browser e no edge são
**comparáveis no mesmo Matcher**.

#### `panel/src/app/core/models/`
Todos interfaces TS espelhando os structs do backend:
- `auth.model.ts` — `LoginRequest`, `LoginResponse`, `JwtClaims`.
- `employee.model.ts` — `Employee`, `Shift = 'manhã' | 'tarde' | 'noite'`,
  `CreateEmployeeDto`, `UpdateEmployeeDto`.
- `event.model.ts` — `AccessEvent`, `AccessStatus = 'granted' | 'unknown'`,
  `EventsQuery`.
- `analytics.model.ts` — `HourCount`, `AvgDelay`, `HeatmapCell`,
  `SummaryToday`.
- `presence.model.ts` — `PresentEmployee`.
- `system.model.ts` — `MqttStatus`.
- `user.model.ts` — `User`, `CreateUserDto`.

---

### 6.3 Versão "features/" — páginas novas (não roteadas ainda)

Padrões comuns:
- Standalone components (`imports: [...]`).
- Signals para estado local (`signal()`, `computed()`, `effect()`).
- `DestroyRef` + `takeUntilDestroyed(destroyRef)` para auto-unsubscribe.
- `host: { class: 'ion-page' }` — necessário porque `app.routes.ts` (na
  versão nova esperada) usaria `<router-outlet>` em vez de
  `<ion-router-outlet>`.
- Toasts via `inject(ToastController)`.

#### `panel/src/app/features/login/login.page.ts`
- ReactiveForms com `email` (Validators.required + email) e `password`
  (required + minLength 4).
- Signal `loading`. Submit chama `auth.login(...)`, on success
  `router.navigate(['/dashboard'])`; on error mostra toast (401 = "Email
  ou senha incorretos.", outros = "Não foi possível conectar...").

#### `panel/src/app/features/dashboard/dashboard.page.ts`
- Pull paralelo via `forkJoin({ summary, hours, present })`.
- Auto-refresh com `setInterval(30_000)` + cleanup via
  `destroyRef.onDestroy`.
- Renderiza 4 cards (`StatCardComponent`) + bar chart via
  `NgxEchartsDirective`. `buildChartOptions(hours)` monta `EChartsOption`
  inline.
- Erro silencioso (auto-refresh não pode spammar toasts).

#### `panel/src/app/features/employees/employees.page.ts`
- Lista com `EmployeesService.list()`, pull-to-refresh, modal de criação
  via `<ion-modal #createModal>` declarativo (`viewChild.required<IonModal>`).
- Form: `name` (required, minLength 2) + `shift` (select opcional).
- Após sucesso: `createModal().dismiss()` + `refresh()` + toast.
- Cada item renderiza `<app-employee-card [employee]="...">` com
  `routerLink` para `/employees/:id`.

#### `panel/src/app/features/employee-detail/employee-detail.page.ts`
Página `/employees/:id`. Padrões avançados:
- `readonly id = input.required<string>()` — graças a
  `withComponentInputBinding()` no roteador, o `:id` é injetado direto.
- `effect(() => { ... })` no constructor: quando `employee()` muda
  (após PATCH), reseeda o `editForm` e marca pristine.
- Eventos recentes via `eventsApi.list({ employee_id, limit: 20 })`.
- Botão "Cadastrar rosto" abre o `EnrollmentWizardComponent` em modal.
- Botão "Excluir" mostra `AlertController` confirm; on confirm chama
  `api.delete(id)`.

#### `panel/src/app/features/enrollment/enrollment-wizard.component.ts`
Wizard de cadastro facial **em browser**. Estados:
- `camState ∈ 'idle' | 'live' | 'denied' | 'error'`.
- `captures: Shot[]` (`{ thumb: dataUrl, embedding: Float32Array }`).
- `processingCapture`, `uploading`, `uploadProgress`.

Métodos:
- `async startCamera()` — `navigator.mediaDevices.getUserMedia({ video, audio: false })`.
- `async capture()` — desenha frame em canvas, chama
  `faces.embedFromCanvas(canvas)`. Se retornar `null`, toast "Nenhum
  rosto detectado." Senão guarda `{ thumb, embedding }`.
- `removeCapture(idx)`.
- `async submit()` — uploads sequenciais (loop `for…of` com `await new
  Promise(...)`), atualiza `uploadProgress` por upload. Min: 3 captures.
- `cancel()` / `stopStream()`.

Constantes: `static readonly MIN_CAPTURES = 3`.
No constructor faz `faces.preload().catch(...)` — pré-carrega os modelos
ONNX (arc.onnx tem ~130 MB; primeiro run é lento).

Outputs:
- `closed: void` (cancel)
- `completed: number` (count de capturas enviadas com sucesso)

#### `panel/src/app/features/events/events.page.ts`
- Filtros: `filterStatus ∈ 'all' | 'granted' | 'unknown'` (segment), e
  `filterEmployeeId` (select populado via `EmployeesService`).
- Infinite scroll: `IonInfiniteScroll` + cursor `offset` privado.
- `resetAndLoad()` (filtros mudaram) vs `fetchPage()` (próxima página).
- `signal.update(curr => [...curr, ...page])` para append seguro.

#### `panel/src/app/features/reports/reports.page.ts`
- `forkJoin({ delays, heatmap })` no `ngOnInit`.
- Tabela de avg-delay ordenada DESC defensivamente no client.
- Heatmap ECharts 7×24, gradiente light-blue→Ionic primary.
- Botão "Exportar CSV": puxa últimos 1000 eventos, monta CSV com
  escape RFC-4180 (`escapeCsv`), Blob URL + `<a>` invisível para forçar
  download.

#### `panel/src/app/features/settings/settings.page.ts`
Quatro seções:
1. **API base URL** — `localStorage['facegate.apiBaseUrl']`. Reset
   (`resetApiUrl()`) limpa apenas esse campo. Salvar mostra toast
   instruindo recarregar a página.
2. **Pi network config** — `facegate.piMqttHost` e `facegate.piHttpEndpoint`
   (apenas persistidas; ainda nenhum código as consome).
3. **Users** — lista + modal de criação (POST /users; 409 → "Email já
   cadastrado").
4. **System status** — poll de 10s via `setInterval`:
   `system.health()` (text "ok"), `system.mqttStatus()`,
   `eventsApi.list({ limit: 1 })` para pegar `last_event_ms`.
   Erros via `catchError(of(...))` para não spammar toast.

Helpers privados: `read(key)`, `write(key, value)` (vazio = delete).

---

### 6.4 Versão "shared/" — componentes burros reutilizáveis

#### `panel/src/app/shared/employee-card/employee-card.component.ts`
```ts
@Input.required<Employee>() employee
computed initial = primeira letra do nome em uppercase
```
Renderiza um `<ion-item routerLink="/employees/{{employee().id}}">` com
avatar de inicial.

#### `panel/src/app/shared/event-card/event-card.component.ts`
```ts
@Input.required<AccessEvent>() event
computed iconName, iconColor, displayName, relativeTime
```
- `granted` → ícone verde `checkmark-circle`; `unknown` → âmbar
  `alert-circle`.
- `displayName` = nome ou `"Rosto desconhecido"`.
- `relativeTime` = string PT-BR (`Intl.RelativeTimeFormat('pt-BR')`):
  "agora" / "há 5 minutos" / "há 3 horas" / "ontem" / "DD/MM às HH:MM"
  para >7 dias. Função `formatRelativeTime` é privada ao módulo (não
  exportada — refatorar para pipe se aparecer um segundo consumidor).

#### `panel/src/app/shared/stat-card/stat-card.component.ts`
```ts
@Input.required<string>() label
@Input.required<number>() value
@Input() color: StatColor = 'primary'    // 'primary' | 'success' | 'warning' | 'danger'
```
Cartão "label sobre número grande colorido".

---

### 6.5 Versão LEGADA — páginas em uso hoje

#### `panel/src/app/home/home.page.ts`
Página pública institucional (Sobre, Produtos, Contato). Scroll em uma
única tela; `setSection(section)` mede deslocamento via
`getBoundingClientRect()` e usa `IonContent.scrollToPoint`.

`submitContact()` apenas limpa o formulário — sem persistência.

#### `panel/src/app/login/login.page.ts` (legado)
Versão template-driven (NgModel + `submitLogin()`). Equivalente
funcional ao `features/login/login.page.ts` mas sem signals/ReactiveForms.
Usa `auth/auth.service` (legado) e navega para `/dashboard` em sucesso.

#### `panel/src/app/cadastro/cadastro.page.ts` (legado)
Formulário de "cadastro" institucional (nome, sobrenome, telefone, empresa,
email, termos). `submitCadastro()` apenas limpa — não há POST hoje.

#### `panel/src/app/perfil/perfil.page.ts` (legado)
Página de perfil corporativo. Carrega `assets/mock_data_jsons/perfil_corporativo.json`
e renderiza dados estáticos do mock. Getters `nomeCompleto`,
`dataAdmissaoFormatada`, `enderecoFormatado` formatam para display.

#### `panel/src/app/dashboard/dashboard.page.ts` (legado)
**Variante mais ampla do dashboard novo.** Aglutina quatro "abas" na mesma
página (`activeTab ∈ 'dashboard' | 'funcionarios' | 'cadastro' | 'eventos'`):

- Lê 4 endpoints de analytics + a lista de funcionários no `ngOnInit`.
- Cálculos derivados: `pontualidadePct`, `totalAtrasos`,
  `atrasoMedioMin`, `acessosPorHora`, `distribuicaoTurno` (com cores
  hardcoded por turno: Manhã=#fbbf24, Tarde=#6fd96f, Noite=#60a5fa),
  `acessosPorDiaSemana`.
- `computePieSegments(dist)` constrói paths SVG manualmente — pizza
  sem biblioteca (caso especial 1 fatia: círculo completo via dois arcs).
- Aba "Cadastro" reusa `submitCadastro()` chamando `EmployeesService.create`
  (versão legada).
- Aba "Funcionários" tem busca + filtro por turno; `filtrarFuncionarios()`
  faz match local em memória.

Constantes:
- `TOLERANCIA_ATRASO_MIN = 15`
- `TURNO_CORES`, `COR_TURNO_FALLBACK`, `DIAS_SEMANA`.

> **Nota:** o diretório `panel/src/app/auth/` foi **removido** durante a
> consolidação do auth. Existia uma duplicação completa (AuthService,
> AuthGuard, AuthInterceptor) com chave de `localStorage` diferente
> (`facegate.auth.token` vs `facegate.jwt`). O conjunto sobrevivente é
> `panel/src/app/core/auth/` (signal-based, com check proativo de
> expiração + eviction do token expirado). Pages legadas (`login`,
> `dashboard`) agora importam de `../core/auth/auth.service`.

#### `panel/src/app/employees/employees.service.ts` (legado)
Service "tradutor" — converte entre o DTO do backend (`EmployeeDto` com
campos `name`, `shift`, `created_at`) e a interface local `Funcionario`
(com `nome`, `turno` capitalizado, `dataIngresso`, `registros: []`).

`TURNO_DISPLAY` mapeia `manhã→Manhã`, `tarde→Tarde`, `noite→Noite`.
`toShiftDb()` faz o contrário (lowercase para o backend).

#### `panel/src/app/analytics/analytics.service.ts` (legado)
Idem `core/api/analytics.service.ts`, mas inclui `events()` e
`presentToday()` também (não há `EventsService` ou `PresenceService` na
versão legada).

#### `panel/src/app/employee-card/employee-card.component.ts` (legado)
"Burro" — só recebe primitives via `@Input` (`nome`, `idade?`,
`dataIngresso?`, `foto`) e renderiza. Não conhece o tipo `Funcionario`.

#### `panel/src/app/event-card/event-card.component.ts` (legado)
"Burro" — recebe `titulo`, `descricao`, `data?`, `icone?` (default
`'calendar-outline'`).

---

## 6.6 Testes & CI

190 testes automatizados distribuídos pelas três camadas, todos executados em CI no GitHub Actions a cada push/PR. Esta seção mapeia os arquivos de teste e o workflow de CI no mesmo formato file-by-file do resto do guia.

### 6.6.1 `backend/tests/` — testes de integração Rust

Cada arquivo `tests/*.rs` é compilado como um binário independente pelo Cargo. Todos exercem a API HTTP real contra um banco Postgres real (`facegate_test`, criado automaticamente).

#### `backend/tests/common/mod.rs`
Harness compartilhado. Expõe:
- `pool() -> PgPool` — cria `facegate_test` se não existir, aplica `infra/migrations/*.sql`, retorna pool fresco. Setup pesado roda uma vez por processo via `OnceLock<Mutex<bool>>`; cada teste recebe seu próprio pool (pools sqlx são ligados ao runtime tokio em que foram criados — compartilhar entre `#[tokio::test]` quebra).
- `spawn_app(pool) -> TestServer` — constrói o `Router` real com `AsyncClient` MQTT cujo eventloop **nunca é polled** (publish vira no-op, casamento com o "best-effort" da produção).
- `reset_db(pool)`, `login_admin(server) -> token`, `sp_today_at(h, m) -> i64` (timestamps SP-local), `insert_employee_with_shift`, `insert_event` — helpers de seed.

#### `backend/tests/auth.rs` — 9 testes
`/health` público, `POST /auth/login` (success + 401 para senha errada + 401 para email desconhecido, ambos com a mesma mensagem para não vazar qual está errado), JWT extractor (missing/malformed/expired/wrong-secret → 401, válido → handler executa).

#### `backend/tests/employees.rs` — 13 testes
CRUD completo. Cobre: validação de nome vazio (400), 404 em get/patch/delete de id inexistente, ordenação por nome no `list`, PATCH parcial (`name` sem `shift` deixa shift intacto), shift=null explícito limpa via double-Option deserializer.

#### `backend/tests/users.rs` — 6 testes
List (admin seedado aparece), create success, duplicate email vira 409 (via `is_unique_violation`), senha < 4 chars → 400, email vazio → 400, list requer auth (401 sem header).

#### `backend/tests/embeddings.rs` — 9 testes
Validação de 512-d, 404 em FK violation (employee inexistente), cascade no `DELETE` de employee (embeddings desaparecem), **round-trip lossless de f32** (envia 512 valores múltiplos de 2⁻⁷, compara byte-a-byte vinda do `pgvector`), list ordenada por `created_at DESC`.

#### `backend/tests/mqtt_handler.rs` — 9 testes
Chama `backend::mqtt::handle_publish` direto (exposto como `pub` para testes), sem broker. Cobre granted/unknown insert, drops silenciosos para status/direction inválidos, `direction` default = `"in"` quando ausente, JSON malformado retorna Err, FK violation em employee_id → Err visível no log.

#### `backend/tests/analytics.rs` — 17 testes
Todos os 6 endpoints. Destaques:
- `avg_delay` é o caso mais complexo da query no projeto inteiro. Tests pinam: turno `manhã` básico (0+15=15 min), filtro de `direction='out'` impede que evento de saída às 06:00 vire o MIN do dia, turno `noite` 22:30 = +30 min, **turno `noite` 00:30 do dia seguinte = +150 min** (normalização do delta `-77400s` para janela `(-12h, +12h]`).
- `events` cobre filtros (employee_id, status, from/to), pagination (limit clamp a 200, offset), ordering desc por timestamp_ms.
- `present-today` cobre in/out/in (último = in → presente), in apenas (presente), in+out (não-presente), evento de ontem (não-presente).

### 6.6.2 `panel/src/app/**/*.spec.ts` — testes Angular

Stack: Jasmine + Karma + Chromium headless (`ChromeHeadlessCI` launcher em `karma.conf.js` com `--no-sandbox --disable-gpu`). Todos os HTTP são mockados via `HttpTestingController` — nenhum acesso à rede.

#### `panel/src/app/core/auth/auth.service.spec.ts` — 8 testes
`login` armazena token + flip do signal, `logout` limpa + navega para `/login`, `isAuthenticated` cobre missing/malformed/expired/válido — e **evicta o token expirado** para o signal não mentir.

#### `panel/src/app/core/auth/auth.interceptor.spec.ts` — 6 testes
Attach do `Authorization: Bearer` para requests protegidas, skip em `/auth/*`, **proactive expiry** (token local expirado → short-circuit antes do HTTP, logout, throw), 401 do servidor → logout (mas NÃO em login).

#### `panel/src/app/core/auth/auth.guard.spec.ts` — 3 testes
Allow autenticado, `UrlTree('/login')` quando não, e **prova que usa `isAuthenticated()` estrito (não o `isLoggedIn()` barato)**: seed um token expirado, `isLoggedIn()` = true (presença), `isAuthenticated()` = false (exp passou), guard rejeita.

#### `panel/src/app/core/api/*.spec.ts` — 17 testes
`employees.service` (5), `users.service` (2), `analytics.service` (4), `events.service` (3), `presence.service` (1), `system.service` (2), `enrollment.service` (1). Cada um verifica URL + método + payload via `HttpTestingController`. `events` exercita filtros parciais (omitidos não viram `?key=` vazio). `system.service` pina o `responseType: 'text'` do `/health` (que retorna string `"ok"`, não JSON). `enrollment.service` pina a conversão `Float32Array → number[]` (sem isso, JSON.stringify produziria `{}`).

#### `panel/src/app/employees/employees.service.spec.ts` — 9 testes
Serviço **legado** (ainda em uso pela dashboard). Cobre mapeamento DTO ↔ `Funcionario`: case do shift (`'manhã'` DB → `'Manhã'` display), slice do `created_at` para YYYY-MM-DD, trim+lowercase do turno na escrita, null/whitespace colapsado para shift=null, PATCH parcial (chave ausente NÃO viaja no body).

#### `panel/src/app/analytics/analytics.service.spec.ts` — 8 testes
Serviço **legado** (em uso pela dashboard, distinto do `core/api/analytics.service`). URL + method para os 6 endpoints (`access-by-hour`, `avg-delay`, `presence-heatmap`, `summary-today`, `present-today`, `events`). `events` cobre no-filter (zero params), todos os filtros (employee_id/status/from/to/limit/offset), filtros parciais (apenas os fornecidos viajam).

#### `panel/src/app/login/login.page.spec.ts` — 7 testes
Success → navigateByUrl('/dashboard') + clear password (proteção de XSS local), 401 → "E-mail ou senha inválidos.", 0 → "Não foi possível conectar ao servidor.", 500 → genérica, double-submit guard (segunda chamada com `loading=true` não emite request), `errorMessage` limpa no início de cada submit.

#### `panel/src/app/dashboard/dashboard.page.spec.ts` — 23 testes
A maior suíte do painel. Cobre o data-flow real da página, com `EmployeesService` e `AnalyticsService` substituídos por stubs Jasmine:

- **Wiring inicial:** `ngOnInit` carrega funcionários (`reloadFuncionarios`), enche `totalFuncionarios`, dedupe de `turnos`, computa `distribuicaoTurno` (counts + %), wiring de `avgDelay/accessByHour/presenceHeatmap`.
- **KPIs:** `totalAtrasos` = funcionários com `avg_delay_minutes > 15` (tolerância), `atrasoMedioMin` = média de todas as linhas com 1 decimal, **0 quando array vazio** (evita NaN).
- **accessByHour:** mapeia para `HHh` zero-padded, `maxAcessosHora ≥ 1` mesmo quando tudo é zero (evita divide-by-zero no scaling).
- **presenceHeatmap:** agrega por DOW (filtra dias fora de [0,6]), `maxAcessoDiaSemana` reflete o pico.
- **loadUnknowns:** **rolling window de 7 dias** (eventos antes do cutoff são descartados), `naoRecCount` reflete só os recentes, `ultimosNaoRec` mantém os 6 primeiros do response cru.
- **Tabs:** `setTab` muda `activeTab`.
- **Filtros:** `filtrarFuncionarios` aplica busca por substring case-insensitive + filtro de turno, `onTurnoChange` limpa `selectedFuncionario` se turno deixou de bater, `selecionarFuncionario` zera o search box.
- **Cadastro:** trim de nome, valida vazio (sem hit na API), success POST + `reloadFuncionarios`, mapeia 400/0/other para mensagens pt-BR distintas, double-submit no-op enquanto `cadastroLoading`.
- **Remoção:** success limpa selection + reload; error popa alert (sem reload).
- **Logout:** chama `AuthService.logout()` + `navigateByUrl('/login')`.
- **Formatters:** `formatDistance(null|undefined)` = `"—"`, números com 2 decimais.

Out of scope da suíte: exportação CSV (DOM/Blob manipulation), pie SVG paths (pure visual).

#### `panel/src/app/**/*.spec.ts` — smoke tests (8)
`app.component`, cards (`employee-card`, `event-card`), páginas (`home`, `perfil`, `dashboard`, `cadastro`, `login`). Apenas verificam `should create`. Os stubs originais gerados pelo `ng generate` foram corrigidos: declarations → imports (componentes standalone), providers faltando (`HttpClient`, `IonicAngular`).

### 6.6.3 `edge/tests/` — testes GoogleTest C++

Opt-in via `-DBUILD_TESTING=ON` no `cmake`. Cada `*_test.cpp` linka contra a static lib relevante e é registrado no `ctest` via `gtest_discover_tests`.

#### `edge/tests/CMakeLists.txt`
Macro `add_edge_test(name lib)` injeta `EDGE_MIGRATIONS_DIR` como `target_compile_definitions` para os storage tests encontrarem `schema.sql` independente do build directory.

#### `edge/tests/matcher_test.cpp` — 10 testes
Cosine distance: identidade=0, ortogonal=1, **boundary exclusivo** (dist == threshold → não match), tie-breaking em cache não-ordenado, **guard de norma zero** (retorna `+inf`, não NaN). Upsert insert vs replace, remove preserva siblings, no-op em id inexistente.

#### `edge/tests/serialization_test.cpp` — 6 testes
Contrato JSON com o backend. Pina: `status` = `granted/unknown/denied`, **`employee_id`/`distance` viajam como `null` explícito** (não chave ausente, porque o backend espera a chave presente), `FaultKind` enum mapeado para `camera_failure/inference_failure/storage_failure/other`, **`timestamp_ms` em milissegundos, não nanos** (defensivo contra refactor pra `nanoseconds`).

#### `edge/tests/storage_test.cpp` — 12 testes
Cada teste aloca um temp DB único. Cobre: BLOB round-trip preserva todos os 512 floats bit-exato, `upsert` insere com id e substitui no mesmo id, **`upsert_embedding({id=0, ...})` lança `runtime_error`** (id=0 é convenção do enroll CLI; sync sempre vem com id do backend). `delete_employee_embeddings` cascateia, `pending_events` FIFO com `LIMIT`, delete por id preserva os outros.

#### `edge/tests/config_test.cpp` — 11 testes
Parser TOML + `validate()`. Seções obrigatórias ausentes → throw, `vision.threshold` fora de [0.0, 2.0] → throw, **`gpio.enabled=false` pula validação de pinos** (permite rodar em laptop dev sem GPIO), pinos GPIO duplicados → throw, `mqtt.broker_port` fora de [1, 65535] → throw, `logging.level` enum, seção `[recognition]` opcional com defaults positivos, TOML malformado → `runtime_error`.

### 6.6.4 `.github/workflows/ci.yml` — pipeline CI

Três jobs paralelos. Triggers: push em `main`, PRs contra `main`.

#### Job `backend`
- Service container `pgvector/pgvector:pg16` com `--health-cmd pg_isready`.
- Sem mosquitto (eventloop nunca polled — verificado).
- Toolchain `dtolnay/rust-toolchain@stable` + `llvm-tools-preview`.
- Cache de `~/.cargo/registry/{index,cache}` + `~/.cargo/git/db` + `backend/target`, key = hash de `Cargo.lock`.
- `cargo llvm-cov --locked --lcov --output-path coverage.lcov -- --test-threads=1` (substitui `cargo test`, sai com mesmo exit code e gera lcov).
- Artifact `backend-coverage` contendo `coverage.lcov`.

#### Job `panel`
- `actions/setup-node@v4` com cache npm.
- `npm ci` (rejeita drift entre package.json e package-lock.json).
- `CHROME_BIN=/usr/bin/google-chrome` (pré-instalado em ubuntu-latest).
- `npm test -- --watch=false --browsers=ChromeHeadlessCI --code-coverage` — o `karma-coverage` (já em devDependencies, reporters `text-summary` + `html` em `karma.conf.js`) imprime percentuais e escreve `panel/coverage/app/`.
- Artifact `panel-coverage` com o diretório HTML.

#### Job `edge`
- Container `archlinux:latest` (deps mapeiam 1:1 para `pacman -S`; ONNXRuntime + libgpiod 2.x não estão limpos em Ubuntu).
- Bootstrap mínimo (`git nodejs`) antes do `actions/checkout`, depois `pacman -Syu` com a lista cheia.
- **SQLiteCpp construído do source** (3.3.3) — só está em AUR, evitamos bootstrap de helper.
- `cmake -DBUILD_TESTING=ON -DCMAKE_CXX_FLAGS="-O0 --coverage" -DCMAKE_EXE_LINKER_FLAGS="--coverage"` produz `.gcda` durante o `ctest`.
- `gcovr` (não lcov: lcov 2.x não acompanha gcov do gcc 16+ na Arch rolling). Filtros `--filter 'edge/src/'` e `--filter 'edge/apps/'` reportam apenas produção, não tests.
- Artifact `edge-coverage` com `coverage.info` (lcov format) + `coverage-html/`.

#### Detalhes do CMake da edge relacionados a CI

- `option(BUILD_TESTING "Build unit tests" OFF)` mantém testes opt-in; build padrão da Pi continua rápido.
- `target_link_libraries(facegate_vision PUBLIC opencv_core opencv_imgproc opencv_videoio ...)` — substituiu `${OpenCV_LIBS}` (que arrasta `opencv_cvv` → Qt6, `opencv_viz` → VTK, `opencv_hdf` → HDF5, todas ausentes no container CI). Mudança também slim no binário da Pi.

### 6.6.5 Pendências de cobertura conhecidas

| Camada  | Não coberto                                                                                                       | Razão                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Backend | `/system/mqtt-status`, `/models/*`, eventloop MQTT → DB end-to-end                                                | Passthrough trivial; `handle_publish` cobre o "core" do path       |
| Painel  | DashboardPage CSV export + pie SVG paths, `core/vision/face-embedding.service`, `EnrollmentWizardComponent`       | DOM/Blob, ONNX no browser, fluxo de câmera — melhor cobertos por e2e/manual |
| Edge    | `face_detector`, `face_embedder`, hardware (`Camera`, `Turnstile`, `Buzzer`, `RgbLed`), `MqttPublisher/Subscriber`, `Pipeline` | Modelo ONNX 130 MB, V4L2/libgpiod, broker — integração on-Pi mais apropriada |

---

## 7. Comunicação cross-camada — referência rápida

### 7.1 Login → JWT → todas as rotas
1. Painel: `AuthService.login(email, password)` → `POST /auth/login`.
2. Backend (`auth.rs::login`): hash SHA-256 hex da senha, `SELECT … WHERE email AND password_hash`, gera JWT HS256 com `exp = now + 8h`.
3. Painel guarda em `localStorage['facegate.jwt']` (chave única após a consolidação do auth).
4. Próximos requests: `authInterceptor` injeta `Authorization: Bearer <token>`.
5. Backend: qualquer handler com parâmetro `_claims: Claims` → extractor decodifica antes; 401 em qualquer falha.
6. 401 no painel → toast + `logout()` + redirect `/login`.

### 7.2 Listagem de funcionários
Painel `EmployeesService.list()` → `GET /employees` → `employees.rs::list`
roda `SELECT … ORDER BY name` → JSON de `Vec<Employee>` → tipo
`Employee[]` no painel.

### 7.3 Cadastro de rosto (enrollment, em browser)
1. Operador na página `/employees/:id`, clica "Cadastrar rosto" → abre `EnrollmentWizardComponent`.
2. `FaceEmbeddingService` faz `fetch /models/blaze.onnx` e `/models/arc.onnx` via `ServeDir` do backend (origem dos modelos: `../edge/models`).
3. Câmera local → frame em canvas → `embedFromCanvas(canvas)` → BlazeFace detecta rosto → ArcFace produz vetor 512-d L2-normalizado.
4. `EnrollmentService.enrollVector(employeeId, vector)` → `POST /employees/:id/embeddings { vector: number[] }`.
5. Backend (`embeddings.rs::create`) valida `vector.len()==512`, INSERT na tabela `embeddings` (CASCADE com employee), depois publica MQTT retained em `facegate/sync/embeddings/upsert/{id}`.
6. Edge (`mqtt_subscriber.cpp::on_message`) parsa, valida, faz `storage.upsert_embedding` + `matcher.upsert`. A próxima reconhecida do mesmo rosto na catraca já hit o cache atualizado.

### 7.4 Apagar funcionário
1. Painel: `EmployeesService.delete(id)` → `DELETE /employees/:id`.
2. Backend (`employees.rs::delete`): primeiro `SELECT id FROM embeddings WHERE employee_id = $1` (coleta antes da cascade derrubar), depois `DELETE FROM employees` (`ON DELETE CASCADE` apaga embeddings, `ON DELETE SET NULL` em `access_events` preserva audit log).
3. Para cada `embedding_id`: publica retained payload vazio em `facegate/sync/embeddings/upsert/{id}` (tombstone).
4. Edge → `storage.delete_embedding` + `matcher.remove`.

### 7.5 Evento de acesso (fluxo principal do edge → painel)
1. **Edge** (`pipeline.cpp::main_loop`):
   `camera.capture()` → `detector.detect_best` → `embedder.extract` → `matcher.find_match` → deduplicação → atua (`turnstile.grant_access` ou `buzzer.beep_denied`) → `serialize(AccessEvent)` → `publisher.publish(...)`.
   Se `publish` retorna `false`, `storage.enqueue_pending_event`.
2. **Broker** (Mosquitto) — entrega ao backend (QoS 1).
3. **Backend** (`mqtt/mod.rs::handle_publish`): valida `status` e `direction`, `INSERT INTO access_events`.
4. **Painel** (`features/events`, `features/dashboard`): polling/refresh via `EventsService.list` / `AnalyticsService.summaryToday` / etc.

### 7.6 Fila offline (edge sem rede)
1. `Pipeline::try_publish_or_enqueue`: tenta `publisher.publish`; se `false` ou desconectado, faz `storage.enqueue_pending_event(topic, payload)`.
2. `auxiliary_loop`: enquanto `publisher.is_connected()`, `storage.fetch_pending_events(50)` → publica cada → `delete_pending_event(id)` se sucesso, `break` se falhar (não atrasar).
3. Política de retenção/limpeza da fila é TBD (ver DESIGN.md).

---

## 8. Convenções e armadilhas comuns

### Edge (C++)
- Construtor **joga** em falha de setup; runtime **não joga** (retorna
  `optional`/`bool` ou loga silencioso). Storage é a única exceção —
  joga em qualquer falha (disco cheio é fatal). Compreender essa
  distinção evita ler logs procurando uma exceção que nunca veio.
- Classes que detêm recursos (Camera, Turnstile, Buzzer, FaceDetector,
  FaceEmbedder, Storage, MqttPublisher, MqttSubscriber, Pipeline,
  Matcher) são **não-copiáveis e não-móveis**. Sempre passe por referência.
- `cv::Mat` é reference-counted — `Camera::capture()` `.clone()` é
  obrigatório, senão a thread de captura sobrescreve pixels durante
  inferência.
- `OnnxSession::TensorView` ponteiros válidos só até a próxima `run()`.
- `steady_clock` para medir intervalos (heartbeat, dedupe);
  `system_clock` para timestamps de eventos (que vão para o backend).
- `kGpioChipPath = "/dev/gpiochip0"` está hardcoded no `apps/facegate/main.cpp`.
- `migrations/schema.sql` no edge é resolvido **relativo ao CWD** —
  rode o binário a partir de `edge/`.

### Backend (Rust)
- "Auth obrigatória" = handler recebe `Claims` (com ou sem `_`).
  Se você remover `_claims: Claims` por engano, o endpoint vira **público**.
- `serde(default)` em campos opcionais para serializar a mudança de
  contrato com o edge sem quebrar o produtor (ver `AccessEvent.direction`).
- `Option<Option<T>>` + `double_option` em `UpdateEmployee.shift`
  distingue "manter" de "limpar".
- Senhas em SHA-256 hex (compatível com seed do admin). **Não está
  pronto pra produção** — migrar pra argon2/bcrypt.
- Migrations em `infra/migrations/` só rodam no **primeiro boot** do
  volume `pgdata`. Em cluster existente, aplicar à mão (todas têm
  `IF NOT EXISTS` para idempotência).
- Mudanças de schema que afetem o edge devem ser replicadas em
  `edge/migrations/schema.sql` (SQLite local).

### Painel (Angular)
- **Há duas gerações coexistindo.** Antes de editar, confira qual está
  roteada (`app.routes.ts`). Adicionar em `features/` sem atualizar as
  rotas resulta em código nunca renderizado.
- `provideHttpClient(withInterceptors([authInterceptor]))` está em
  `main.ts`, hoje apontando para `core/auth/auth.interceptor.ts`.
  `app.config.ts` (com mesma estrutura + ECharts) **só vai entrar em uso
  quando substituir o bootstrap** para `bootstrapApplication(AppComponent, appConfig)`.
- `localStorage` mantém: `facegate.jwt` (chave única do auth após
  consolidação), `facegate.apiBaseUrl`, `facegate.piMqttHost`,
  `facegate.piHttpEndpoint`.
- Inferência facial em browser usa **modelos servidos pelo backend** via
  `${API_BASE_URL}/models/*.onnx` (`ServeDir::new("../edge/models")`).
  Se o backend não tiver acesso a `../edge/models`, o enrollment quebra.
- ECharts é lazy-loaded apenas no `app.config.ts` novo. A página legada
  de dashboard (`app/dashboard/dashboard.page.ts`) **não usa ECharts** —
  desenha pizza SVG manualmente.

### Cross-cutting (todos)
- Hora real: backend agrupa em `America/Sao_Paulo`. Frontend formata
  com `Intl.RelativeTimeFormat('pt-BR')` ou `toLocaleString('pt-BR')`.
- Timestamps trafegam como `int64` epoch ms em todas as fronteiras
  (MQTT JSON, REST JSON, SQLite, Postgres). Conversão de/para
  `DateTime<Utc>` / `std::chrono::system_clock::time_point` é local.
- Enums viajam como string lowercase nos payloads (`"granted"`, `"unknown"`,
  `"camera_failure"`, etc.) — robusto a reorder em C++.
- Vetor de embedding é sempre **512 dimensões L2-normalizadas**.
  Trocar de modelo facial implica em `infra/migrations/*upgrade*.sql`
  + recadastro completo (vetores de modelos diferentes não são
  comparáveis).

---

## 9. Como diagnosticar problemas a partir deste guia

Sintoma sugestão:

| Sintoma | Onde começar |
|---|---|
| Login retorna 401 sempre | `auth.rs::login` (hash não bate com `00_init.sql`); recreie o seed ou use `admin@facegate.local` / `admin123` |
| Painel mostra "Sessão expirou" imediatamente | `auth.interceptor.ts` (versão nova) — `exp - 10s` já passou; verifique relógio do cliente, `TOKEN_TTL_SECS` |
| Eventos aparecem no banco mas não no painel | `analytics.rs::events` (filtros), `EventsService.list` (params), CORS no `main.rs` (origin do painel) |
| `MqttSubscriber` no edge não reflete novos cadastros | `mqtt_subscriber.cpp::on_message` (logs em `stderr`); `embeddings.rs::publish_embedding_upsert` foi chamado? Cheque o broker com `mosquitto_sub -t 'facegate/sync/#' -v` |
| `enroll` CLI: "No face detected" sempre | `face_detector.cpp` (threshold), `Camera` device certo? `cfg.vision.threshold` razoável? |
| Servo nunca abre | `gpio.enabled=true`? `Turnstile::grant_access` está sendo chamado? Logs do `pipeline.cpp` em `stderr` |
| Backend não recebe nada do MQTT | `mqtt/mod.rs::start_subscriber` retornou ok? `MQTT_HOST/PORT` corretos? `mqttStatus` no painel diz "Conectado"? |
| Embedding bate em pessoa errada | `cfg.vision.threshold` muito alto (ver `Matcher::find_match`); reduza pra ~1.0 e re-cadastre |
| Migrations não aplicam | Volume `pgdata` já existia → docker-entrypoint-initdb.d é skipped; aplicar manualmente com `psql … -f 01_add_direction.sql` |
| Inferência no browser dá erro 404 em `blaze.onnx` | Backend não vê `../edge/models`. Cheque `ServeDir::new("../edge/models")` e baixe os modelos (link no `README.md`) |

---

Para o "porquê" de cada decisão arquitetural (PIMPL, dedupe, BLOB vs JSON
no SQLite, escolha de threads, etc.), o documento mais profundo continua
sendo `edge/DESIGN.md`. Este aqui é o mapa "o que é o quê e quem chama
quem"; o DESIGN.md é o "por quê é assim".

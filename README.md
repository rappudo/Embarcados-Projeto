# FaceGateway

Sistema de controle de acesso por reconhecimento facial com processamento embarcado.

## Estrutura do repositório
```
facegate/
├── edge/        # C++ — pipeline de visão computacional (Raspberry Pi 4)
├── backend/     # Rust — API REST e subscriber MQTT
├── panel/       # Ionic + Angular — painel web/mobile PWA
├── infra/       # Docker — PostgreSQL, pgvector, Mosquitto
└── docs/        # Documentação, diagramas, relatório LaTeX
```

## Pré-requisitos

- Docker e Docker Compose
- Rust (instalar via [rustup](https://rustup.rs))
- Node.js 20+ e Ionic CLI (`npm install -g @ionic/cli`)
- C++17, CMake 3.22+ (apenas para trabalhar no edge)

## Setup do ambiente (backend + banco)
```bash
# 1. Copia e preenche as variáveis de ambiente
cp .env.example .env

# 2. Sobe PostgreSQL e Mosquitto
cd infra
docker compose --env-file ../.env up -d

# 3. Verifica se está tudo ok
docker exec -it facegate-db psql -U facegate -d facegate -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
docker exec -it facegate-broker mosquitto_pub -t "test/ping" -m "ok" && echo "broker ok"
```

## Modelos ONNX (edge)

Os modelos não estão no repositório. Baixe e coloque em `edge/models/`:

- **BlazeFace:** [download](https://github.com/google/mediapipe/tree/master/mediapipe/models) — salvar como `edge/models/blaze.onnx`
- **ArcFace:** [download](https://github.com/deepinsight/insightface) — salvar como `edge/models/arc.onnx`

## Documentação

O relatório completo está em `docs/Main.tex`. Para compilar: `pdflatex docs/Main.tex` (rodar duas vezes para resolver referências cruzadas).

## Apresentação

- **link do slide para as apresentações** [acesso](https://canva.link/5o6q6nqca953iau)

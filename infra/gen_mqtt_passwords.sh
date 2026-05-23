#!/usr/bin/env bash
# Gera infra/mosquitto_passwords com hashes para o backend e a Pi a
# partir das variáveis em .env. Re-executar substitui o arquivo.
#
# Pré-requisitos:
#   - docker disponível (usa a imagem eclipse-mosquitto:2 para o mosquitto_passwd).
#   - .env preenchido com MQTT_USERNAME / MQTT_PASSWORD (backend) e
#     EDGE_MQTT_USERNAME / EDGE_MQTT_PASSWORD (Pi).
#
# Uso: bash infra/gen_mqtt_passwords.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
OUT="$SCRIPT_DIR/mosquitto_passwords"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[gen_mqtt_passwords] .env não encontrado em $ENV_FILE" >&2
  echo "                    copie .env.example para .env e preencha as variáveis MQTT_* antes de rodar." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

for var in MQTT_USERNAME MQTT_PASSWORD EDGE_MQTT_USERNAME EDGE_MQTT_PASSWORD; do
  if [[ -z "${!var:-}" ]]; then
    echo "[gen_mqtt_passwords] variável $var não definida no .env" >&2
    exit 1
  fi
done

if [[ "$MQTT_USERNAME" == "$EDGE_MQTT_USERNAME" ]]; then
  echo "[gen_mqtt_passwords] MQTT_USERNAME (backend) e EDGE_MQTT_USERNAME (Pi) devem ser distintos." >&2
  exit 1
fi

# Mosquitto_passwd escreve um arquivo: criamos um novo, depois append do segundo usuário.
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

docker run --rm -v "$TMP_DIR:/work" eclipse-mosquitto:2 \
  mosquitto_passwd -c -b /work/pw "$MQTT_USERNAME" "$MQTT_PASSWORD"
docker run --rm -v "$TMP_DIR:/work" eclipse-mosquitto:2 \
  mosquitto_passwd    -b /work/pw "$EDGE_MQTT_USERNAME" "$EDGE_MQTT_PASSWORD"

# 0644 (não 0600) porque o mosquitto roda como usuário não-root dentro do
# container e precisa ler o arquivo. O conteúdo é hash PBKDF2, não segredo
# bruto — perda de confidencialidade aceitável em troca de não usar root.
install -m 0644 "$TMP_DIR/pw" "$OUT"
echo "[gen_mqtt_passwords] gerado $OUT (modo 0644, $(wc -l <"$OUT") usuários)"

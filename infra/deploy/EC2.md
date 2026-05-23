# Deploy do FaceGateway numa EC2 (AWS Academy)

Este runbook leva uma instância **vazia** do AWS Academy a um stack
rodando — Postgres + Mosquitto + backend Rust + painel servido por Caddy —,
com a Raspberry Pi conectando pela internet ao broker.

**Tempo estimado:** 30–45 min na primeira tentativa.

## 0. Pré-requisitos

- Conta AWS Academy ativa, com créditos disponíveis.
- Chave SSH local (`~/.ssh/id_ed25519` ou similar).
- Repositório `Embarcados-Projeto` clonado **e atualizado** no seu laptop e na Pi.
- A Pi com `edge/build/facegate` compilado e câmera/GPIO funcionando localmente.

> Se você nunca usou EC2 antes, a parte mais difícil é só clicar nos botões
> certos no console. Siga a §1 sem improvisar.

## 1. Provisionar a EC2

1. Logue no AWS Academy → **Launch AWS Console** → procure por **EC2**.
2. **Launch instance** com estes valores:
   - **Name:** `facegate-prod`
   - **AMI:** Ubuntu Server 22.04 LTS (x86_64)
   - **Instance type:** `t3.medium` — 2 vCPU + 4 GB RAM é o mínimo confortável
     para rodar 4 containers e fazer rebuild com Rust. `t2.micro` (free tier)
     trava no build da crate `axum`. Se o orçamento for crítico, use `t3.small`
     e pré-builde as imagens localmente (ver §6).
   - **Key pair:** crie um par novo ou use um existente. **Baixe o `.pem` e
     guarde** — sem ele o SSH não funciona.
   - **Security group:** crie um novo com as 4 regras abaixo (todas
     `Source: 0.0.0.0/0` salvo onde dito):
     | Tipo | Porta | Origem            | Por quê                                  |
     |------|-------|-------------------|------------------------------------------|
     | SSH  | 22    | **só seu IP**     | acesso administrativo                    |
     | HTTP | 80    | 0.0.0.0/0         | painel (Caddy)                           |
     | Custom TCP | 1883 | 0.0.0.0/0   | MQTT da Pi — auth obrigatória            |
     | Custom TCP | 3000 | só seu IP   | acesso direto ao backend (debug/curl)    |
   - **Storage:** 20 GB gp3 (8 GB padrão estoura ao baixar imagens Docker).
3. **Launch**. Anote o **Public IPv4** que aparece em detalhes da instância —
   chamamos de `EC2_IP` nas próximas seções.

> AWS Academy às vezes não permite alocar Elastic IP. Está tudo bem — só
> lembre que o IP público muda se você reiniciar a instância. Para o demo
> de uma tarde isso é aceitável.

## 2. Instalar Docker + clonar o projeto

```bash
ssh -i ~/.ssh/sua-chave.pem ubuntu@$EC2_IP

# Pacotes base + Docker (sigam recomendação oficial)
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
# Re-loga pra essa última mudança aplicar
exit
ssh -i ~/.ssh/sua-chave.pem ubuntu@$EC2_IP

git clone https://github.com/rappudo/Embarcados-Projeto.git
cd Embarcados-Projeto
```

## 3. Configurar segredos

```bash
cp .env.example .env

# Gerar segredos fortes (cole na .env conforme for editando)
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')"
echo "MQTT_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')"
echo "EDGE_MQTT_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')"

nano .env
```

**No .env, edite:**

- `POSTGRES_PASSWORD` → use o valor gerado
- Atualize a senha em `DATABASE_URL` para o mesmo valor
- `JWT_SECRET` → valor gerado
- `MQTT_PASSWORD` → valor gerado (backend)
- `EDGE_MQTT_PASSWORD` → valor gerado (Pi)
- `CORS_ORIGINS=http://EC2_IP_AQUI` (sem `:80`, sem barra no final)

Gere o arquivo de senhas do Mosquitto:

```bash
bash infra/gen_mqtt_passwords.sh
# Deve imprimir: "[gen_mqtt_passwords] gerado .../mosquitto_passwords (modo 0600, 2 usuários)"
```

## 4. Subir o stack

```bash
cd infra
docker compose up -d --build
# Primeiro build leva ~8–12 min (cargo + npm). Acompanhe:
docker compose logs -f backend
```

Quando ver `Servidor rodando em http://[::]:3000` no log, abra no navegador:

```
http://EC2_IP
```

O painel deve carregar. Login padrão: `admin@facegate.local` / `admin123`
(criado pelo seed). **Troque imediatamente** via "Cadastro de usuários".

## 5. Reapontar a Raspberry Pi

Na Pi, edite `edge/config/config.toml` na seção `[mqtt]`:

```toml
broker_host = "EC2_IP_AQUI"   # IP público da EC2 anotado em §1
broker_port = 1883
client_id = "rpi-entrance-01"
keepalive_seconds = 60
heartbeat_interval_seconds = 30
username = "edge-pi"                       # = EDGE_MQTT_USERNAME do .env
password = "<EDGE_MQTT_PASSWORD do .env>"  # cole o valor exato
```

Reinicie o daemon:

```bash
cd ~/Faculdade-7Semestre/Embarcados/Embarcados-Projeto/edge
./build/facegate --config config/config.toml
```

Stdout deve mostrar:

```
MqttPublisher: connected to EC2_IP:1883
MqttSubscriber: connected to EC2_IP:1883
MqttSubscriber: subscribed to 'facegate/sync/embeddings/upsert/+' (QoS 1)
```

Se aparecer `connect failed, rc=5`, a Pi não autenticou — confira a senha
no `config.toml` contra `.env` na EC2.

Se aparecer `rc=7`, o broker recusou conexão TCP — security group provavelmente
não tem a regra de 1883 aberta para o IP da Pi.

## 6. Atualizar deploy

Cada vez que mudar código:

```bash
# Na EC2
cd ~/Embarcados-Projeto
git pull
cd infra
docker compose up -d --build
```

## 7. Backup do banco (antes da apresentação)

```bash
docker exec facegate-db pg_dump -U facegate facegate > /tmp/facegate-$(date +%Y%m%d).sql
scp -i ~/.ssh/sua-chave.pem ubuntu@$EC2_IP:/tmp/facegate-*.sql ./
```

## Apêndice — Troubleshooting rápido

| Sintoma                                             | Onde olhar                                              |
|-----------------------------------------------------|---------------------------------------------------------|
| Painel carrega mas chamadas retornam 404            | Caddyfile não foi atualizado; rebuild `caddy`           |
| Login retorna 401 com senha correta                 | seed não rodou; veja `docker compose logs postgres`     |
| Pi nunca conecta no broker                          | security group → 1883 aberto? `nc -zv $EC2_IP 1883` na Pi |
| `docker compose up --build` trava no `cargo build`  | instância undersized; use `t3.medium` ou maior          |
| Eventos chegam mas painel não atualiza              | navegador cachando bundle antigo; Ctrl-Shift-R          |

## Apêndice — Subir só Postgres + Mosquitto (dev híbrido)

Útil quando você quer rodar `cargo run` localmente apontando pra DB/broker
na EC2 (ou subir só DB+broker em docker local sem rebuildar tudo):

```bash
docker compose up -d postgres mosquitto
```

## Apêndice — Parar e remover tudo

```bash
docker compose down            # mantém os volumes
docker compose down -v         # apaga banco, fila MQTT, dados Caddy
```

Não esqueça de **parar a instância EC2** no console quando não estiver
usando — créditos AWS Academy são limitados.

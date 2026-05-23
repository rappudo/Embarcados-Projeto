# Multi-stage build do backend Rust.
#
# Estágio 1: compila o binário release dentro da imagem oficial Rust 1.78
# (mesma versão usada no host de desenvolvimento). A primeira camada copia
# só Cargo.{toml,lock} para que `cargo fetch` fique cacheado entre rebuilds.
#
# Estágio 2: copia o binário pronto para uma imagem debian-slim. Não há
# toolchain Rust no runtime — imagem final ~80 MB.

FROM rust:1.78-bookworm AS builder
WORKDIR /app

# Cache de dependências: copiar manifests primeiro, criar um src vazio,
# rodar cargo fetch. Depois copia o src real para evitar invalidar a
# camada de deps a cada mudança de código.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo 'fn main(){}' > src/main.rs && cargo fetch && rm -rf src

COPY src ./src
RUN cargo build --release --bin backend

FROM debian:bookworm-slim AS runtime
WORKDIR /srv
# OpenSSL + CA certs para clientes HTTP/TLS (sqlx, rumqttc com TLS futuro).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/backend /usr/local/bin/backend

# Não há porta no Dockerfile — SERVER_PORT vem do env. docker-compose
# publica a porta para fora.
ENV RUST_LOG=backend=info,sqlx=warn

# Usuário não-root para reduzir blast radius caso o binário seja explorado.
RUN useradd --system --no-create-home --uid 1001 facegate
USER 1001
ENTRYPOINT ["/usr/local/bin/backend"]

# Build do bundle Angular + servida estática via Caddy.
#
# Estágio 1: node:20-alpine compila o bundle de produção. O `outputPath`
# do projeto é `www/` (ver panel/angular.json), com index.html na raiz.
#
# Estágio 2: caddy:2-alpine serve estaticamente. O Caddyfile real é
# montado pelo docker-compose (infra/Caddyfile) para que possamos
# adicionar reverse proxy do backend sem rebuildar.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build -- --configuration production

FROM caddy:2-alpine AS runtime
COPY --from=builder /app/www /srv
EXPOSE 80

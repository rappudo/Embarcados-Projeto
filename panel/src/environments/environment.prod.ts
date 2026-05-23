// Build de produção: o Caddy do docker-compose faz reverse proxy de
// `/api/*` para o backend Rust, então o painel chama same-origin e
// elimina pré-flights CORS e dor com configuração de hostname.
export const environment = {
  production: true,
  apiBaseUrl: '/api',
};

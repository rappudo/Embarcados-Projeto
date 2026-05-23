use anyhow::{Context, Result};

pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub mqtt_host: String,
    pub mqtt_port: u16,
    pub mqtt_username: Option<String>,
    pub mqtt_password: Option<String>,
    pub server_port: u16,
    pub cors_origins: Vec<String>,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let cors_origins = std::env::var("CORS_ORIGINS")
            .unwrap_or_else(|_| "http://localhost:8100,http://127.0.0.1:8100".to_string())
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let mqtt_username = std::env::var("MQTT_USERNAME").ok().filter(|s| !s.is_empty());
        let mqtt_password = std::env::var("MQTT_PASSWORD").ok().filter(|s| !s.is_empty());

        Ok(Self {
            database_url: std::env::var("DATABASE_URL")
                .context("DATABASE_URL não definida no .env")?,

            jwt_secret: std::env::var("JWT_SECRET").context("JWT_SECRET não definida no .env")?,

            mqtt_host: std::env::var("MQTT_HOST").unwrap_or_else(|_| "localhost".to_string()),

            mqtt_port: std::env::var("MQTT_PORT")
                .unwrap_or_else(|_| "1883".to_string())
                .parse()
                .context("MQTT_PORT deve ser um número válido")?,

            mqtt_username,
            mqtt_password,

            server_port: std::env::var("SERVER_PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()
                .context("SERVER_PORT deve ser um número válido")?,

            cors_origins,
        })
    }
}

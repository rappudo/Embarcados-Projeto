use anyhow::{Context, Result};

pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub mqtt_host: String,
    pub mqtt_port: u16,
    pub server_port: u16,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            database_url: std::env::var("DATABASE_URL")
                .context("DATABASE_URL não definida no .env")?,
            jwt_secret: std::env::var("JWT_SECRET"):wq
                .context("JWT_SECRET não definida no .env")?,
            mqtt_port: std::env::var("MQTT_PORT")
                .unwrap_or_else(|_| "1883".to_string())
                .parse()
                .context("MQTT_PORT deve ser um número válido")?,
            server_port: std::env::var("SERVER_PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()
                .context("SERVER_PORT deve ser um número válido")?,
        })
    }
}

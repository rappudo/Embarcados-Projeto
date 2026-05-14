O backend é desenvolvido em [Rust](https://doc.rust-lang.org/stable/) e composto pelos seguintes componentes:

* [Axum 0.7](https://docs.rs/axum/0.7.9/axum/): framework HTTP para a API REST;
* [sqlx 0.7](https://docs.rs/sqlx/0.7.4/sqlx/): queries verificadas em compile-time contra o PostgreSQL;
* [rumqttc 0.24](https://docs.rs/rumqttc/0.24.0/rumqttc/): **subscriber MQTT** assíncrono integrado ao runtime Tokio;
* **jsonwebtoken**: geração e validação de tokens JWT para autenticação do painel.

O [[Banco de dados |banco de dados]] utilizado é o [PostgreSQL 16](https://www.postgresql.org/docs/16/index.html) com a extensão **pgvector 0.6**, que permite armazenar embeddings vetoriais e realizar busca por similaridade com índice HNSW diretamente no banco, eliminando a necessidade de biblioteca externa como FAISS.

A [[Comunicação|comunicação]] entre Raspberry e backend utiliza o protocolo MQTT com **QoS1**, com broker [Eclipse Mosquitto 2.x](https://mosquitto.org/documentation/) rodando no servidor. A [[Tópicos do broker|estrutura de tópicos]] é:

* _facegate/events/access_ -- evento de rosto reconhecido;
* _facegate/events/unknown_ -- evento de rosto não reconhecido;
* _facegate/health_ -- heartbeat periódico do dispositivo.



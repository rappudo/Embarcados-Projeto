
O controle de entrada e saída de funcionários é uma atividade essencial para organizações que operam com turnos fixos ou escalas de trabalho. Métodos tradicionais, como cartões magnéticos, senhas ou registros manuais, apresentam limitações relacionadas à segurança, possibilidade de fraudes e baixa integração com sistemas analíticos.

Com o avanço das técnicas de Visão Computacional e Aprendizado de Máquina, especialmente no campo do reconhecimento facial, tornou-se viável implementar soluções biométricas com processamento local e custo relativamente reduzido. Dispositivos embarcados de baixo consumo energético, como o Raspberry Pi 4, permitem a execução de modelos de aprendizado de máquina diretamente no ponto de captura, reduzindo latência e dependência de infraestrutura centralizada.

Além do controle de acesso, a coleta estruturada desses dados possibilita análises logísticas relevantes, como cálculo de tempo médio de permanência, identificação de padrões de atraso e avaliação de horários de entrada e saída. Essas informações podem apoiar decisões estratégicas relacionadas à gestão de recursos humanos.

## Objetivos

Desenvolver um sistema de controle de entrada e saída de funcionários capaz de:

- Implementar pipeline de visão computacional em C++ capaz de detectar e reconhecer rostos em tempo real, com latência inferior a 500\,ms.
- garantir que a catraca e o buzzer funcionem independentemente de conectividade de rede
- Transmitir eventos de acesso ao backend via protocolo MQTT com garantia de entrega (QoS\,1).
- Desenvolver API REST em Rust (Axum) com autenticação JWT e endpoints de analytics.
- Persistir embeddings e eventos no PostgreSQL com extensão pgvector para busca por similaridade.
- Desenvolver painel multiplataforma em Ionic + Angular, instalável como Progressive Web App.
- Estimar e documentar os custos de hardware necessários para implantação do MVP.

## Fluxo operacional

1. Câmera CSI captura frames continuamente;
2. BlazeFace detecta presença de rosto e extrai keypoints para alinhamento;
3. MobileFaceNet gera embedding de 128 dimensões do rosto alinhado;
4. Embedding é comparado por distância de cosseno com o cache local SQLite;
5. Decisão: acesso concedido aciona relé da catraca via GPIO; acesso negado aciona buzzer;
6. Evento é publicado no broker MQTT (tópico \texttt{facegate/events/access});
7. Subscriber Rust consome o evento e persiste no PostgreSQL;
8. Painel Ionic + Angular consulta a API REST e exibe métricas ao gestor.;

O módulo embarcado opera de forma completamente autônoma: em caso de falha de rede, eventos são enfileirados em SQLite local e enviados ao broker quando a conectividade é restabelecida.
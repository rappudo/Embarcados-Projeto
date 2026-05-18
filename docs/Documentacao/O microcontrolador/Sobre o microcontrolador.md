O módulo embarcado é responsável por toda a inteligência de visão computacional e atuação física. O [[Hardware|hardware]] é composto por:

* **Raspberry Pi 4 Model B** (4\,GB de RAM);
* Câmera CSI de 5 megapixels;
* Relé para acionamento da catraca (via **GPIO**);
* Buzzer para sinalização de acesso negado (via **GPIO**).

O [[Software|software]] embarcado é desenvolvido em [C++17](https://devdocs.io/cpp/) e utiliza as seguintes bibliotecas:

* [libcamera](https://libcamera.org/docs.html): captura de frames via **interface CSI**;
* [OpenCV 4.8](https://docs.opencv.org/4.8.0/d1/dfb/intro.html): pré-processamento de imagem;
* [ONNXRuntime 1.17](https://onnxruntime.ai/docs/tutorials/): inferência dos modelos **BlazeFace** e **MobileFaceNet**;
* **textbf**: cálculo de distância de cosseno entre embeddings;
* [SQLite3](https://sqlite.org/docs.html): cache local de embeddings e fila de eventos offline;
* [libmosquitto](https://mosquitto.org/api/files/mosquitto-h.html): publicação de eventos no **broker MQTT**.
#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <iostream>
#include <string>
#include <thread>
#include <utility>

#include "config/config.hpp"
#include "domain/domain.hpp"
#include "hardware/camera.hpp"
#include "hardware/relay.hpp"
#include "hardware/buzzer.hpp"
#include "mqtt/mqtt_publisher.hpp"
#include "pipeline/pipeline.hpp"
#include "storage/storage.hpp"
#include "vision/face_detector.hpp"
#include "vision/face_embedder.hpp"
#include "vision/matcher.hpp"

namespace {

std::atomic<bool> g_stop_requested{false};

void signal_handler(int /*signum*/) {
    g_stop_requested.store(true);
}

void install_signal_handlers() {
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
}

void print_usage(const char* prog) {
    std::cerr << "Usage: " << prog << " --config <path/to/config.toml>\n";
}

std::string parse_config_path(int argc, char** argv) {
    if (argc != 3) {
        return {};
    }
    if (std::string(argv[1]) != "--config") {
        return {};
    }
    return std::string(argv[2]);
}

void ensure_parent_directory(const std::string& file_path) {
    std::filesystem::path path(file_path);
    auto parent = path.parent_path();
    if (parent.empty()) {
        return;
    }
    std::error_code ec;
    std::filesystem::create_directories(parent, ec);
    if (ec) {
        throw std::runtime_error(
            "Failed to create directory '" + parent.string() + "': " + ec.message()
        );
    }
}

constexpr const char* kGpioChipPath = "/dev/gpiochip0";

}  // namespace

int main(int argc, char** argv) {
    const std::string config_path = parse_config_path(argc, argv);
    if (config_path.empty()) {
        print_usage(argv[0]);
        return 2;
    }

    try {
        std::cerr << "facegate: loading config from '" << config_path << "'\n";
        const auto cfg = facegate::config::load_config(config_path);

        ensure_parent_directory(cfg.storage.sqlite_path);

        std::cerr << "facegate: opening storage at '"
                  << cfg.storage.sqlite_path << "'\n";
        facegate::storage::Storage storage(
            cfg.storage.sqlite_path,
            "migrations/schema.sql"
        );

        std::cerr << "facegate: opening camera\n";
        facegate::hardware::Camera camera(
            cfg.camera.device,
            cfg.camera.width,
            cfg.camera.height,
            cfg.camera.fps
        );

        std::cerr << "facegate: initializing GPIO\n";
        facegate::hardware::Relay relay(
                    kGpioChipPath,
                    cfg.gpio.relay_pin,
                    cfg.gpio.relay_pulse_ms,
                    cfg.gpio.enabled
                );
                facegate::hardware::Buzzer buzzer(
                    kGpioChipPath,
                    cfg.gpio.buzzer_pin,
                    cfg.gpio.buzzer_beep_ms,
                    cfg.gpio.enabled
                );

        std::cerr << "facegate: loading vision models\n";
        facegate::vision::FaceDetector detector(
            cfg.vision.blazeface_model,
            cfg.vision.onnx_threads
        );
        facegate::vision::FaceEmbedder embedder(
            cfg.vision.mobilefacenet_model,
            cfg.vision.onnx_threads
        );

        std::cerr << "facegate: loading embeddings from storage\n";
        auto cached_embeddings = storage.load_all_embeddings();
        std::cerr << "facegate: " << cached_embeddings.size()
                  << " embeddings loaded\n";

        facegate::vision::Matcher matcher(
            std::move(cached_embeddings),
            cfg.vision.threshold
        );

        std::cerr << "facegate: connecting to MQTT broker "
                  << cfg.mqtt.broker_host << ":" << cfg.mqtt.broker_port << "\n";
        facegate::mqtt::MqttPublisher publisher(
            cfg.mqtt.client_id,
            cfg.mqtt.broker_host,
            cfg.mqtt.broker_port,
            cfg.mqtt.keepalive_seconds
        );

        install_signal_handlers();

        std::cerr << "facegate: starting pipeline\n";
        facegate::pipeline::Pipeline pipeline(
            camera,
            detector,
            embedder,
            matcher,
            relay,
            buzzer,
            storage,
            publisher,
            cfg.device_id,
            cfg.mqtt.heartbeat_interval_seconds
        );

        while (!g_stop_requested.load()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }

        std::cerr << "facegate: shutdown requested\n";
        pipeline.request_stop();

        return 0;
    } catch (const std::exception& e) {
        std::cerr << "facegate: fatal error: " << e.what() << "\n";
        return 1;
    }
}

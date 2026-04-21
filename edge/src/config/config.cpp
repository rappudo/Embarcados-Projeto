#include "./config.hpp"

#include <toml++/toml.hpp>

#include <stdexcept>
#include <string>

namespace facegate::config {

// Forward declarations — implementadas abaixo, uma por vez.
namespace {

VisionConfig parse_vision(const toml::table& root);
CameraConfig parse_camera(const toml::table& root);
GpioConfig parse_gpio(const toml::table& root);
StorageConfig parse_storage(const toml::table& root);
MqttConfig parse_mqtt(const toml::table& root);
LoggingConfig parse_logging(const toml::table& root);

void validate(const Config& cfg);

VisionConfig parse_vision(const toml::table& root) {
    const auto* section = root["vision"].as_table();
    if (!section) {
        throw std::runtime_error("Config: missing or invalid [vision] section");
    }

    VisionConfig cfg;
    cfg.threshold = static_cast<float>((*section)["threshold"].value_or(0.45));
    cfg.blazeface_model = (*section)["blazeface_model"].value_or("");
    cfg.mobilefacenet_model = (*section)["mobilefacenet_model"].value_or("");
    cfg.onnx_threads = (*section)["onnx_threads"].value_or(2);
    return cfg;
}

CameraConfig parse_camera(const toml::table& root) {
    const auto* section = root["camera"].as_table();
    if (!section) {
        throw std::runtime_error("Config: missing or invalid [camera] section");
    }

    CameraConfig cfg;
    cfg.device = (*section)["device"].value_or("");
    cfg.width = (*section)["width"].value_or(640);
    cfg.height = (*section)["height"].value_or(480);
    cfg.fps = (*section)["fps"].value_or(30);
    return cfg;
}

GpioConfig parse_gpio(const toml::table& root) {
    const auto* section = root["gpio"].as_table();
    if (!section) {
        throw std::runtime_error("Config: missing or invalid [gpio] section");
    }

    GpioConfig cfg;
    cfg.enabled = (*section)["enabled"].value_or(true);
    cfg.relay_pin = (*section)["relay_pin"].value_or(-1);
    cfg.buzzer_pin = (*section)["buzzer_pin"].value_or(-1);
    cfg.relay_pulse_ms = (*section)["relay_pulse_ms"].value_or(1500);
    cfg.buzzer_beep_ms = (*section)["buzzer_beep_ms"].value_or(300);
    return cfg;
}

StorageConfig parse_storage(const toml::table& root) {
    const auto* section = root["storage"].as_table();
    if (!section) {
        throw std::runtime_error("Config: missing or invalid [storage] section");
    }

    StorageConfig cfg;
    cfg.sqlite_path = (*section)["sqlite_path"].value_or("");
    return cfg;
}

MqttConfig parse_mqtt(const toml::table& root) {
    const auto* section = root["mqtt"].as_table();
    if (!section) {
        throw std::runtime_error("Config: missing or invalid [mqtt] section");
    }

    MqttConfig cfg;
    cfg.broker_host = (*section)["broker_host"].value_or("");
    cfg.broker_port = (*section)["broker_port"].value_or(1883);
    cfg.client_id = (*section)["client_id"].value_or("");
    cfg.keepalive_seconds = (*section)["keepalive_seconds"].value_or(60);
    cfg.heartbeat_interval_seconds = (*section)["heartbeat_interval_seconds"].value_or(30);
    return cfg;
}

LoggingConfig parse_logging(const toml::table& root) {
    const auto* section = root["logging"].as_table();
    if (!section) {
        throw std::runtime_error("Config: missing or invalid [logging] section");
    }

    LoggingConfig cfg;
    cfg.level = (*section)["level"].value_or("info");
    return cfg;
}

void validate(const Config& cfg) {
    if (cfg.device_id.empty()) {
        throw std::runtime_error("Config: device_id is required");
    }

    if (cfg.vision.threshold < 0.0f || cfg.vision.threshold > 2.0f) {
        throw std::runtime_error("Config: vision.threshold must be between 0.0 and 2.0");
    }
    if (cfg.vision.blazeface_model.empty()) {
        throw std::runtime_error("Config: vision.blazeface_model is required");
    }
    if (cfg.vision.mobilefacenet_model.empty()) {
        throw std::runtime_error("Config: vision.mobilefacenet_model is required");
    }
    if (cfg.vision.onnx_threads <= 0) {
        throw std::runtime_error("Config: vision.onnx_threads must be positive");
    }

    if (cfg.camera.device.empty()) {
        throw std::runtime_error("Config: camera.device is required");
    }
    if (cfg.camera.width <= 0 || cfg.camera.height <= 0) {
        throw std::runtime_error("Config: camera.width and camera.height must be positive");
    }
    if (cfg.camera.fps <= 0) {
        throw std::runtime_error("Config: camera.fps must be positive");
    }

    if (cfg.gpio.enabled) {
            if (cfg.gpio.relay_pin < 0) {
                throw std::runtime_error("Config: gpio.relay_pin is required (positive integer)");
            }
            if (cfg.gpio.buzzer_pin < 0) {
                throw std::runtime_error("Config: gpio.buzzer_pin is required (positive integer)");
            }
            if (cfg.gpio.relay_pin == cfg.gpio.buzzer_pin) {
                throw std::runtime_error("Config: gpio.relay_pin and gpio.buzzer_pin must differ");
            }
            if (cfg.gpio.relay_pulse_ms <= 0 || cfg.gpio.buzzer_beep_ms <= 0) {
                throw std::runtime_error("Config: gpio pulse/beep durations must be positive");
            }
        }

    if (cfg.storage.sqlite_path.empty()) {
        throw std::runtime_error("Config: storage.sqlite_path is required");
    }

    if (cfg.mqtt.broker_host.empty()) {
        throw std::runtime_error("Config: mqtt.broker_host is required");
    }
    if (cfg.mqtt.broker_port <= 0 || cfg.mqtt.broker_port > 65535) {
        throw std::runtime_error("Config: mqtt.broker_port must be in 1..65535");
    }
    if (cfg.mqtt.client_id.empty()) {
        throw std::runtime_error("Config: mqtt.client_id is required");
    }
    if (cfg.mqtt.keepalive_seconds <= 0) {
        throw std::runtime_error("Config: mqtt.keepalive_seconds must be positive");
    }
    if (cfg.mqtt.heartbeat_interval_seconds <= 0) {
        throw std::runtime_error("Config: mqtt.heartbeat_interval_seconds must be positive");
    }

    const auto& lvl = cfg.logging.level;
    if (lvl != "trace" && lvl != "debug" && lvl != "info" &&
        lvl != "warn" && lvl != "error") {
        throw std::runtime_error(
            "Config: logging.level must be one of trace|debug|info|warn|error"
        );
    }
}

}  // namespace

Config load_config(const std::filesystem::path& path) {
    toml::table root;
    try {
        root = toml::parse_file(path.string());
    } catch (const toml::parse_error& e) {
        throw std::runtime_error(
            "Failed to parse config file '" + path.string() + "': " + e.description().data()
        );
    }

    Config cfg;
    cfg.device_id = root["device_id"].value_or("");
    cfg.vision = parse_vision(root);
    cfg.camera = parse_camera(root);
    cfg.gpio = parse_gpio(root);
    cfg.storage = parse_storage(root);
    cfg.mqtt = parse_mqtt(root);
    cfg.logging = parse_logging(root);

    validate(cfg);
    return cfg;
}

}  // namespace facegate::config

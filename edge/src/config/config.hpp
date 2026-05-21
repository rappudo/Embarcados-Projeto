#pragma once

#include <cstdint>
#include <string>
#include <filesystem>

namespace facegate::config {

struct VisionConfig {
    float threshold;
    std::string blazeface_model;
    std::string mobilefacenet_model;
    int onnx_threads;
};

struct CameraConfig {
    std::string device;
    int width;
    int height;
    int fps;
};

struct GpioConfig {
    bool enabled;
    int servo_pin;
    int buzzer_pin;
    int rgb_red_pin;
    int rgb_green_pin;
    int rgb_blue_pin;
    bool rgb_active_high;
    int servo_open_ms;
    int buzzer_beep_ms;
};

struct RecognitionConfig {
    int idle_reset_seconds;
    int unknown_throttle_seconds;
    int denied_cooldown_ms;
};

struct StorageConfig {
    std::string sqlite_path;
};

struct MqttConfig {
    std::string broker_host;
    int broker_port;
    std::string client_id;
    int keepalive_seconds;
    int heartbeat_interval_seconds;
};

struct LoggingConfig {
    std::string level;
};

struct Config {
    std::string device_id;
    VisionConfig vision;
    CameraConfig camera;
    GpioConfig gpio;
    RecognitionConfig recognition;
    StorageConfig storage;
    MqttConfig mqtt;
    LoggingConfig logging;
};

Config load_config(const std::filesystem::path& path);

}  // namespace facegate::config

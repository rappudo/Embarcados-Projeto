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
    // Minimum time (ms) a face must be continuously detected before we run
    // embedding/matching and emit an event. Prevents premature "unknown"
    // decisions when only part of the face (e.g. just the eyes) is in frame
    // as someone approaches the camera. 0 disables the gate.
    int face_stabilization_ms;
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
    // Optional broker credentials. Empty means anonymous (local dev / tests).
    // EC2 broker requires both; if either is missing the daemon falls back to
    // anonymous and the broker rejects the connection at handshake time.
    std::string username;
    std::string password;
};

struct LoggingConfig {
    std::string level;
};

struct MetricsConfig {
    // Empty path disables CSV logging. summary_interval_cycles <= 0 disables
    // the periodic stderr digest. Both off by default — opt-in for benchmarks.
    std::string csv_path;
    int summary_interval_cycles;
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
    MetricsConfig metrics;
};

Config load_config(const std::filesystem::path& path);

}  // namespace facegate::config

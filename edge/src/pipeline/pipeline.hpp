#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

namespace facegate::hardware {
class Camera; class Turnstile; class Buzzer; class RgbLed;
}
namespace facegate::vision   { class FaceDetector; class FaceEmbedder; class Matcher; }
namespace facegate::storage  { class Storage; }
namespace facegate::mqtt     { class MqttPublisher; }

namespace facegate::pipeline {

class StageProfiler;

class Pipeline {
public:
    Pipeline(
        facegate::hardware::Camera& camera,
        facegate::vision::FaceDetector& detector,
        facegate::vision::FaceEmbedder& embedder,
        facegate::vision::Matcher& matcher,
        facegate::hardware::Turnstile& turnstile,
        facegate::hardware::Buzzer& buzzer,
        facegate::hardware::RgbLed& led,
        facegate::storage::Storage& storage,
        facegate::mqtt::MqttPublisher& publisher,
        std::string device_id,
        int heartbeat_interval_seconds,
        int idle_reset_seconds,
        int unknown_throttle_seconds,
        int open_hold_ms,
        int denied_cooldown_ms,
        std::string metrics_csv_path,
        int metrics_summary_interval_cycles
    );
    ~Pipeline();

    Pipeline(const Pipeline&) = delete;
    Pipeline& operator=(const Pipeline&) = delete;
    Pipeline(Pipeline&&) = delete;
    Pipeline& operator=(Pipeline&&) = delete;

    void request_stop();
    void wait();

private:
    void main_loop();
    void auxiliary_loop();

    facegate::hardware::Camera& camera_;
    facegate::vision::FaceDetector& detector_;
    facegate::vision::FaceEmbedder& embedder_;
    facegate::vision::Matcher& matcher_;
    facegate::hardware::Turnstile& turnstile_;
    facegate::hardware::Buzzer& buzzer_;
    facegate::hardware::RgbLed& led_;
    facegate::storage::Storage& storage_;
    facegate::mqtt::MqttPublisher& publisher_;

    std::string device_id_;
    int heartbeat_interval_seconds_;
    std::chrono::seconds idle_reset_;
    std::chrono::seconds unknown_throttle_;
    std::chrono::milliseconds open_hold_;
    std::chrono::milliseconds denied_cooldown_;

    std::atomic<bool> stop_{false};
    std::mutex stop_mutex_;
    std::condition_variable stop_cv_;

    std::thread main_thread_;
    std::thread auxiliary_thread_;

    std::unique_ptr<StageProfiler> profiler_;
};

}  // namespace facegate::pipeline

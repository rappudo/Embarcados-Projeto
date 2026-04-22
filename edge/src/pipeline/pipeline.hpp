#pragma once

#include <atomic>
#include <condition_variable>
#include <mutex>
#include <string>
#include <thread>

namespace facegate::hardware { class Camera; class Relay; class Buzzer; }
namespace facegate::vision   { class FaceDetector; class FaceEmbedder; class Matcher; }
namespace facegate::storage  { class Storage; }
namespace facegate::mqtt     { class MqttPublisher; }

namespace facegate::pipeline {

class Pipeline {
public:
    Pipeline(
        facegate::hardware::Camera& camera,
        facegate::vision::FaceDetector& detector,
        facegate::vision::FaceEmbedder& embedder,
        facegate::vision::Matcher& matcher,
        facegate::hardware::Relay& relay,
        facegate::hardware::Buzzer& buzzer,
        facegate::storage::Storage& storage,
        facegate::mqtt::MqttPublisher& publisher,
        std::string device_id,
        int heartbeat_interval_seconds
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
    facegate::hardware::Relay& relay_;
    facegate::hardware::Buzzer& buzzer_;
    facegate::storage::Storage& storage_;
    facegate::mqtt::MqttPublisher& publisher_;

    std::string device_id_;
    int heartbeat_interval_seconds_;

    std::atomic<bool> stop_{false};
    std::mutex stop_mutex_;
    std::condition_variable stop_cv_;

    std::thread main_thread_;
    std::thread auxiliary_thread_;
};

}  // namespace facegate::pipeline

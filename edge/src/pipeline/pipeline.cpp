#include "pipeline/pipeline.hpp"

#include <chrono>
#include <iostream>
#include <optional>
#include <stdexcept>
#include <utility>

#include "hardware/camera.hpp"
#include "hardware/turnstile.hpp"
#include "hardware/buzzer.hpp"
#include "vision/face_detector.hpp"
#include "vision/face_embedder.hpp"
#include "vision/matcher.hpp"
#include "storage/storage.hpp"
#include "mqtt/mqtt_publisher.hpp"
#include "mqtt/serialization.hpp"
#include "domain/domain.hpp"

namespace facegate::pipeline {

Pipeline::Pipeline(
    facegate::hardware::Camera& camera,
    facegate::vision::FaceDetector& detector,
    facegate::vision::FaceEmbedder& embedder,
    facegate::vision::Matcher& matcher,
    facegate::hardware::Turnstile& turnstile,
    facegate::hardware::Buzzer& buzzer,
    facegate::storage::Storage& storage,
    facegate::mqtt::MqttPublisher& publisher,
    std::string device_id,
    int heartbeat_interval_seconds,
    int idle_reset_seconds,
    int unknown_throttle_seconds
)
    : camera_(camera),
      detector_(detector),
      embedder_(embedder),
      matcher_(matcher),
      turnstile_(turnstile),
      buzzer_(buzzer),
      storage_(storage),
      publisher_(publisher),
      device_id_(std::move(device_id)),
      heartbeat_interval_seconds_(heartbeat_interval_seconds),
      idle_reset_(idle_reset_seconds),
      unknown_throttle_(unknown_throttle_seconds) {
    try {
        main_thread_ = std::thread(&Pipeline::main_loop, this);
        auxiliary_thread_ = std::thread(&Pipeline::auxiliary_loop, this);
    } catch (...) {
        stop_.store(true);
        if (main_thread_.joinable()) {
            main_thread_.join();
        }
        throw;
    }

    std::cerr << "Pipeline: started (device_id=" << device_id_ << ")\n";
}

Pipeline::~Pipeline() {
    request_stop();
    if (main_thread_.joinable()) {
        main_thread_.join();
    }
    if (auxiliary_thread_.joinable()) {
        auxiliary_thread_.join();
    }
    std::cerr << "Pipeline: stopped\n";
}

void Pipeline::request_stop() {
    stop_.store(true);
    stop_cv_.notify_all();
}

void Pipeline::wait() {
    std::unique_lock<std::mutex> lock(stop_mutex_);
    stop_cv_.wait(lock, [this]{ return stop_.load(); });
}

namespace {

facegate::domain::Timestamp now() {
    return std::chrono::system_clock::now();
}

void try_publish_or_enqueue(
    facegate::mqtt::MqttPublisher& publisher,
    facegate::storage::Storage& storage,
    const facegate::mqtt::SerializedMessage& msg
) {
    if (!publisher.publish(msg)) {
        try {
            storage.enqueue_pending_event(msg.topic, msg.payload);
        } catch (const std::exception& e) {
            std::cerr << "Pipeline: failed to enqueue pending event: "
                      << e.what() << "\n";
        }
    }
}

}  // namespace

void Pipeline::main_loop() {
    using steady = std::chrono::steady_clock;

    // Dedup state. We run at ~30 fps so without this the system would emit
    // ~180 events/min for someone standing in front of the camera. Instead we
    // emit only on meaningful transitions.
    std::optional<facegate::domain::AccessStatus> last_status;
    std::optional<facegate::domain::EmployeeId> last_employee;
    steady::time_point last_face_seen_at{};
    steady::time_point last_unknown_emitted_at{};
    bool ever_seen_face = false;

    while (!stop_.load()) {
        auto frame_opt = camera_.capture();
        if (!frame_opt) {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            continue;
        }

        const cv::Mat& frame = *frame_opt;

        auto detection_opt = detector_.detect_best(frame);
        if (!detection_opt) {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            continue;
        }

        auto embedding_opt = embedder_.extract(frame, *detection_opt);
        if (!embedding_opt) {
            facegate::domain::DeviceFault fault;
            fault.timestamp = now();
            fault.kind = facegate::domain::FaultKind::InferenceFailure;
            fault.message = "FaceEmbedder failed to extract embedding";

            auto msg = facegate::mqtt::serialize(fault, device_id_);
            try_publish_or_enqueue(publisher_, storage_, msg);

            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            continue;
        }

        auto match_result = matcher_.find_match(*embedding_opt);

        const auto current = steady::now();
        const bool face_was_absent =
            ever_seen_face && (current - last_face_seen_at) > idle_reset_;

        // Idle reset: if no face was seen for idle_reset_ seconds, forget the
        // last decision so the next person (even the same one) emits fresh.
        if (face_was_absent) {
            last_status.reset();
            last_employee.reset();
        }

        bool should_emit = false;
        facegate::domain::AccessEvent event;
        event.timestamp = now();

        if (match_result.has_value()) {
            event.status = facegate::domain::AccessStatus::Granted;
            event.employee = match_result->employee;
            event.distance = match_result->distance;

            // Emit on first sighting, after idle reset, or when a different
            // employee appears. Same employee held in view → silent.
            const bool first_time = !last_status.has_value();
            const bool different_employee =
                last_status == facegate::domain::AccessStatus::Granted &&
                last_employee != match_result->employee;
            const bool was_unknown_before =
                last_status == facegate::domain::AccessStatus::Unknown;

            if (first_time || different_employee || was_unknown_before) {
                should_emit = true;
                std::cerr << "Pipeline: MATCH employee=" << match_result->employee
                          << " distance=" << match_result->distance << "\n";
                // Non-blocking — turnstile thread handles the 5s open + close.
                // Re-triggering during the open window just extends it.
                turnstile_.grant_access();
                last_status = facegate::domain::AccessStatus::Granted;
                last_employee = match_result->employee;
            }
        } else {
            event.status = facegate::domain::AccessStatus::Unknown;
            event.employee = std::nullopt;
            event.distance = std::nullopt;

            // Unknown: emit on first sighting / transition, otherwise throttle.
            // We don't know if it's the same person; assume same until a face
            // has been absent long enough (handled by face_was_absent above).
            const bool was_not_unknown =
                !last_status.has_value() ||
                last_status != facegate::domain::AccessStatus::Unknown;
            const bool throttle_expired =
                last_status == facegate::domain::AccessStatus::Unknown &&
                (current - last_unknown_emitted_at) >= unknown_throttle_;

            if (was_not_unknown || throttle_expired) {
                should_emit = true;
                std::cerr << "Pipeline: no match (rejected by threshold)\n";
                buzzer_.beep_denied();
                last_status = facegate::domain::AccessStatus::Unknown;
                last_employee.reset();
                last_unknown_emitted_at = current;
            }
        }

        last_face_seen_at = current;
        ever_seen_face = true;

        if (should_emit) {
            auto msg = facegate::mqtt::serialize(event);
            try_publish_or_enqueue(publisher_, storage_, msg);
        }
    }
}

void Pipeline::auxiliary_loop() {
    using clock = std::chrono::steady_clock;

    auto last_heartbeat = clock::now();
    const auto heartbeat_interval =
        std::chrono::seconds(heartbeat_interval_seconds_);

    constexpr int kDrainBatchSize = 50;

    while (!stop_.load()) {
        {
            std::unique_lock<std::mutex> lock(stop_mutex_);
            stop_cv_.wait_for(lock, std::chrono::seconds(1), [this]{
                return stop_.load();
            });
        }

        if (stop_.load()) {
            break;
        }

        const auto current = clock::now();
        if (current - last_heartbeat >= heartbeat_interval) {
            facegate::domain::Heartbeat hb;
            hb.timestamp = now();

            auto msg = facegate::mqtt::serialize(hb, device_id_);
            try_publish_or_enqueue(publisher_, storage_, msg);

            last_heartbeat = current;
        }

        if (publisher_.is_connected()) {
            try {
                auto pending = storage_.fetch_pending_events(kDrainBatchSize);
                for (const auto& event : pending) {
                    facegate::mqtt::SerializedMessage msg{
                        event.topic.c_str(),
                        event.payload
                    };

                    if (publisher_.publish(msg)) {
                        storage_.delete_pending_event(event.id);
                    } else {
                        break;
                    }
                }
            } catch (const std::exception& e) {
                std::cerr << "Pipeline: drainer failed: " << e.what() << "\n";
            }
        }
    }
}

}  // namespace facegate::pipeline

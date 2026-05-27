#include "pipeline/pipeline.hpp"

#include <algorithm>
#include <chrono>
#include <iostream>
#include <memory>
#include <optional>
#include <stdexcept>
#include <thread>
#include <utility>

#include "hardware/camera.hpp"
#include "hardware/turnstile.hpp"
#include "hardware/buzzer.hpp"
#include "hardware/rgb_led.hpp"
#include "vision/face_detector.hpp"
#include "vision/face_embedder.hpp"
#include "vision/matcher.hpp"
#include "storage/storage.hpp"
#include "mqtt/mqtt_publisher.hpp"
#include "mqtt/serialization.hpp"
#include "domain/domain.hpp"
#include "pipeline/stage_profiler.hpp"

namespace facegate::pipeline {

Pipeline::Pipeline(
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
    int face_stabilization_ms,
    std::string metrics_csv_path,
    int metrics_summary_interval_cycles
)
    : camera_(camera),
      detector_(detector),
      embedder_(embedder),
      matcher_(matcher),
      turnstile_(turnstile),
      buzzer_(buzzer),
      led_(led),
      storage_(storage),
      publisher_(publisher),
      device_id_(std::move(device_id)),
      heartbeat_interval_seconds_(heartbeat_interval_seconds),
      idle_reset_(idle_reset_seconds),
      unknown_throttle_(unknown_throttle_seconds),
      open_hold_(open_hold_ms),
      denied_cooldown_(denied_cooldown_ms),
      face_stabilization_(face_stabilization_ms) {
    if (!metrics_csv_path.empty() || metrics_summary_interval_cycles > 0) {
        profiler_ = std::make_unique<StageProfiler>(
            std::move(metrics_csv_path), metrics_summary_interval_cycles
        );
    }
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
    using std::chrono::duration_cast;
    using std::chrono::microseconds;

    // Dedup state. We run at ~30 fps so without this the system would emit
    // ~180 events/min for someone standing in front of the camera. Instead we
    // emit only on meaningful transitions.
    std::optional<facegate::domain::AccessStatus> last_status;
    std::optional<facegate::domain::EmployeeId> last_employee;
    steady::time_point last_face_seen_at{};
    steady::time_point last_unknown_emitted_at{};
    bool ever_seen_face = false;

    // While we're inside the granted-open window or the denied cooldown, the
    // hardware (servo + LED) owns the moment — skip detection entirely so a
    // second face can't re-trigger anything until the window closes.
    steady::time_point block_until{};

    // Stabilization streak: a face must be continuously detected for
    // face_stabilization_ before embedding/matching/emit. Absorbs short
    // detector hiccups (single missed frames) via a small grace window so
    // a flicker doesn't restart the streak.
    steady::time_point streak_start{};
    steady::time_point last_detect_at{};
    constexpr auto kStreakGapGrace = std::chrono::milliseconds(300);

    while (!stop_.load()) {
        const auto loop_start = steady::now();
        if (loop_start < block_until) {
            const auto remaining = block_until - loop_start;
            const auto step = std::min<std::chrono::nanoseconds>(
                remaining, std::chrono::milliseconds(50));
            std::this_thread::sleep_for(step);
            continue;
        }

        const auto t_capture_start = steady::now();
        auto frame_opt = camera_.capture();
        const auto t_capture_end = steady::now();
        if (!frame_opt) {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            continue;
        }

        const cv::Mat& frame = *frame_opt;

        CycleSample sample{};
        sample.capture = duration_cast<microseconds>(t_capture_end - t_capture_start);

        const auto t_detect_start = steady::now();
        auto detection_opt = detector_.detect_best(frame);
        const auto t_detect_end = steady::now();
        sample.detect = duration_cast<microseconds>(t_detect_end - t_detect_start);
        if (!detection_opt) {
            if (profiler_) profiler_->record(sample);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            continue;
        }

        // Stabilization gate: skip embedding/matching until a face has been
        // continuously detected for face_stabilization_. Avoids premature
        // "unknown" decisions on partial faces (e.g. eyes only) during the
        // approach to the camera.
        const auto detect_time = t_detect_end;
        const bool new_streak =
            streak_start == steady::time_point{} ||
            (detect_time - last_detect_at) > kStreakGapGrace;
        if (new_streak) {
            streak_start = detect_time;
        }
        last_detect_at = detect_time;
        if (face_stabilization_.count() > 0 &&
            (detect_time - streak_start) < face_stabilization_) {
            if (profiler_) profiler_->record(sample);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            continue;
        }

        const auto t_embed_start = steady::now();
        auto embedding_opt = embedder_.extract(frame, *detection_opt);
        const auto t_embed_end = steady::now();
        sample.embed = duration_cast<microseconds>(t_embed_end - t_embed_start);
        if (!embedding_opt) {
            facegate::domain::DeviceFault fault;
            fault.timestamp = now();
            fault.kind = facegate::domain::FaultKind::InferenceFailure;
            fault.message = "FaceEmbedder failed to extract embedding";

            auto msg = facegate::mqtt::serialize(fault, device_id_);
            try_publish_or_enqueue(publisher_, storage_, msg);

            if (profiler_) profiler_->record(sample);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            continue;
        }

        const auto t_match_start = steady::now();
        auto match_result = matcher_.find_match(*embedding_opt);
        const auto t_match_end = steady::now();
        sample.match = duration_cast<microseconds>(t_match_end - t_match_start);

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
                // Non-blocking — turnstile thread handles the open + close,
                // LED worker holds green until the window expires. Gating the
                // loop here is what guarantees no second face is processed
                // during this window.
                turnstile_.grant_access();
                led_.show_granted(static_cast<int>(open_hold_.count()));
                block_until = steady::now() + open_hold_;
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
                // Arm the LED + gate BEFORE the (blocking) buzzer so that
                // the red window is measured from when the unknown was
                // decided, not from when the beep ends.
                led_.show_denied(static_cast<int>(denied_cooldown_.count()));
                block_until = steady::now() + denied_cooldown_;
                buzzer_.beep_denied();
                last_status = facegate::domain::AccessStatus::Unknown;
                last_employee.reset();
                last_unknown_emitted_at = current;
            }
        }

        last_face_seen_at = current;
        ever_seen_face = true;

        if (should_emit) {
            const auto t_publish_start = steady::now();
            auto msg = facegate::mqtt::serialize(event);
            try_publish_or_enqueue(publisher_, storage_, msg);
            const auto t_publish_end = steady::now();
            sample.publish = duration_cast<microseconds>(t_publish_end - t_publish_start);
        }

        if (profiler_) profiler_->record(sample);
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

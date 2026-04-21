#include "mqtt/serialization.hpp"

#include <chrono>

#include <nlohmann/json.hpp>

#include "mqtt/topics.hpp"

namespace facegate::mqtt {

namespace {

std::int64_t to_epoch_ms(const facegate::domain::Timestamp& ts) {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        ts.time_since_epoch()
    ).count();
}

const char* status_to_string(facegate::domain::AccessStatus status) {
    switch (status) {
        case facegate::domain::AccessStatus::Granted: return "granted";
        case facegate::domain::AccessStatus::Denied:  return "denied";
        case facegate::domain::AccessStatus::Unknown: return "unknown";
    }
    return "unknown";
}

const char* fault_kind_to_string(facegate::domain::FaultKind kind) {
    switch (kind) {
        case facegate::domain::FaultKind::CameraFailure:    return "camera_failure";
        case facegate::domain::FaultKind::InferenceFailure: return "inference_failure";
        case facegate::domain::FaultKind::StorageFailure:   return "storage_failure";
        case facegate::domain::FaultKind::Other:            return "other";
    }
    return "other";
}

}  // namespace

SerializedMessage serialize(const facegate::domain::AccessEvent& event) {
    nlohmann::json j;
    j["timestamp_ms"] = to_epoch_ms(event.timestamp);
    j["status"] = status_to_string(event.status);

    if (event.employee.has_value()) {
        j["employee_id"] = *event.employee;
    } else {
        j["employee_id"] = nullptr;
    }

    if (event.distance.has_value()) {
        j["distance"] = *event.distance;
    } else {
        j["distance"] = nullptr;
    }

    return {topics::kAccessEvent, j.dump()};
}

SerializedMessage serialize(const facegate::domain::Heartbeat& heartbeat,
                            const std::string& device_id) {
    nlohmann::json j;
    j["timestamp_ms"] = to_epoch_ms(heartbeat.timestamp);
    j["device_id"] = device_id;

    return {topics::kHeartbeat, j.dump()};
}

SerializedMessage serialize(const facegate::domain::DeviceFault& fault,
                            const std::string& device_id) {
    nlohmann::json j;
    j["timestamp_ms"] = to_epoch_ms(fault.timestamp);
    j["device_id"] = device_id;
    j["kind"] = fault_kind_to_string(fault.kind);
    j["message"] = fault.message;

    return {topics::kDeviceFault, j.dump()};
}

}  // namespace facegate::mqtt

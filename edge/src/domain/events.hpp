#pragma once

#include <optional>

#include "./types.hpp"

namespace facegate::domain {

    enum class AccessStatus {
        Granted,
        Denied,
        Unknown,
    };

    struct AccessEvent {
        Timestamp timestamp;
        AccessStatus status;
        std::optional<EmployeeId> employee;
        std::optional<float> distance;
    };

    enum class FaultKind {
        CameraFailure,
        InferenceFailure,
        StorageFailure,
        Other,
    };

    struct DeviceFault {
        Timestamp timestamp;
        FaultKind kind;
        std::string message;
    };

    struct Heartbeat {
        Timestamp timestamp;
    };

}  // namespace facegate::domain

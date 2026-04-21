#pragma once

#include <string>

#include "domain/domain.hpp"

namespace facegate::mqtt {

struct SerializedMessage {
    const char* topic;
    std::string payload;
};

SerializedMessage serialize(const facegate::domain::AccessEvent& event);
SerializedMessage serialize(const facegate::domain::Heartbeat& heartbeat,
                            const std::string& device_id);
SerializedMessage serialize(const facegate::domain::DeviceFault& fault,
                            const std::string& device_id);

}  // namespace facegate::mqtt

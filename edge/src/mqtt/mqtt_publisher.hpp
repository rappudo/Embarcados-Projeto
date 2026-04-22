#pragma once

#include <atomic>
#include <string>

#include "mqtt/serialization.hpp"

namespace facegate::mqtt {

class MqttPublisher {
public:
    MqttPublisher(
        const std::string& client_id,
        const std::string& broker_host,
        int broker_port,
        int keepalive_seconds
    );
    ~MqttPublisher();

    MqttPublisher(const MqttPublisher&) = delete;
    MqttPublisher& operator=(const MqttPublisher&) = delete;
    MqttPublisher(MqttPublisher&&) = delete;
    MqttPublisher& operator=(MqttPublisher&&) = delete;

    bool publish(const SerializedMessage& message);

    bool is_connected() const noexcept;

private:
    struct Impl;
    Impl* impl_;

    std::atomic<bool> connected_{false};
};

}  // namespace facegate::mqtt

#pragma once

#include <atomic>
#include <string>

namespace facegate::storage { class Storage; }
namespace facegate::vision  { class Matcher; }

namespace facegate::mqtt {

/// Subscribes to `facegate/sync/embeddings/upsert/+` and mirrors the
/// backend's embedding catalog into local `Storage` and the live
/// `Matcher` cache. `clean_session=false` + a stable `client_id` give
/// the broker a per-device offline queue for messages published while
/// the Pi is down; retained messages give a full snapshot on cold start.
class MqttSubscriber {
public:
    MqttSubscriber(
        const std::string& client_id,
        const std::string& broker_host,
        int broker_port,
        int keepalive_seconds,
        facegate::storage::Storage& storage,
        facegate::vision::Matcher& matcher
    );
    ~MqttSubscriber();

    MqttSubscriber(const MqttSubscriber&) = delete;
    MqttSubscriber& operator=(const MqttSubscriber&) = delete;
    MqttSubscriber(MqttSubscriber&&) = delete;
    MqttSubscriber& operator=(MqttSubscriber&&) = delete;

    bool is_connected() const noexcept;

private:
    struct Impl;
    Impl* impl_;

    std::atomic<bool> connected_{false};
};

}  // namespace facegate::mqtt

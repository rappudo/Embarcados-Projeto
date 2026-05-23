#include "mqtt/mqtt_subscriber.hpp"

#if __has_include(<mosquitto/libmosquittopp.h>)
#  include <mosquitto/libmosquittopp.h>
#else
#  include <mosquittopp.h>
#endif
#include <nlohmann/json.hpp>

#include <cstdint>
#include <cstring>
#include <exception>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <string>
#include <string_view>

#include "domain/domain.hpp"
#include "storage/storage.hpp"
#include "vision/matcher.hpp"

namespace facegate::mqtt {

namespace {

constexpr int kQos = 1;
constexpr const char* kSubscribeTopic = "facegate/sync/embeddings/upsert/+";
constexpr std::string_view kTopicPrefix = "facegate/sync/embeddings/upsert/";

std::once_flag g_lib_init_flag;

void init_mosquitto_lib_once() {
    std::call_once(g_lib_init_flag, []() {
        mosqpp::lib_init();
    });
}

/// Extract the trailing `embedding_id` from a topic like
/// `facegate/sync/embeddings/upsert/42`. Returns 0 on failure
/// (and the caller drops the message).
std::int64_t parse_embedding_id_from_topic(const std::string& topic) {
    if (topic.size() <= kTopicPrefix.size()) {
        return 0;
    }
    if (topic.compare(0, kTopicPrefix.size(), kTopicPrefix) != 0) {
        return 0;
    }
    const std::string suffix = topic.substr(kTopicPrefix.size());
    try {
        return static_cast<std::int64_t>(std::stoll(suffix));
    } catch (...) {
        return 0;
    }
}

}  // namespace

struct MqttSubscriber::Impl : public mosqpp::mosquittopp {
    std::atomic<bool>* connected_flag;
    facegate::storage::Storage& storage;
    facegate::vision::Matcher& matcher;
    std::string broker_host;
    int broker_port;

    Impl(const char* client_id,
         std::atomic<bool>* connected_flag_ptr,
         facegate::storage::Storage& storage_ref,
         facegate::vision::Matcher& matcher_ref,
         const std::string& host,
         int port)
        // clean_session=true: the broker stores backend upserts with retain=true,
        // so subscribing fully re-syncs the current embedding state. A persistent
        // session would *also* queue those same messages and re-deliver them on
        // reconnect — duplicate work for every embedding at startup.
        : mosqpp::mosquittopp(client_id, /*clean_session=*/true),
          connected_flag(connected_flag_ptr),
          storage(storage_ref),
          matcher(matcher_ref),
          broker_host(host),
          broker_port(port) {
        reconnect_delay_set(1, 30, true);
    }

    void on_connect(int rc) override {
        if (rc != 0) {
            connected_flag->store(false);
            std::cerr << "MqttSubscriber: connect failed, rc=" << rc << "\n";
            return;
        }
        connected_flag->store(true);
        std::cerr << "MqttSubscriber: connected to " << broker_host
                  << ":" << broker_port << "\n";

        const int sub_rc = subscribe(nullptr, kSubscribeTopic, kQos);
        if (sub_rc != MOSQ_ERR_SUCCESS) {
            std::cerr << "MqttSubscriber: subscribe failed, rc=" << sub_rc << "\n";
        } else {
            std::cerr << "MqttSubscriber: subscribed to '" << kSubscribeTopic
                      << "' (QoS " << kQos << ")\n";
        }
    }

    void on_disconnect(int rc) override {
        connected_flag->store(false);
        std::cerr << "MqttSubscriber: disconnected (rc=" << rc << ")\n";
    }

    void on_message(const struct mosquitto_message* msg) override {
        if (msg == nullptr || msg->topic == nullptr) {
            return;
        }
        const std::string topic(msg->topic);
        const std::int64_t embedding_id = parse_embedding_id_from_topic(topic);
        if (embedding_id == 0) {
            std::cerr << "MqttSubscriber: ignoring message on unexpected topic '"
                      << topic << "'\n";
            return;
        }

        // Empty payload => tombstone. Broker also drops the retention slot.
        if (msg->payloadlen == 0 || msg->payload == nullptr) {
            try {
                storage.delete_embedding(embedding_id);
                matcher.remove(embedding_id);
                std::cerr << "MqttSubscriber: removed embedding id="
                          << embedding_id << "\n";
            } catch (const std::exception& e) {
                std::cerr << "MqttSubscriber: delete failed for id="
                          << embedding_id << ": " << e.what() << "\n";
            }
            return;
        }

        try {
            const std::string payload(
                static_cast<const char*>(msg->payload),
                static_cast<std::size_t>(msg->payloadlen)
            );
            const auto j = nlohmann::json::parse(payload);

            const auto json_id = j.at("embedding_id").get<std::int64_t>();
            const auto employee_id = j.at("employee_id").get<std::int64_t>();
            const auto& vec_json = j.at("vector");

            if (json_id != embedding_id) {
                std::cerr << "MqttSubscriber: topic/body id mismatch (topic="
                          << embedding_id << ", body=" << json_id
                          << "); trusting topic\n";
            }

            if (!vec_json.is_array() ||
                vec_json.size() != facegate::domain::EMBEDDING_DIM) {
                std::cerr << "MqttSubscriber: bad vector length on id="
                          << embedding_id << " (got " << vec_json.size()
                          << ", expected " << facegate::domain::EMBEDDING_DIM
                          << ")\n";
                return;
            }

            facegate::domain::Embedding emb{};
            emb.id = embedding_id;
            emb.owner = static_cast<facegate::domain::EmployeeId>(employee_id);
            for (std::size_t i = 0; i < facegate::domain::EMBEDDING_DIM; ++i) {
                emb.vector[i] = vec_json[i].get<float>();
            }

            storage.upsert_embedding(emb);
            matcher.upsert(emb);
            std::cerr << "MqttSubscriber: upserted embedding id="
                      << embedding_id << " owner=" << employee_id << "\n";
        } catch (const std::exception& e) {
            std::cerr << "MqttSubscriber: failed to apply upsert for id="
                      << embedding_id << ": " << e.what() << "\n";
        }
    }
};

MqttSubscriber::MqttSubscriber(
    const std::string& client_id,
    const std::string& broker_host,
    int broker_port,
    int keepalive_seconds,
    facegate::storage::Storage& storage,
    facegate::vision::Matcher& matcher
)
    : impl_(nullptr) {
    init_mosquitto_lib_once();

    try {
        impl_ = new Impl(
            client_id.c_str(),
            &connected_,
            storage,
            matcher,
            broker_host,
            broker_port
        );
    } catch (const std::exception& e) {
        throw std::runtime_error(
            std::string("MqttSubscriber: failed to create client: ") + e.what()
        );
    }

    const int rc_connect = impl_->connect_async(
        broker_host.c_str(), broker_port, keepalive_seconds
    );
    if (rc_connect != MOSQ_ERR_SUCCESS && rc_connect != MOSQ_ERR_ERRNO) {
        delete impl_;
        throw std::runtime_error(
            "MqttSubscriber: connect_async failed with code "
            + std::to_string(rc_connect)
        );
    }

    const int rc_loop = impl_->loop_start();
    if (rc_loop != MOSQ_ERR_SUCCESS) {
        impl_->disconnect();
        delete impl_;
        throw std::runtime_error(
            "MqttSubscriber: loop_start failed with code "
            + std::to_string(rc_loop)
        );
    }
}

MqttSubscriber::~MqttSubscriber() {
    if (impl_) {
        impl_->disconnect();
        impl_->loop_stop();
        delete impl_;
    }
}

bool MqttSubscriber::is_connected() const noexcept {
    return connected_.load();
}

}  // namespace facegate::mqtt

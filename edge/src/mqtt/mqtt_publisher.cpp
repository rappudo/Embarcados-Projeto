#include "mqtt/mqtt_publisher.hpp"

#if __has_include(<mosquitto/libmosquittopp.h>)
#  include <mosquitto/libmosquittopp.h>
#else
#  include <mosquittopp.h>
#endif

#include <iostream>
#include <mutex>
#include <stdexcept>

namespace facegate::mqtt {

namespace {

constexpr int kDefaultQos = 1;

std::once_flag g_lib_init_flag;

void init_mosquitto_lib_once() {
    std::call_once(g_lib_init_flag, []() {
        mosqpp::lib_init();
    });
}

}  // namespace

struct MqttPublisher::Impl : public mosqpp::mosquittopp {
    std::atomic<bool>* connected_flag;
    std::string broker_host;
    int broker_port;
    int keepalive;

    Impl(const char* client_id,
         std::atomic<bool>* connected_flag_ptr,
         const std::string& host,
         int port,
         int keep_s)
        : mosqpp::mosquittopp(client_id),
          connected_flag(connected_flag_ptr),
          broker_host(host),
          broker_port(port),
          keepalive(keep_s) {
        reconnect_delay_set(1, 30, true);
    }

    void on_connect(int rc) override {
        if (rc == 0) {
            connected_flag->store(true);
            std::cerr << "MqttPublisher: connected to " << broker_host
                      << ":" << broker_port << "\n";
        } else {
            connected_flag->store(false);
            std::cerr << "MqttPublisher: connect failed, rc=" << rc << "\n";
        }
    }

    void on_disconnect(int rc) override {
        connected_flag->store(false);
        std::cerr << "MqttPublisher: disconnected (rc=" << rc << ")\n";
    }
};

MqttPublisher::MqttPublisher(
    const std::string& client_id,
    const std::string& broker_host,
    int broker_port,
    int keepalive_seconds
)
    : impl_(nullptr) {
    init_mosquitto_lib_once();

    try {
        impl_ = new Impl(
            client_id.c_str(),
            &connected_,
            broker_host,
            broker_port,
            keepalive_seconds
        );
    } catch (const std::exception& e) {
        throw std::runtime_error(
            std::string("MqttPublisher: failed to create client: ") + e.what()
        );
    }

    const int rc_connect = impl_->connect_async(
        broker_host.c_str(), broker_port, keepalive_seconds
    );
    if (rc_connect != MOSQ_ERR_SUCCESS && rc_connect != MOSQ_ERR_ERRNO) {
        delete impl_;
        throw std::runtime_error(
            "MqttPublisher: connect_async failed with code " + std::to_string(rc_connect)
        );
    }

    const int rc_loop = impl_->loop_start();
    if (rc_loop != MOSQ_ERR_SUCCESS) {
        impl_->disconnect();
        delete impl_;
        throw std::runtime_error(
            "MqttPublisher: loop_start failed with code " + std::to_string(rc_loop)
        );
    }
}

MqttPublisher::~MqttPublisher() {
    if (impl_) {
        impl_->disconnect();
        impl_->loop_stop();
        delete impl_;
    }
}

bool MqttPublisher::publish(const SerializedMessage& message) {
    if (!impl_ || !connected_.load()) {
        return false;
    }

    const int rc = impl_->publish(
        nullptr,
        message.topic,
        static_cast<int>(message.payload.size()),
        message.payload.data(),
        kDefaultQos,
        false
    );

    return rc == MOSQ_ERR_SUCCESS;
}

bool MqttPublisher::is_connected() const noexcept {
    return connected_.load();
}

}  // namespace facegate::mqtt

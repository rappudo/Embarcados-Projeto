#include "./relay.hpp"

#include <gpiod.h>

#include <chrono>
#include <stdexcept>
#include <iostream>
#include <string>
#include <thread>

namespace facegate::hardware {

struct Relay::Impl {
    gpiod_chip* chip = nullptr;
    gpiod_line_request* request = nullptr;
    unsigned int offset = 0;
};

Relay::Relay(const char* chip_path, int line_offset, int pulse_ms, bool enabled)
    : impl_(nullptr), pulse_ms_(pulse_ms), enabled_(enabled) {
    if (!enabled_) {
        std::cerr << "Relay: GPIO disabled (mock mode)\n";
        return;
    }

    impl_ = new Impl();
    impl_->offset = static_cast<unsigned int>(line_offset);

    impl_->chip = gpiod_chip_open(chip_path);
    if (!impl_->chip) {
        delete impl_;
        impl_ = nullptr;
        throw std::runtime_error(
            std::string("Relay: failed to open GPIO chip '") + chip_path + "'"
        );
    }

    gpiod_line_settings* settings = gpiod_line_settings_new();
    gpiod_line_settings_set_direction(settings, GPIOD_LINE_DIRECTION_OUTPUT);
    gpiod_line_settings_set_output_value(settings, GPIOD_LINE_VALUE_INACTIVE);

    gpiod_line_config* line_cfg = gpiod_line_config_new();
    gpiod_line_config_add_line_settings(line_cfg, &impl_->offset, 1, settings);

    gpiod_request_config* req_cfg = gpiod_request_config_new();
    gpiod_request_config_set_consumer(req_cfg, "facegate-relay");

    impl_->request = gpiod_chip_request_lines(impl_->chip, req_cfg, line_cfg);

    gpiod_request_config_free(req_cfg);
    gpiod_line_config_free(line_cfg);
    gpiod_line_settings_free(settings);

    if (!impl_->request) {
        gpiod_chip_close(impl_->chip);
        delete impl_;
        throw std::runtime_error(
            "Relay: failed to request GPIO line " + std::to_string(line_offset)
        );
    }
}

Relay::~Relay() {
    if (impl_) {
        if (impl_->request) {
            gpiod_line_request_release(impl_->request);
        }
        if (impl_->chip) {
            gpiod_chip_close(impl_->chip);
        }
        delete impl_;
    }
}

void Relay::grant_access() {
    if (!enabled_) {
        std::cerr << "Relay: grant_access (mock)\n";
        return;
    }
    if (!impl_ || !impl_->request) {
        return;
    }

    gpiod_line_request_set_value(impl_->request, impl_->offset, GPIOD_LINE_VALUE_ACTIVE);
    std::this_thread::sleep_for(std::chrono::milliseconds(pulse_ms_));
    gpiod_line_request_set_value(impl_->request, impl_->offset, GPIOD_LINE_VALUE_INACTIVE);
}

}  // namespace facegate::hardware

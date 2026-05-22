#include "./buzzer.hpp"

#include <gpiod.h>

#include <chrono>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>

namespace facegate::hardware {

namespace {

// Passive piezo: needs an AC-like square wave to produce a tone. A static HIGH
// just clicks on the rising/falling edge. 2.7 kHz sits near the resonant peak
// of most small piezo discs.
constexpr int kToneFrequencyHz = 2700;
constexpr int kHalfPeriodUs = 1'000'000 / (kToneFrequencyHz * 2);

}  // namespace

struct Buzzer::Impl {
    gpiod_chip* chip = nullptr;
    gpiod_line_request* request = nullptr;
    unsigned int offset = 0;
};

Buzzer::Buzzer(const char* chip_path, int line_offset, int beep_ms, bool enabled)
    : impl_(nullptr), beep_ms_(beep_ms), enabled_(enabled) {
    if (!enabled_) {
        std::cerr << "Buzzer: GPIO disabled (mock mode)\n";
        return;
    }

    impl_ = new Impl();
    impl_->offset = static_cast<unsigned int>(line_offset);

    impl_->chip = gpiod_chip_open(chip_path);
    if (!impl_->chip) {
        delete impl_;
        impl_ = nullptr;
        throw std::runtime_error(
            std::string("Buzzer: failed to open GPIO chip '") + chip_path + "'"
        );
    }

    gpiod_line_settings* settings = gpiod_line_settings_new();
    gpiod_line_settings_set_direction(settings, GPIOD_LINE_DIRECTION_OUTPUT);
    gpiod_line_settings_set_output_value(settings, GPIOD_LINE_VALUE_INACTIVE);

    gpiod_line_config* line_cfg = gpiod_line_config_new();
    gpiod_line_config_add_line_settings(line_cfg, &impl_->offset, 1, settings);

    gpiod_request_config* req_cfg = gpiod_request_config_new();
    gpiod_request_config_set_consumer(req_cfg, "facegate-buzzer");

    impl_->request = gpiod_chip_request_lines(impl_->chip, req_cfg, line_cfg);

    gpiod_request_config_free(req_cfg);
    gpiod_line_config_free(line_cfg);
    gpiod_line_settings_free(settings);

    if (!impl_->request) {
        gpiod_chip_close(impl_->chip);
        delete impl_;
        impl_ = nullptr;
        throw std::runtime_error(
            "Buzzer: failed to request GPIO line " + std::to_string(line_offset)
        );
    }
}

Buzzer::~Buzzer() {
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

void Buzzer::beep_denied() {
    if (!enabled_) {
        std::cerr << "Buzzer: beep_denied (mock)\n";
        return;
    }
    if (!impl_ || !impl_->request) {
        return;
    }

    const auto deadline =
        std::chrono::steady_clock::now() + std::chrono::milliseconds(beep_ms_);
    while (std::chrono::steady_clock::now() < deadline) {
        gpiod_line_request_set_value(
            impl_->request, impl_->offset, GPIOD_LINE_VALUE_ACTIVE);
        std::this_thread::sleep_for(std::chrono::microseconds(kHalfPeriodUs));
        gpiod_line_request_set_value(
            impl_->request, impl_->offset, GPIOD_LINE_VALUE_INACTIVE);
        std::this_thread::sleep_for(std::chrono::microseconds(kHalfPeriodUs));
    }
}

}  // namespace facegate::hardware

#include "./turnstile.hpp"

#include <gpiod.h>

#include <chrono>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>

namespace facegate::hardware {

namespace {

constexpr int kPwmPeriodUs = 20000;  // 50 Hz — standard servo control frequency

}  // namespace

struct Turnstile::Impl {
    gpiod_chip* chip = nullptr;
    gpiod_line_request* request = nullptr;
    unsigned int offset = 0;
};

Turnstile::Turnstile(const char* chip_path,
                     int line_offset,
                     int open_hold_ms,
                     bool enabled,
                     int open_pulse_us)
    : impl_(nullptr),
      open_hold_ms_(open_hold_ms),
      enabled_(enabled),
      open_pulse_us_(open_pulse_us) {
    if (!enabled_) {
        std::cerr << "Turnstile: GPIO disabled (mock mode)\n";
        return;
    }

    impl_ = new Impl();
    impl_->offset = static_cast<unsigned int>(line_offset);

    impl_->chip = gpiod_chip_open(chip_path);
    if (!impl_->chip) {
        delete impl_;
        impl_ = nullptr;
        throw std::runtime_error(
            std::string("Turnstile: failed to open GPIO chip '") + chip_path + "'"
        );
    }

    gpiod_line_settings* settings = gpiod_line_settings_new();
    gpiod_line_settings_set_direction(settings, GPIOD_LINE_DIRECTION_OUTPUT);
    gpiod_line_settings_set_output_value(settings, GPIOD_LINE_VALUE_INACTIVE);

    gpiod_line_config* line_cfg = gpiod_line_config_new();
    gpiod_line_config_add_line_settings(line_cfg, &impl_->offset, 1, settings);

    gpiod_request_config* req_cfg = gpiod_request_config_new();
    gpiod_request_config_set_consumer(req_cfg, "facegate-turnstile");

    impl_->request = gpiod_chip_request_lines(impl_->chip, req_cfg, line_cfg);

    gpiod_request_config_free(req_cfg);
    gpiod_line_config_free(line_cfg);
    gpiod_line_settings_free(settings);

    if (!impl_->request) {
        gpiod_chip_close(impl_->chip);
        delete impl_;
        impl_ = nullptr;
        throw std::runtime_error(
            "Turnstile: failed to request GPIO line " + std::to_string(line_offset)
        );
    }

    thread_ = std::thread(&Turnstile::pwm_loop, this);
}

Turnstile::~Turnstile() {
    if (thread_.joinable()) {
        stop_.store(true);
        cv_.notify_all();
        thread_.join();
    }
    if (impl_) {
        if (impl_->request) {
            gpiod_line_request_set_value(
                impl_->request, impl_->offset, GPIOD_LINE_VALUE_INACTIVE);
            gpiod_line_request_release(impl_->request);
        }
        if (impl_->chip) {
            gpiod_chip_close(impl_->chip);
        }
        delete impl_;
    }
}

void Turnstile::grant_access() {
    if (!enabled_) {
        std::cerr << "Turnstile: grant_access (mock)\n";
        return;
    }
    if (!impl_ || !impl_->request) {
        return;
    }

    const auto new_target =
        std::chrono::steady_clock::now() + std::chrono::milliseconds(open_hold_ms_);
    {
        std::lock_guard<std::mutex> lock(mutex_);
        // Only extend the open window — never shorten it. Re-trigger during open
        // adds time; trigger from closed schedules a full open_hold_ms window.
        if (new_target > open_until_) {
            open_until_ = new_target;
        }
    }
    cv_.notify_all();
}

void Turnstile::pwm_loop() {
    // The servo is energized ONLY during the open window. While closed, the
    // line is held LOW and the thread sleeps on the condvar. grant_access()
    // wakes it; it pulses at 50 Hz until open_until_ elapses, then drops the
    // line and goes back to sleep. Closed position is held mechanically (bar
    // weight / spring) since no PWM = no servo torque.
    while (!stop_.load()) {
        std::chrono::steady_clock::time_point target;
        {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait(lock, [this]{
                return stop_.load() ||
                       std::chrono::steady_clock::now() < open_until_;
            });
            target = open_until_;
        }
        if (stop_.load()) break;

        // Emit PWM pulses until the open window expires.
        while (!stop_.load()) {
            const auto current = std::chrono::steady_clock::now();
            if (current >= target) break;

            gpiod_line_request_set_value(
                impl_->request, impl_->offset, GPIOD_LINE_VALUE_ACTIVE);
            std::this_thread::sleep_for(std::chrono::microseconds(open_pulse_us_));
            gpiod_line_request_set_value(
                impl_->request, impl_->offset, GPIOD_LINE_VALUE_INACTIVE);

            const int rest_us = kPwmPeriodUs - open_pulse_us_;
            if (rest_us > 0) {
                std::this_thread::sleep_for(std::chrono::microseconds(rest_us));
            }

            // Pick up any extension to open_until_ that arrived mid-cycle.
            std::lock_guard<std::mutex> lock(mutex_);
            target = open_until_;
        }

        // Ensure the line is LOW once the window closes so the servo is fully
        // de-energized (no holding torque, no leaked pulses).
        gpiod_line_request_set_value(
            impl_->request, impl_->offset, GPIOD_LINE_VALUE_INACTIVE);
    }
}

}  // namespace facegate::hardware

#include "./turnstile.hpp"

#include <gpiod.h>
#include <pthread.h>
#include <sched.h>

#include <chrono>
#include <cstring>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>

namespace facegate::hardware {

namespace {

constexpr int kPwmPeriodUs = 20000;  // 50 Hz — standard servo control frequency
constexpr int kCloseHoldMs = 500;    // Long enough for an SG90 to travel ~180°.

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
                     int open_pulse_us,
                     int closed_pulse_us)
    : impl_(nullptr),
      open_hold_ms_(open_hold_ms),
      enabled_(enabled),
      open_pulse_us_(open_pulse_us),
      closed_pulse_us_(closed_pulse_us) {
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

void Turnstile::emit_pulse_cycle(int pulse_us) {
    gpiod_line_request_set_value(
        impl_->request, impl_->offset, GPIOD_LINE_VALUE_ACTIVE);
    std::this_thread::sleep_for(std::chrono::microseconds(pulse_us));
    gpiod_line_request_set_value(
        impl_->request, impl_->offset, GPIOD_LINE_VALUE_INACTIVE);
    const int rest_us = kPwmPeriodUs - pulse_us;
    if (rest_us > 0) {
        std::this_thread::sleep_for(std::chrono::microseconds(rest_us));
    }
}

void Turnstile::emit_pulses_for(int pulse_us, int duration_ms) {
    const auto deadline =
        std::chrono::steady_clock::now() + std::chrono::milliseconds(duration_ms);
    while (!stop_.load() && std::chrono::steady_clock::now() < deadline) {
        emit_pulse_cycle(pulse_us);
    }
}

void Turnstile::set_thread_realtime_best_effort() {
    // SCHED_FIFO at the max priority keeps detection/encoding work from
    // preempting us mid-pulse, which is what made the servo twitch under load.
    // Requires CAP_SYS_NICE (or root); falls back silently with a warning.
    sched_param sp{};
    sp.sched_priority = sched_get_priority_max(SCHED_FIFO);
    const int rc = pthread_setschedparam(pthread_self(), SCHED_FIFO, &sp);
    if (rc != 0) {
        std::cerr << "Turnstile: SCHED_FIFO unavailable ("
                  << std::strerror(rc)
                  << ") — pulses may jitter under load\n";
    }
}

void Turnstile::pwm_loop() {
    set_thread_realtime_best_effort();

    // Drive to a known closed position at boot — without this the servo holds
    // whatever angle it happened to be in when powered on.
    emit_pulses_for(closed_pulse_us_, kCloseHoldMs);
    gpiod_line_request_set_value(
        impl_->request, impl_->offset, GPIOD_LINE_VALUE_INACTIVE);

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

        // Pulse the open angle until the window expires, picking up any
        // extension to open_until_ that arrived mid-cycle.
        while (!stop_.load()) {
            const auto current = std::chrono::steady_clock::now();
            if (current >= target) break;
            emit_pulse_cycle(open_pulse_us_);
            std::lock_guard<std::mutex> lock(mutex_);
            target = open_until_;
        }

        // Actively command the closed angle for long enough that the servo
        // physically travels back, then de-energize. Without this active
        // close phase the servo just stays where the last open pulse left it.
        emit_pulses_for(closed_pulse_us_, kCloseHoldMs);
        gpiod_line_request_set_value(
            impl_->request, impl_->offset, GPIOD_LINE_VALUE_INACTIVE);
    }
}

}  // namespace facegate::hardware

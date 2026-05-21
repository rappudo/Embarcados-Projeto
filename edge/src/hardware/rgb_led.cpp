#include "./rgb_led.hpp"

#include <gpiod.h>

#include <array>
#include <chrono>
#include <iostream>
#include <stdexcept>
#include <string>

namespace facegate::hardware {

struct RgbLed::Impl {
    gpiod_chip* chip = nullptr;
    gpiod_line_request* request = nullptr;
    std::array<unsigned int, 3> offsets{};  // [R, G, B]
};

RgbLed::RgbLed(const char* chip_path,
               int red_pin,
               int green_pin,
               int blue_pin,
               bool enabled,
               bool active_high)
    : impl_(nullptr),
      enabled_(enabled),
      active_high_(active_high) {
    if (!enabled_) {
        std::cerr << "RgbLed: GPIO disabled (mock mode)\n";
        return;
    }

    impl_ = new Impl();
    impl_->offsets = {
        static_cast<unsigned int>(red_pin),
        static_cast<unsigned int>(green_pin),
        static_cast<unsigned int>(blue_pin),
    };

    impl_->chip = gpiod_chip_open(chip_path);
    if (!impl_->chip) {
        delete impl_;
        impl_ = nullptr;
        throw std::runtime_error(
            std::string("RgbLed: failed to open GPIO chip '") + chip_path + "'"
        );
    }

    // Drive all three lines off at startup. "Off" means INACTIVE for
    // active-high LEDs and ACTIVE for active-anode LEDs.
    const auto off_value = active_high_
        ? GPIOD_LINE_VALUE_INACTIVE
        : GPIOD_LINE_VALUE_ACTIVE;

    gpiod_line_settings* settings = gpiod_line_settings_new();
    gpiod_line_settings_set_direction(settings, GPIOD_LINE_DIRECTION_OUTPUT);
    gpiod_line_settings_set_output_value(settings, off_value);

    gpiod_line_config* line_cfg = gpiod_line_config_new();
    gpiod_line_config_add_line_settings(
        line_cfg, impl_->offsets.data(), impl_->offsets.size(), settings);

    gpiod_request_config* req_cfg = gpiod_request_config_new();
    gpiod_request_config_set_consumer(req_cfg, "facegate-rgb-led");

    impl_->request = gpiod_chip_request_lines(impl_->chip, req_cfg, line_cfg);

    gpiod_request_config_free(req_cfg);
    gpiod_line_config_free(line_cfg);
    gpiod_line_settings_free(settings);

    if (!impl_->request) {
        gpiod_chip_close(impl_->chip);
        delete impl_;
        impl_ = nullptr;
        throw std::runtime_error(
            "RgbLed: failed to request GPIO lines " +
            std::to_string(red_pin) + "," +
            std::to_string(green_pin) + "," +
            std::to_string(blue_pin)
        );
    }

    thread_ = std::thread(&RgbLed::worker_loop, this);
}

RgbLed::~RgbLed() {
    if (thread_.joinable()) {
        stop_.store(true);
        cv_.notify_all();
        thread_.join();
    }
    if (impl_) {
        if (impl_->request) {
            write_channels(false, false, false);
            gpiod_line_request_release(impl_->request);
        }
        if (impl_->chip) {
            gpiod_chip_close(impl_->chip);
        }
        delete impl_;
    }
}

void RgbLed::show_granted(int hold_ms) {
    if (!enabled_) {
        std::cerr << "RgbLed: show_granted (mock)\n";
        return;
    }
    arm(false, true, false, hold_ms);
}

void RgbLed::show_denied(int hold_ms) {
    if (!enabled_) {
        std::cerr << "RgbLed: show_denied (mock)\n";
        return;
    }
    arm(true, false, false, hold_ms);
}

void RgbLed::arm(bool r, bool g, bool b, int hold_ms) {
    if (!impl_ || !impl_->request) {
        return;
    }
    const auto deadline =
        std::chrono::steady_clock::now() + std::chrono::milliseconds(hold_ms);
    {
        std::lock_guard<std::mutex> lock(mutex_);
        target_r_ = r;
        target_g_ = g;
        target_b_ = b;
        off_at_ = deadline;
        dirty_ = true;
    }
    cv_.notify_all();
}

void RgbLed::write_channels(bool r, bool g, bool b) {
    if (!impl_ || !impl_->request) {
        return;
    }
    const auto on_value = active_high_
        ? GPIOD_LINE_VALUE_ACTIVE
        : GPIOD_LINE_VALUE_INACTIVE;
    const auto off_value = active_high_
        ? GPIOD_LINE_VALUE_INACTIVE
        : GPIOD_LINE_VALUE_ACTIVE;

    gpiod_line_request_set_value(
        impl_->request, impl_->offsets[0], r ? on_value : off_value);
    gpiod_line_request_set_value(
        impl_->request, impl_->offsets[1], g ? on_value : off_value);
    gpiod_line_request_set_value(
        impl_->request, impl_->offsets[2], b ? on_value : off_value);
}

void RgbLed::worker_loop() {
    while (!stop_.load()) {
        bool r = false, g = false, b = false;
        std::chrono::steady_clock::time_point deadline;
        {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait(lock, [this]{ return stop_.load() || dirty_; });
            if (stop_.load()) break;
            dirty_ = false;
            r = target_r_;
            g = target_g_;
            b = target_b_;
            deadline = off_at_;
        }

        write_channels(r, g, b);

        // Hold the color until the deadline, or until a new arm() supersedes
        // us. Re-arming flips `dirty_` and wakes us — re-loop to apply the
        // new state.
        std::unique_lock<std::mutex> lock(mutex_);
        cv_.wait_until(lock, deadline, [this]{
            return stop_.load() || dirty_;
        });

        if (stop_.load()) break;
        if (dirty_) continue;

        // Deadline expired without a new command — turn the LED off.
        lock.unlock();
        write_channels(false, false, false);
    }

    write_channels(false, false, false);
}

}  // namespace facegate::hardware

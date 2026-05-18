#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>

namespace facegate::hardware {

// SG90-style servo driven by software PWM at 50 Hz on a single GPIO line.
// `grant_access()` is non-blocking: it just (re)arms an "open until" timestamp
// and wakes the worker. The worker emits PWM pulses ONLY while the open window
// is active; once it expires, it drives the line LOW and sleeps on a condvar
// until the next grant. This keeps the servo unpowered when closed (no jitter,
// no continuous current draw) and relies on mechanical bias / gravity to keep
// the bar in the closed position. Re-triggering while open just extends the
// open window — it never restarts the open/close cycle.
class Turnstile {
public:
    Turnstile(const char* chip_path,
              int line_offset,
              int open_hold_ms,
              bool enabled,
              int open_pulse_us = 2000);
    ~Turnstile();

    Turnstile(const Turnstile&) = delete;
    Turnstile& operator=(const Turnstile&) = delete;
    Turnstile(Turnstile&&) = delete;
    Turnstile& operator=(Turnstile&&) = delete;

    void grant_access();

private:
    void pwm_loop();

    struct Impl;
    Impl* impl_;

    int open_hold_ms_;
    bool enabled_;
    int open_pulse_us_;

    std::atomic<bool> stop_{false};
    std::mutex mutex_;
    std::condition_variable cv_;
    std::chrono::steady_clock::time_point open_until_{};
    std::thread thread_;
};

}  // namespace facegate::hardware

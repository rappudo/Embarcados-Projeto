#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>

namespace facegate::hardware {

// SG90-style servo driven by software PWM at 50 Hz on a single GPIO line.
// `grant_access()` is non-blocking: it just (re)arms an "open until" timestamp
// and wakes the worker. The worker pulses the open angle while the window is
// active; when the window expires it pulses the closed angle for long enough
// that the servo physically travels back, then drops the line LOW and sleeps
// on a condvar until the next grant. A close pulse is also emitted at startup
// so the servo position is defined from boot. Re-triggering while open just
// extends the open window — it never restarts the open/close cycle.
class Turnstile {
public:
    Turnstile(const char* chip_path,
              int line_offset,
              int open_hold_ms,
              bool enabled,
              int open_pulse_us = 2000,
              int closed_pulse_us = 1000);
    ~Turnstile();

    Turnstile(const Turnstile&) = delete;
    Turnstile& operator=(const Turnstile&) = delete;
    Turnstile(Turnstile&&) = delete;
    Turnstile& operator=(Turnstile&&) = delete;

    void grant_access();

private:
    void pwm_loop();
    void emit_pulse_cycle(int pulse_us);
    void emit_pulses_for(int pulse_us, int duration_ms);
    void set_thread_realtime_best_effort();

    struct Impl;
    Impl* impl_;

    int open_hold_ms_;
    bool enabled_;
    int open_pulse_us_;
    int closed_pulse_us_;

    std::atomic<bool> stop_{false};
    std::mutex mutex_;
    std::condition_variable cv_;
    std::chrono::steady_clock::time_point open_until_{};
    std::thread thread_;
};

}  // namespace facegate::hardware

#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>

namespace facegate::hardware {

// Three-channel RGB LED driven by raw digital writes on three GPIO lines.
// `show_granted` / `show_denied` are non-blocking: they (re)arm a color +
// off-deadline and wake the worker, which holds the color until the deadline
// elapses or another command supersedes it. Re-triggering replaces both the
// color and the deadline — there is no queue.
//
// `active_high == true`  (common-cathode LEDs): channel HIGH lights the color.
// `active_high == false` (common-anode LEDs):   channel LOW  lights the color.
class RgbLed {
public:
    RgbLed(const char* chip_path,
           int red_pin,
           int green_pin,
           int blue_pin,
           bool enabled,
           bool active_high = true);
    ~RgbLed();

    RgbLed(const RgbLed&) = delete;
    RgbLed& operator=(const RgbLed&) = delete;
    RgbLed(RgbLed&&) = delete;
    RgbLed& operator=(RgbLed&&) = delete;

    void show_granted(int hold_ms);
    void show_denied(int hold_ms);

private:
    void worker_loop();
    void write_channels(bool r, bool g, bool b);
    void arm(bool r, bool g, bool b, int hold_ms);

    struct Impl;
    Impl* impl_;

    bool enabled_;
    bool active_high_;

    std::atomic<bool> stop_{false};
    std::mutex mutex_;
    std::condition_variable cv_;
    bool target_r_{false};
    bool target_g_{false};
    bool target_b_{false};
    std::chrono::steady_clock::time_point off_at_{};
    bool dirty_{false};
    std::thread thread_;
};

}  // namespace facegate::hardware

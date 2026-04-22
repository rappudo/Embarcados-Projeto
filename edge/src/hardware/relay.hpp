#pragma once

#include <cstdint>

namespace facegate::hardware {

class Relay {
public:
Relay(const char* chip_path, int line_offset, int pulse_ms, bool enabled);
    ~Relay();

    Relay(const Relay&) = delete;
    Relay& operator=(const Relay&) = delete;
    Relay(Relay&&) = delete;
    Relay& operator=(Relay&&) = delete;

    void grant_access();

    private:
        struct Impl;
        Impl* impl_;
        int pulse_ms_;
        bool enabled_;
    };

}  // namespace facegate::hardware

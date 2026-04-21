#pragma once

namespace facegate::hardware {

class Buzzer {
public:
Buzzer(const char* chip_path, int line_offset, int beep_ms, bool enabled);
    ~Buzzer();

    Buzzer(const Buzzer&) = delete;
    Buzzer& operator=(const Buzzer&) = delete;
    Buzzer(Buzzer&&) = delete;
    Buzzer& operator=(Buzzer&&) = delete;

    void beep_denied();

    private:
        struct Impl;
        Impl* impl_;
        int beep_ms_;
        bool enabled_;
    };

}  // namespace facegate::hardware

#pragma once

#include <chrono>
#include <cstdint>
#include <fstream>
#include <optional>
#include <string>
#include <vector>

namespace facegate::pipeline {

// Per-iteration timings for the recognition pipeline. Stages that did not
// execute on a given cycle (e.g. no face detected → no embed/match) are
// std::nullopt and render as empty CSV cells.
struct CycleSample {
    std::chrono::microseconds capture;
    std::optional<std::chrono::microseconds> detect;
    std::optional<std::chrono::microseconds> embed;
    std::optional<std::chrono::microseconds> match;
    std::optional<std::chrono::microseconds> publish;
};

// Collects per-stage latency over the lifetime of the pipeline. Single-
// threaded by design — only the pipeline main loop calls record(). No
// mutex; sharing across threads is undefined.
class StageProfiler {
public:
    // csv_path empty disables file logging. summary_interval_cycles <= 0
    // disables the periodic stderr summary.
    StageProfiler(std::string csv_path, int summary_interval_cycles);
    ~StageProfiler();

    StageProfiler(const StageProfiler&) = delete;
    StageProfiler& operator=(const StageProfiler&) = delete;

    void record(const CycleSample& sample);

private:
    struct StageWindow {
        const char* name;
        std::vector<std::int64_t> samples_us;
    };

    void append_csv_row(const CycleSample& sample);
    void emit_summary();
    void push(StageWindow& w, std::optional<std::chrono::microseconds> v);

    std::string csv_path_;
    std::ofstream csv_;
    int summary_interval_cycles_;

    std::uint64_t cycle_index_ = 0;
    std::uint64_t cycles_since_summary_ = 0;

    StageWindow capture_{"capture", {}};
    StageWindow detect_{"detect", {}};
    StageWindow embed_{"embed", {}};
    StageWindow match_{"match", {}};
    StageWindow publish_{"publish", {}};
    StageWindow total_{"total", {}};
};

}  // namespace facegate::pipeline

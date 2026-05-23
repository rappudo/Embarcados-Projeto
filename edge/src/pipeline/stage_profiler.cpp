#include "pipeline/stage_profiler.hpp"

#include <algorithm>
#include <chrono>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <sstream>

namespace facegate::pipeline {

namespace {

void write_us(std::ofstream& out,
              const std::optional<std::chrono::microseconds>& v) {
    out << ',';
    if (v.has_value()) {
        out << v->count();
    }
}

struct StageStats {
    std::size_t n;
    double mean_us;
    std::int64_t p50_us;
    std::int64_t p95_us;
    std::int64_t max_us;
};

StageStats summarize(std::vector<std::int64_t>& samples) {
    StageStats s{samples.size(), 0.0, 0, 0, 0};
    if (samples.empty()) return s;

    std::sort(samples.begin(), samples.end());
    const std::int64_t sum =
        std::accumulate(samples.begin(), samples.end(), std::int64_t{0});
    s.mean_us = static_cast<double>(sum) / static_cast<double>(samples.size());

    const auto pick = [&](double q) {
        const std::size_t i = std::min(
            samples.size() - 1,
            static_cast<std::size_t>(q * static_cast<double>(samples.size()))
        );
        return samples[i];
    };
    s.p50_us = pick(0.50);
    s.p95_us = pick(0.95);
    s.max_us = samples.back();
    return s;
}

void format_stage(std::ostringstream& out, const char* name, StageStats s) {
    out << ' ' << name << ":n=" << s.n;
    if (s.n == 0) return;
    out << " mean=" << std::fixed << std::setprecision(2) << (s.mean_us / 1000.0)
        << "ms p50=" << (s.p50_us / 1000.0)
        << " p95=" << (s.p95_us / 1000.0)
        << " max=" << (s.max_us / 1000.0);
}

}  // namespace

StageProfiler::StageProfiler(std::string csv_path, int summary_interval_cycles)
    : csv_path_(std::move(csv_path)),
      summary_interval_cycles_(summary_interval_cycles) {
    if (!csv_path_.empty()) {
        // Append so successive runs accumulate; a fresh file gets the header.
        const bool needs_header = !std::ifstream(csv_path_).good();
        csv_.open(csv_path_, std::ios::app);
        if (!csv_) {
            std::cerr << "StageProfiler: failed to open '" << csv_path_
                      << "' for append; CSV logging disabled\n";
            csv_path_.clear();
        } else if (needs_header) {
            csv_ << "cycle,timestamp_ms,capture_us,detect_us,embed_us,"
                    "match_us,publish_us,total_us\n";
            csv_.flush();
        }
        std::cerr << "StageProfiler: logging cycles to '" << csv_path_ << "'\n";
    }
    if (summary_interval_cycles_ > 0) {
        std::cerr << "StageProfiler: stderr summary every "
                  << summary_interval_cycles_ << " cycles\n";
    }
}

StageProfiler::~StageProfiler() {
    if (cycles_since_summary_ > 0 && summary_interval_cycles_ > 0) {
        emit_summary();
    }
}

void StageProfiler::record(const CycleSample& sample) {
    ++cycle_index_;
    ++cycles_since_summary_;

    push(capture_, sample.capture);
    push(detect_, sample.detect);
    push(embed_, sample.embed);
    push(match_, sample.match);
    push(publish_, sample.publish);

    std::chrono::microseconds total = sample.capture;
    if (sample.detect)  total += *sample.detect;
    if (sample.embed)   total += *sample.embed;
    if (sample.match)   total += *sample.match;
    if (sample.publish) total += *sample.publish;
    push(total_, total);

    if (csv_.is_open()) {
        append_csv_row(sample);
    }

    if (summary_interval_cycles_ > 0 &&
        cycles_since_summary_ >= static_cast<std::uint64_t>(summary_interval_cycles_)) {
        emit_summary();
    }
}

void StageProfiler::push(StageWindow& w,
                         std::optional<std::chrono::microseconds> v) {
    if (v.has_value()) {
        w.samples_us.push_back(v->count());
    }
}

void StageProfiler::append_csv_row(const CycleSample& sample) {
    using namespace std::chrono;
    const auto epoch_ms =
        duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();

    std::chrono::microseconds total = sample.capture;
    if (sample.detect)  total += *sample.detect;
    if (sample.embed)   total += *sample.embed;
    if (sample.match)   total += *sample.match;
    if (sample.publish) total += *sample.publish;

    csv_ << cycle_index_ << ',' << epoch_ms << ',' << sample.capture.count();
    write_us(csv_, sample.detect);
    write_us(csv_, sample.embed);
    write_us(csv_, sample.match);
    write_us(csv_, sample.publish);
    csv_ << ',' << total.count() << '\n';
    csv_.flush();
}

void StageProfiler::emit_summary() {
    std::ostringstream line;
    line << "[metrics @ cycle " << cycle_index_ << "]";
    format_stage(line, capture_.name, summarize(capture_.samples_us));
    format_stage(line, detect_.name,  summarize(detect_.samples_us));
    format_stage(line, embed_.name,   summarize(embed_.samples_us));
    format_stage(line, match_.name,   summarize(match_.samples_us));
    format_stage(line, publish_.name, summarize(publish_.samples_us));
    format_stage(line, total_.name,   summarize(total_.samples_us));
    std::cerr << line.str() << '\n';

    capture_.samples_us.clear();
    detect_.samples_us.clear();
    embed_.samples_us.clear();
    match_.samples_us.clear();
    publish_.samples_us.clear();
    total_.samples_us.clear();
    cycles_since_summary_ = 0;
}

}  // namespace facegate::pipeline

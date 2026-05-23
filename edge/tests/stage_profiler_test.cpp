// StageProfiler tests.
//
// Two things matter: the per-cycle CSV row format (consumed by the
// benchmark analysis notebooks) and that record() correctly handles
// stages that didn't run on a given cycle.

#include <gtest/gtest.h>

#include <chrono>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "pipeline/stage_profiler.hpp"

namespace prof = facegate::pipeline;
using us = std::chrono::microseconds;

namespace {

class StageProfilerTest : public ::testing::Test {
protected:
    void SetUp() override {
        const auto tmp = std::filesystem::temp_directory_path();
        path_ = tmp / ("facegate_profiler_test_" +
                       std::to_string(reinterpret_cast<std::uintptr_t>(this)) +
                       ".csv");
        std::error_code ec;
        std::filesystem::remove(path_, ec);
    }
    void TearDown() override {
        std::error_code ec;
        std::filesystem::remove(path_, ec);
    }

    std::vector<std::string> read_lines() {
        std::ifstream f(path_);
        std::vector<std::string> out;
        std::string line;
        while (std::getline(f, line)) out.push_back(line);
        return out;
    }

    std::filesystem::path path_;
};

}  // namespace

TEST_F(StageProfilerTest, FullCycleWritesAllStages) {
    {
        prof::StageProfiler p(path_.string(), 0);
        prof::CycleSample s;
        s.capture = us{1000};
        s.detect  = us{2000};
        s.embed   = us{3000};
        s.match   = us{40};
        s.publish = us{500};
        p.record(s);
    }

    const auto lines = read_lines();
    ASSERT_EQ(lines.size(), 2u);
    EXPECT_EQ(lines[0],
        "cycle,timestamp_ms,capture_us,detect_us,embed_us,match_us,publish_us,total_us");

    // Row format: cycle,timestamp_ms,capture,detect,embed,match,publish,total
    // total = 1000+2000+3000+40+500 = 6540
    std::istringstream row(lines[1]);
    std::string tok;
    std::vector<std::string> cells;
    while (std::getline(row, tok, ',')) cells.push_back(tok);
    ASSERT_EQ(cells.size(), 8u);
    EXPECT_EQ(cells[0], "1");                      // cycle
    EXPECT_FALSE(cells[1].empty());                // timestamp_ms (epoch)
    EXPECT_EQ(cells[2], "1000");
    EXPECT_EQ(cells[3], "2000");
    EXPECT_EQ(cells[4], "3000");
    EXPECT_EQ(cells[5], "40");
    EXPECT_EQ(cells[6], "500");
    EXPECT_EQ(cells[7], "6540");
}

TEST_F(StageProfilerTest, SkippedStagesRenderAsEmptyCells) {
    {
        prof::StageProfiler p(path_.string(), 0);
        prof::CycleSample s;
        s.capture = us{800};
        s.detect  = us{1500};
        // No face detected: embed/match/publish all left unset.
        p.record(s);
    }

    const auto lines = read_lines();
    ASSERT_EQ(lines.size(), 2u);

    std::istringstream row(lines[1]);
    std::string tok;
    std::vector<std::string> cells;
    while (std::getline(row, tok, ',')) cells.push_back(tok);
    // Note: std::getline drops trailing empty fields, so we expect 5 cells
    // when publish_us is empty AND followed only by total_us. But total is
    // always populated, so the trailing token IS the total; the empty embed/
    // match/publish in the middle must survive as empty strings.
    ASSERT_EQ(cells.size(), 8u);
    EXPECT_EQ(cells[2], "800");      // capture
    EXPECT_EQ(cells[3], "1500");     // detect
    EXPECT_EQ(cells[4], "");         // embed skipped
    EXPECT_EQ(cells[5], "");         // match skipped
    EXPECT_EQ(cells[6], "");         // publish skipped
    EXPECT_EQ(cells[7], "2300");     // total = capture + detect only
}

TEST_F(StageProfilerTest, EmptyCsvPathDisablesFileLogging) {
    prof::StageProfiler p("", 0);
    prof::CycleSample s;
    s.capture = us{1000};
    p.record(s);

    // Nothing should have been created anywhere — and crucially no crash.
    EXPECT_FALSE(std::filesystem::exists(path_));
}

TEST_F(StageProfilerTest, CsvAppendsAcrossInstances) {
    {
        prof::StageProfiler p(path_.string(), 0);
        prof::CycleSample s; s.capture = us{100};
        p.record(s);
    }
    {
        prof::StageProfiler p(path_.string(), 0);
        prof::CycleSample s; s.capture = us{200};
        p.record(s);
    }

    const auto lines = read_lines();
    // 1 header + 2 data rows. Header must NOT be re-emitted on append.
    ASSERT_EQ(lines.size(), 3u);
    EXPECT_NE(lines[0].find("cycle,timestamp_ms"), std::string::npos);
    EXPECT_NE(lines[1].find(",100,"), std::string::npos);
    EXPECT_NE(lines[2].find(",200,"), std::string::npos);
}

TEST_F(StageProfilerTest, SummaryDoesNotCrashOnEmptyStages) {
    // summary_interval=1 forces emit_summary() after every record(). The
    // cycle below records only capture; the percentile path on the other
    // (empty) stages must not divide-by-zero or pop-back on an empty
    // vector. This test just asserts we get out alive.
    prof::StageProfiler p("", 1);
    prof::CycleSample s; s.capture = us{42};
    p.record(s);
    SUCCEED();
}

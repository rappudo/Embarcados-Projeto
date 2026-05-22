// TOML config loader tests.
//
// load_config() does two things: parse TOML and validate. We exercise
// both by writing tiny TOML strings to a temp file and asserting both
// success and the specific failure messages we care about.

#include <gtest/gtest.h>

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <string>

#include "config/config.hpp"

namespace cfg = facegate::config;

namespace {

class ConfigTest : public ::testing::Test {
protected:
    void SetUp() override {
        const auto tmp = std::filesystem::temp_directory_path();
        path_ = tmp / ("facegate_config_test_" +
                       std::to_string(reinterpret_cast<std::uintptr_t>(this)) +
                       ".toml");
    }
    void TearDown() override {
        std::error_code ec;
        std::filesystem::remove(path_, ec);
    }

    void write(const std::string& contents) {
        std::ofstream f(path_);
        f << contents;
    }

    std::filesystem::path path_;
};

// A minimal-but-valid config covering every required section. Tests
// build on top of this and mutate one slice to exercise a single rule.
const char* kValidToml = R"(
device_id = "rpi-test-01"

[vision]
threshold = 0.45
blazeface_model = "models/blaze.onnx"
mobilefacenet_model = "models/arc.onnx"
onnx_threads = 2

[camera]
device = "/dev/video0"
width = 640
height = 480
fps = 30

[gpio]
enabled = true
servo_pin = 17
buzzer_pin = 27
rgb_red_pin = 22
rgb_green_pin = 23
rgb_blue_pin = 24
rgb_active_high = true
servo_open_ms = 5000
buzzer_beep_ms = 400

[recognition]
idle_reset_seconds = 3
unknown_throttle_seconds = 10
denied_cooldown_ms = 1000

[storage]
sqlite_path = "/tmp/cache.db"

[mqtt]
broker_host = "192.168.1.100"
broker_port = 1883
client_id = "rpi-test-01"
keepalive_seconds = 60
heartbeat_interval_seconds = 30

[logging]
level = "info"
)";

}  // namespace

TEST_F(ConfigTest, ValidConfigLoadsWithExpectedFields) {
    write(kValidToml);
    auto c = cfg::load_config(path_);

    EXPECT_EQ(c.device_id, "rpi-test-01");
    EXPECT_FLOAT_EQ(c.vision.threshold, 0.45f);
    EXPECT_EQ(c.vision.onnx_threads, 2);
    EXPECT_EQ(c.camera.width, 640);
    EXPECT_EQ(c.gpio.servo_pin, 17);
    EXPECT_EQ(c.recognition.idle_reset_seconds, 3);
    EXPECT_EQ(c.storage.sqlite_path, "/tmp/cache.db");
    EXPECT_EQ(c.mqtt.broker_port, 1883);
    EXPECT_EQ(c.logging.level, "info");
}

TEST_F(ConfigTest, MissingDeviceIdRejected) {
    std::string toml = kValidToml;
    // Strip the device_id line.
    auto pos = toml.find("device_id = \"rpi-test-01\"");
    toml.replace(pos, std::string("device_id = \"rpi-test-01\"").size(), "");
    write(toml);

    EXPECT_THROW(cfg::load_config(path_), std::runtime_error);
}

TEST_F(ConfigTest, MissingVisionSectionRejected) {
    // Replace [vision] heading so the parser sees no `vision` table.
    // The validator runs after parse_*, but parse_vision itself throws
    // on a missing section — covered here.
    std::string toml = kValidToml;
    auto pos = toml.find("[vision]");
    toml.replace(pos, 8, "[__notvision__]");
    write(toml);

    EXPECT_THROW(cfg::load_config(path_), std::runtime_error);
}

TEST_F(ConfigTest, ThresholdOutOfRangeRejected) {
    std::string toml = kValidToml;
    auto pos = toml.find("threshold = 0.45");
    toml.replace(pos, std::string("threshold = 0.45").size(), "threshold = 5.0");
    write(toml);

    EXPECT_THROW(cfg::load_config(path_), std::runtime_error);
}

TEST_F(ConfigTest, ZeroOrNegativeOnnxThreadsRejected) {
    std::string toml = kValidToml;
    auto pos = toml.find("onnx_threads = 2");
    toml.replace(pos, std::string("onnx_threads = 2").size(), "onnx_threads = 0");
    write(toml);

    EXPECT_THROW(cfg::load_config(path_), std::runtime_error);
}

TEST_F(ConfigTest, GpioDisabledSkipsPinValidation) {
    // If gpio.enabled = false, the pin defaults (-1) must NOT trigger
    // the "pin required" failure — the validate() block is gated on
    // `gpio.enabled`. This was the design that lets us run the binary
    // on a dev laptop without GPIO at all.
    std::string toml = kValidToml;

    // Disable gpio + remove the now-irrelevant pin lines.
    auto pos = toml.find("enabled = true");
    toml.replace(pos, std::string("enabled = true").size(), "enabled = false");
    // Drop the pin assignments (still must parse — they're all ints).
    // We keep them with default -1 by overwriting to -1.
    auto fix = [&](const std::string& key) {
        auto p = toml.find(key);
        ASSERT_NE(p, std::string::npos);
        auto eol = toml.find('\n', p);
        toml.replace(p, eol - p, key.substr(0, key.find(' ')) + " = -1");
    };
    fix("servo_pin = 17");
    fix("buzzer_pin = 27");
    fix("rgb_red_pin = 22");
    fix("rgb_green_pin = 23");
    fix("rgb_blue_pin = 24");
    write(toml);

    EXPECT_NO_THROW(cfg::load_config(path_));
}

TEST_F(ConfigTest, DuplicateGpioPinsRejected) {
    // Two channels on the same physical line would short-circuit the
    // hardware abstraction layer (libgpiod refuses second request).
    // Catching it at config-load time gives a clean error message.
    std::string toml = kValidToml;
    auto pos = toml.find("buzzer_pin = 27");
    toml.replace(pos, std::string("buzzer_pin = 27").size(), "buzzer_pin = 17"); // == servo_pin
    write(toml);

    EXPECT_THROW(cfg::load_config(path_), std::runtime_error);
}

TEST_F(ConfigTest, MqttPortOutOfRangeRejected) {
    std::string toml = kValidToml;
    auto pos = toml.find("broker_port = 1883");
    toml.replace(pos, std::string("broker_port = 1883").size(), "broker_port = 99999");
    write(toml);

    EXPECT_THROW(cfg::load_config(path_), std::runtime_error);
}

TEST_F(ConfigTest, InvalidLogLevelRejected) {
    std::string toml = kValidToml;
    auto pos = toml.find("level = \"info\"");
    toml.replace(pos, std::string("level = \"info\"").size(), "level = \"shouting\"");
    write(toml);

    EXPECT_THROW(cfg::load_config(path_), std::runtime_error);
}

TEST_F(ConfigTest, RecognitionSectionIsOptionalWithDefaults) {
    // The validate() rules require positive values, so the implicit
    // defaults (idle_reset_seconds=3 etc.) MUST be positive — pinning
    // that here. Removing the section entirely should still produce a
    // usable Config.
    std::string toml = kValidToml;
    auto start = toml.find("[recognition]");
    auto next = toml.find("[storage]", start);
    toml.erase(start, next - start);
    write(toml);

    auto c = cfg::load_config(path_);
    EXPECT_GT(c.recognition.idle_reset_seconds, 0);
    EXPECT_GT(c.recognition.unknown_throttle_seconds, 0);
    EXPECT_GT(c.recognition.denied_cooldown_ms, 0);
}

TEST_F(ConfigTest, MalformedTomlSurfacesAsRuntimeError) {
    // toml++ throws parse_error which we wrap. Either way the caller
    // sees a runtime_error and gets a useful message.
    write("this is not = [valid toml");
    EXPECT_THROW(cfg::load_config(path_), std::runtime_error);
}

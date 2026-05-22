// MQTT serialization tests.
//
// `serialize(...)` produces (topic, payload) where payload is JSON.
// The wire format MUST stay in sync with the backend's `AccessEvent`
// deserializer in `backend/src/mqtt/mod.rs` — these tests pin that
// contract from the edge side. Each test parses the produced JSON
// with nlohmann_json and asserts field-by-field.

#include <gtest/gtest.h>

#include <chrono>
#include <nlohmann/json.hpp>

#include "domain/domain.hpp"
#include "mqtt/serialization.hpp"
#include "mqtt/topics.hpp"

namespace dom = facegate::domain;
namespace mq = facegate::mqtt;

namespace {

// 2024-01-01 00:00:00 UTC = 1704067200000 ms.
dom::Timestamp known_ts() {
    return dom::Timestamp{std::chrono::milliseconds{1704067200000}};
}

}  // namespace

TEST(Serialization, GrantedAccessEventHasFullPayload) {
    dom::AccessEvent event{
        /*timestamp=*/known_ts(),
        dom::AccessStatus::Granted,
        /*employee=*/dom::EmployeeId{42},
        /*distance=*/0.31f,
    };

    auto msg = mq::serialize(event);

    EXPECT_STREQ(msg.topic, mq::topics::kAccessEvent);

    const auto j = nlohmann::json::parse(msg.payload);
    EXPECT_EQ(j.at("timestamp_ms").get<std::int64_t>(), 1704067200000);
    EXPECT_EQ(j.at("status").get<std::string>(), "granted");
    EXPECT_EQ(j.at("employee_id").get<dom::EmployeeId>(), 42);
    EXPECT_NEAR(j.at("distance").get<float>(), 0.31f, 1e-5f);
}

TEST(Serialization, UnknownAccessEventEmitsExplicitNulls) {
    // The backend distinguishes "field missing" from "field is null" in
    // its schema check (`employee_id` MUST be present, but can be null).
    // We pin the JSON shape so a future refactor doesn't accidentally
    // drop the keys.
    dom::AccessEvent event{
        known_ts(),
        dom::AccessStatus::Unknown,
        std::nullopt,
        std::nullopt,
    };

    auto msg = mq::serialize(event);
    const auto j = nlohmann::json::parse(msg.payload);

    EXPECT_EQ(j.at("status").get<std::string>(), "unknown");
    ASSERT_TRUE(j.contains("employee_id"));
    EXPECT_TRUE(j.at("employee_id").is_null());
    ASSERT_TRUE(j.contains("distance"));
    EXPECT_TRUE(j.at("distance").is_null());
}

TEST(Serialization, DeniedAccessEventStatusString) {
    dom::AccessEvent event{
        known_ts(),
        dom::AccessStatus::Denied,
        dom::EmployeeId{7},
        0.6f,
    };
    auto msg = mq::serialize(event);
    const auto j = nlohmann::json::parse(msg.payload);
    EXPECT_EQ(j.at("status").get<std::string>(), "denied");
}

TEST(Serialization, HeartbeatHasTimestampAndDeviceId) {
    dom::Heartbeat hb{known_ts()};
    auto msg = mq::serialize(hb, "rpi-entrance-01");

    EXPECT_STREQ(msg.topic, mq::topics::kHeartbeat);

    const auto j = nlohmann::json::parse(msg.payload);
    EXPECT_EQ(j.at("timestamp_ms").get<std::int64_t>(), 1704067200000);
    EXPECT_EQ(j.at("device_id").get<std::string>(), "rpi-entrance-01");
}

TEST(Serialization, DeviceFaultKindMappingCoversAllEnumValues) {
    struct Case {
        dom::FaultKind kind;
        const char* expected;
    };
    const Case cases[] = {
        {dom::FaultKind::CameraFailure,    "camera_failure"},
        {dom::FaultKind::InferenceFailure, "inference_failure"},
        {dom::FaultKind::StorageFailure,   "storage_failure"},
        {dom::FaultKind::Other,            "other"},
    };

    for (const auto& c : cases) {
        SCOPED_TRACE(c.expected);
        dom::DeviceFault fault{known_ts(), c.kind, "diagnostic detail"};
        auto msg = mq::serialize(fault, "rpi-entrance-01");

        EXPECT_STREQ(msg.topic, mq::topics::kDeviceFault);

        const auto j = nlohmann::json::parse(msg.payload);
        EXPECT_EQ(j.at("kind").get<std::string>(), c.expected);
        EXPECT_EQ(j.at("device_id").get<std::string>(), "rpi-entrance-01");
        EXPECT_EQ(j.at("message").get<std::string>(), "diagnostic detail");
        EXPECT_EQ(j.at("timestamp_ms").get<std::int64_t>(), 1704067200000);
    }
}

TEST(Serialization, TimestampIsMillisecondsNotNanos) {
    // Defensive check: somebody refactoring to `nanoseconds` would
    // multiply our ms value by 1e6 and silently break the backend's
    // BIGINT timestamp_ms column. This pins the unit.
    dom::AccessEvent event{
        dom::Timestamp{std::chrono::seconds{1}}, // exactly 1 second past epoch
        dom::AccessStatus::Granted,
        dom::EmployeeId{1},
        0.0f,
    };
    auto msg = mq::serialize(event);
    const auto j = nlohmann::json::parse(msg.payload);
    EXPECT_EQ(j.at("timestamp_ms").get<std::int64_t>(), 1000);
}

#pragma once

namespace facegate::mqtt::topics {

inline constexpr const char* kAccessEvent = "facegate/events/access";
inline constexpr const char* kHeartbeat   = "facegate/health/heartbeat";
inline constexpr const char* kDeviceFault = "facegate/health/fault";

}  // namespace facegate::mqtt::topics

#pragma once

#include <cstdint>
#include <chrono>

namespace facegate::domain {

using EmployeeId = std::int64_t;

using Timestamp = std::chrono::system_clock::time_point;

}  // namespace facegate::domain

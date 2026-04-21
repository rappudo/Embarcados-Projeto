#pragma once

#include <optional>

#include "./types.hpp"

namespace facegate::domain {

struct Match {
    EmployeeId employee;
    float distance;
};

using MatchResult = std::optional<Match>;

}  // namespace facegate::domain

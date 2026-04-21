#pragma once

#include <string>

#include "./types.hpp"

namespace facegate::domain {

struct Employee {
    EmployeeId id;
    std::string name;
};

}  // namespace facegate::domain

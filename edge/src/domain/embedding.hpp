#pragma once

#include <array>
#include <cstddef>

#include "./types.hpp"

namespace facegate::domain {

inline constexpr std::size_t EMBEDDING_DIM = 512;

using EmbeddingVector = std::array<float, EMBEDDING_DIM>;

struct Embedding {
    EmployeeId owner;
    EmbeddingVector vector;
};

}  // namespace facegate::domain

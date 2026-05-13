#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

#include "./types.hpp"

namespace facegate::domain {

inline constexpr std::size_t EMBEDDING_DIM = 512;

using EmbeddingVector = std::array<float, EMBEDDING_DIM>;

/// `id` mirrors the `embeddings.id` column.
/// 0 means "not yet assigned" — used by the dev enroll CLI which lets
/// SQLite pick the ROWID. Sync messages always carry a non-zero id from
/// the backend.
struct Embedding {
    std::int64_t id = 0;
    EmployeeId owner;
    EmbeddingVector vector;
};

}  // namespace facegate::domain

#pragma once

#include <cstdint>
#include <mutex>
#include <optional>
#include <vector>

#include "../domain/domain.hpp"

namespace facegate::vision {

class Matcher {
public:
    Matcher(std::vector<facegate::domain::Embedding> cache, float threshold);

    Matcher(const Matcher&) = delete;
    Matcher& operator=(const Matcher&) = delete;
    Matcher(Matcher&&) = delete;
    Matcher& operator=(Matcher&&) = delete;

    facegate::domain::MatchResult find_match(
        const facegate::domain::EmbeddingVector& query
    ) const;

    std::size_t cache_size() const noexcept;

    std::optional<float> best_distance(
        const facegate::domain::EmbeddingVector& query
    ) const;

    // Mutation entry points used by the MQTT sync subscriber. Safe to
    // call concurrently with find_match / best_distance.
    void upsert(const facegate::domain::Embedding& embedding);
    void remove(std::int64_t embedding_id);

private:
    std::vector<facegate::domain::Embedding> cache_;
    float threshold_;
    mutable std::mutex mutex_;
};

}  // namespace facegate::vision

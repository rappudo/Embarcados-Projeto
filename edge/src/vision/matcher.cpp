#include "./matcher.hpp"

#include <cmath>
#include <limits>
#include <utility>

namespace facegate::vision {

namespace {

float cosine_distance(
    const facegate::domain::EmbeddingVector& a,
    const facegate::domain::EmbeddingVector& b
) {
    float dot = 0.0f;
    float norm_a = 0.0f;
    float norm_b = 0.0f;

    for (std::size_t i = 0; i < facegate::domain::EMBEDDING_DIM; ++i) {
        dot += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    const float denom = std::sqrt(norm_a) * std::sqrt(norm_b);
    if (denom < 1e-9f) {
        return std::numeric_limits<float>::infinity();
    }

    const float cosine_similarity = dot / denom;
    return 1.0f - cosine_similarity;
}

}  // namespace

Matcher::Matcher(std::vector<facegate::domain::Embedding> cache, float threshold)
    : cache_(std::move(cache)), threshold_(threshold) {}

facegate::domain::MatchResult Matcher::find_match(
    const facegate::domain::EmbeddingVector& query
) const {
    float best_distance = std::numeric_limits<float>::infinity();
    facegate::domain::EmployeeId best_owner = 0;
    bool found_any = false;

    for (const auto& entry : cache_) {
        const float dist = cosine_distance(query, entry.vector);
        if (dist < best_distance) {
            best_distance = dist;
            best_owner = entry.owner;
            found_any = true;
        }
    }

    if (!found_any || best_distance >= threshold_) {
        return std::nullopt;
    }

    return facegate::domain::Match{best_owner, best_distance};
}

std::size_t Matcher::cache_size() const noexcept {
    return cache_.size();
}

std::optional<float> Matcher::best_distance(
    const facegate::domain::EmbeddingVector& query
) const {
    if (cache_.empty()) {
        return std::nullopt;
    }

    float best = std::numeric_limits<float>::infinity();
    for (const auto& entry : cache_) {
        const float dist = cosine_distance(query, entry.vector);
        if (dist < best) {
            best = dist;
        }
    }
    return best;
}

}  // namespace facegate::vision

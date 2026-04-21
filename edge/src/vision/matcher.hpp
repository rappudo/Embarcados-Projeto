#pragma once

#include <mutex>
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

     std::optional<float> best_distance(const facegate::domain::EmbeddingVector& query) const;

private:
    std::vector<facegate::domain::Embedding> cache_;
    float threshold_;
};

}  // namespace facegate::vision

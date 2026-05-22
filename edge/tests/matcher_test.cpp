// Matcher unit tests.
//
// Matcher is pure math + cache state; no I/O, no ONNX. We can exercise
// it with hand-built embedding vectors. The cosine distance is the
// project's go/no-go decision logic — every "granted" event hinges on
// these few lines, so this is high-value coverage.

#include <gtest/gtest.h>

#include <cmath>
#include <limits>

#include "domain/domain.hpp"
#include "vision/matcher.hpp"

namespace dom = facegate::domain;
namespace vis = facegate::vision;

namespace {

// Fill every slot with the same value. Convenient for round-trip and
// parallel-vector tests because two `uniform(c)` vectors are perfectly
// aligned (cosine similarity == 1, distance == 0).
dom::EmbeddingVector uniform(float value) {
    dom::EmbeddingVector v{};
    v.fill(value);
    return v;
}

// Two basis vectors that are orthogonal (distance == 1.0 from each other).
dom::EmbeddingVector basis_a() {
    dom::EmbeddingVector v{};
    v[0] = 1.0f;
    return v;
}
dom::EmbeddingVector basis_b() {
    dom::EmbeddingVector v{};
    v[1] = 1.0f;
    return v;
}

dom::Embedding make_embedding(std::int64_t id, dom::EmployeeId owner, float fill_value) {
    return dom::Embedding{id, owner, uniform(fill_value)};
}

}  // namespace

TEST(Matcher, EmptyCacheReturnsNoMatch) {
    vis::Matcher m({}, /*threshold=*/0.5f);
    EXPECT_EQ(m.cache_size(), 0u);

    const auto result = m.find_match(uniform(1.0f));
    EXPECT_FALSE(result.has_value());

    // best_distance is nullopt rather than infinity so callers can
    // distinguish "cache empty" from "cache has entries but bad match".
    EXPECT_FALSE(m.best_distance(uniform(1.0f)).has_value());
}

TEST(Matcher, IdenticalVectorMatchesAtDistanceZero) {
    auto cached = make_embedding(1, 42, 0.5f);
    vis::Matcher m({cached}, 0.5f);

    const auto result = m.find_match(cached.vector);
    ASSERT_TRUE(result.has_value());
    EXPECT_EQ(result->employee, 42);
    EXPECT_NEAR(result->distance, 0.0f, 1e-5f);
}

TEST(Matcher, OrthogonalVectorRejectedByThreshold) {
    // basis_a vs basis_b: cosine = 0 → distance = 1. With threshold 0.5
    // this must NOT match.
    auto cached = dom::Embedding{1, 42, basis_a()};
    vis::Matcher m({cached}, 0.5f);

    EXPECT_FALSE(m.find_match(basis_b()).has_value());

    // ...but best_distance still reports the actual measured distance
    // (used by the panel's "calibrate threshold" workflow).
    auto best = m.best_distance(basis_b());
    ASSERT_TRUE(best.has_value());
    EXPECT_NEAR(*best, 1.0f, 1e-5f);
}

TEST(Matcher, ThresholdIsExclusiveAtBoundary) {
    // Distance exactly == threshold must NOT match — see `dist >= threshold_`.
    // We construct a pair that gives distance 0.5 deterministically:
    // cos(60°) = 0.5 → distance = 0.5.
    dom::EmbeddingVector a{}; a[0] = 1.0f;
    dom::EmbeddingVector b{}; b[0] = 0.5f; b[1] = std::sqrt(3.0f) / 2.0f;

    vis::Matcher m({dom::Embedding{1, 42, a}}, /*threshold=*/0.5f);

    EXPECT_FALSE(m.find_match(b).has_value());

    // Same setup but with a slightly looser threshold accepts it.
    vis::Matcher m2({dom::Embedding{1, 42, a}}, /*threshold=*/0.51f);
    auto matched = m2.find_match(b);
    ASSERT_TRUE(matched.has_value());
    EXPECT_EQ(matched->employee, 42);
}

TEST(Matcher, BestDistanceWinsOnTies) {
    // Three cached vectors at distances 0.6, 0.2, 0.4 to the query.
    // The 0.2 winner (employee 99) must be returned regardless of cache
    // order. We seed in not-sorted-by-distance order to prove the loop
    // actually tracks the running minimum.
    vis::Matcher m(
        {
            dom::Embedding{1, 11, uniform(0.40f)}, // diff sign from query
            dom::Embedding{2, 99, basis_a()},      // closest
            dom::Embedding{3, 22, basis_b()},      // orthogonal
        },
        /*threshold=*/0.9f
    );

    auto result = m.find_match(basis_a()); // query == cache[1]
    ASSERT_TRUE(result.has_value());
    EXPECT_EQ(result->employee, 99);
    EXPECT_NEAR(result->distance, 0.0f, 1e-5f);
}

TEST(Matcher, ZeroVectorYieldsInfinityNotNaN) {
    // Division-by-zero guard: if either vector has zero norm the cosine
    // is undefined. The implementation returns +inf, which fails any
    // threshold test cleanly. NaN would propagate and break comparisons.
    vis::Matcher m({dom::Embedding{1, 1, uniform(0.0f)}}, 0.5f);

    EXPECT_FALSE(m.find_match(uniform(1.0f)).has_value());

    auto best = m.best_distance(uniform(1.0f));
    ASSERT_TRUE(best.has_value());
    EXPECT_TRUE(std::isinf(*best));
}

TEST(Matcher, UpsertInsertsWhenIdMissing) {
    vis::Matcher m({}, 0.5f);
    EXPECT_EQ(m.cache_size(), 0u);

    m.upsert(make_embedding(7, 42, 0.5f));
    EXPECT_EQ(m.cache_size(), 1u);

    auto result = m.find_match(uniform(0.5f));
    ASSERT_TRUE(result.has_value());
    EXPECT_EQ(result->employee, 42);
}

TEST(Matcher, UpsertReplacesWhenIdExists) {
    vis::Matcher m({make_embedding(7, 42, 0.5f)}, 0.5f);

    // Re-upsert id=7 with a different owner — cache size stays at 1,
    // owner reflects the latest write. This is what the backend's
    // retained sync messages depend on.
    m.upsert(make_embedding(7, /*new owner=*/100, 0.5f));
    EXPECT_EQ(m.cache_size(), 1u);

    auto result = m.find_match(uniform(0.5f));
    ASSERT_TRUE(result.has_value());
    EXPECT_EQ(result->employee, 100);
}

TEST(Matcher, RemoveDropsEntryAndLeavesOthers) {
    vis::Matcher m(
        {
            make_embedding(1, 11, 0.50f),
            make_embedding(2, 22, 0.25f),
            make_embedding(3, 33, 0.75f),
        },
        0.9f
    );
    EXPECT_EQ(m.cache_size(), 3u);

    m.remove(2);
    EXPECT_EQ(m.cache_size(), 2u);

    // The removed embedding's owner must no longer appear.
    auto result = m.find_match(uniform(0.25f));
    ASSERT_TRUE(result.has_value());
    EXPECT_NE(result->employee, 22);
}

TEST(Matcher, RemoveOfMissingIdIsNoOp) {
    vis::Matcher m({make_embedding(1, 11, 0.5f)}, 0.5f);

    // Removing an id that isn't in the cache must not throw and must
    // not affect the surviving entries.
    EXPECT_NO_THROW(m.remove(9999));
    EXPECT_EQ(m.cache_size(), 1u);
}

// SQLite cache tests.
//
// Each test gets a unique on-disk database (tmpfs path) so they're
// fully isolated. The schema file path is injected by CMake via
// EDGE_MIGRATIONS_DIR so the test doesn't need to know its build
// location.

#include <gtest/gtest.h>

#include <chrono>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <string>

#include "domain/domain.hpp"
#include "storage/storage.hpp"

namespace dom = facegate::domain;
namespace st = facegate::storage;

#ifndef EDGE_MIGRATIONS_DIR
#error "EDGE_MIGRATIONS_DIR must be passed in via -D from CMake"
#endif

namespace {

// Per-test fixture that allocates a unique temp file path and cleans up
// in the destructor. Using a real file (instead of `:memory:`) keeps the
// production code path under test — Storage opens with OPEN_CREATE.
class StorageTest : public ::testing::Test {
protected:
    void SetUp() override {
        const auto tmp = std::filesystem::temp_directory_path();
        db_path_ = tmp / ("facegate_storage_test_" +
                          std::to_string(::testing::UnitTest::GetInstance()->random_seed()) +
                          "_" +
                          std::to_string(reinterpret_cast<std::uintptr_t>(this)) +
                          ".db");
        std::filesystem::remove(db_path_); // start clean
        migrations_ = std::string(EDGE_MIGRATIONS_DIR) + "/schema.sql";
    }

    void TearDown() override {
        std::error_code ec;
        std::filesystem::remove(db_path_, ec);
    }

    std::filesystem::path db_path_;
    std::string migrations_;
};

dom::EmbeddingVector ramp_vector(float start, float step) {
    dom::EmbeddingVector v{};
    for (std::size_t i = 0; i < dom::EMBEDDING_DIM; ++i) {
        v[i] = start + step * static_cast<float>(i);
    }
    return v;
}

}  // namespace

TEST_F(StorageTest, OpenAndInitAreIdempotent) {
    // Opening twice on the same path must succeed: schema uses
    // IF NOT EXISTS, so a re-init on an existing DB is a no-op.
    { st::Storage s(db_path_.string(), migrations_); }
    EXPECT_NO_THROW({ st::Storage s(db_path_.string(), migrations_); });
}

TEST_F(StorageTest, LoadAllEmbeddingsEmptyOnFreshDb) {
    st::Storage s(db_path_.string(), migrations_);
    EXPECT_TRUE(s.load_all_embeddings().empty());
}

TEST_F(StorageTest, InsertEmbeddingAssignsRowidAndRoundTripsBlob) {
    st::Storage s(db_path_.string(), migrations_);

    dom::Embedding input;
    input.owner = 42;
    input.vector = ramp_vector(/*start=*/0.001f, /*step=*/0.002f);
    s.insert_embedding(input);

    auto rows = s.load_all_embeddings();
    ASSERT_EQ(rows.size(), 1u);
    EXPECT_EQ(rows[0].owner, 42);
    EXPECT_NE(rows[0].id, 0); // SQLite assigned a ROWID

    // Bit-exact comparison: BLOB stores raw f32, so the round-trip
    // should preserve every value without rounding.
    for (std::size_t i = 0; i < dom::EMBEDDING_DIM; ++i) {
        EXPECT_FLOAT_EQ(rows[0].vector[i], input.vector[i]) << "index " << i;
    }
}

TEST_F(StorageTest, UpsertWithExplicitIdInsertsThenReplaces) {
    st::Storage s(db_path_.string(), migrations_);

    dom::Embedding v1{/*id=*/100, /*owner=*/7, ramp_vector(0.1f, 0.0f)};
    s.upsert_embedding(v1);

    auto rows = s.load_all_embeddings();
    ASSERT_EQ(rows.size(), 1u);
    EXPECT_EQ(rows[0].id, 100);
    EXPECT_EQ(rows[0].owner, 7);

    // Same id, different owner — must REPLACE.
    dom::Embedding v2{/*id=*/100, /*owner=*/8, ramp_vector(0.2f, 0.0f)};
    s.upsert_embedding(v2);

    rows = s.load_all_embeddings();
    ASSERT_EQ(rows.size(), 1u);
    EXPECT_EQ(rows[0].id, 100);
    EXPECT_EQ(rows[0].owner, 8);
    EXPECT_FLOAT_EQ(rows[0].vector[0], 0.2f);
}

TEST_F(StorageTest, UpsertWithZeroIdThrows) {
    // id=0 means "unassigned" — only the enroll CLI uses this path
    // (via insert_embedding). The sync path must never reach upsert
    // without a backend-assigned id, so we fail loudly.
    st::Storage s(db_path_.string(), migrations_);

    dom::Embedding bad{/*id=*/0, /*owner=*/1, ramp_vector(0.0f, 0.0f)};
    EXPECT_THROW(s.upsert_embedding(bad), std::runtime_error);
}

TEST_F(StorageTest, DeleteEmbeddingByIdLeavesOthersIntact) {
    st::Storage s(db_path_.string(), migrations_);

    s.upsert_embedding({1, 11, ramp_vector(0.1f, 0.0f)});
    s.upsert_embedding({2, 22, ramp_vector(0.2f, 0.0f)});
    s.upsert_embedding({3, 33, ramp_vector(0.3f, 0.0f)});
    ASSERT_EQ(s.load_all_embeddings().size(), 3u);

    s.delete_embedding(2);

    auto rows = s.load_all_embeddings();
    ASSERT_EQ(rows.size(), 2u);
    EXPECT_EQ(rows[0].id, 1);
    EXPECT_EQ(rows[1].id, 3);
}

TEST_F(StorageTest, DeleteEmbeddingNonexistentIdIsNoOp) {
    st::Storage s(db_path_.string(), migrations_);
    s.upsert_embedding({1, 11, ramp_vector(0.1f, 0.0f)});

    EXPECT_NO_THROW(s.delete_embedding(9999));
    EXPECT_EQ(s.load_all_embeddings().size(), 1u);
}

TEST_F(StorageTest, DeleteEmployeeEmbeddingsRemovesAllMatching) {
    st::Storage s(db_path_.string(), migrations_);

    // Two embeddings for employee 42, one for employee 7.
    s.upsert_embedding({1, 42, ramp_vector(0.1f, 0.0f)});
    s.upsert_embedding({2, 42, ramp_vector(0.2f, 0.0f)});
    s.upsert_embedding({3, 7,  ramp_vector(0.3f, 0.0f)});

    s.delete_employee_embeddings(42);

    auto rows = s.load_all_embeddings();
    ASSERT_EQ(rows.size(), 1u);
    EXPECT_EQ(rows[0].owner, 7);
}

TEST_F(StorageTest, EnqueueAndFetchPendingEventsPreservesOrderAndContents) {
    st::Storage s(db_path_.string(), migrations_);

    s.enqueue_pending_event("facegate/events/access", "{\"a\":1}");
    s.enqueue_pending_event("facegate/events/access", "{\"b\":2}");
    s.enqueue_pending_event("facegate/health/heartbeat", "{}");

    auto pending = s.fetch_pending_events(/*limit=*/10);
    ASSERT_EQ(pending.size(), 3u);

    // ORDER BY id ASC — insertion order.
    EXPECT_EQ(pending[0].topic, "facegate/events/access");
    EXPECT_EQ(pending[0].payload, "{\"a\":1}");
    EXPECT_EQ(pending[1].payload, "{\"b\":2}");
    EXPECT_EQ(pending[2].topic, "facegate/health/heartbeat");
    EXPECT_EQ(pending[2].payload, "{}");

    // Distinct auto-incrementing ids.
    EXPECT_LT(pending[0].id, pending[1].id);
    EXPECT_LT(pending[1].id, pending[2].id);
}

TEST_F(StorageTest, FetchPendingEventsRespectsLimit) {
    st::Storage s(db_path_.string(), migrations_);
    for (int i = 0; i < 75; ++i) {
        s.enqueue_pending_event("t", "{}");
    }

    // The pipeline's drainer fetches in batches of 50 — exercising the
    // boundary here protects against an off-by-one.
    auto first_batch = s.fetch_pending_events(50);
    EXPECT_EQ(first_batch.size(), 50u);

    auto second_batch = s.fetch_pending_events(50);
    // fetch is read-only: we get the same 50 again. The drainer is
    // expected to delete each one after a successful publish, which
    // is the next test.
    EXPECT_EQ(second_batch.size(), 50u);
}

TEST_F(StorageTest, DeletePendingEventRemovesById) {
    st::Storage s(db_path_.string(), migrations_);
    s.enqueue_pending_event("t1", "p1");
    s.enqueue_pending_event("t2", "p2");

    auto pending = s.fetch_pending_events(10);
    ASSERT_EQ(pending.size(), 2u);

    s.delete_pending_event(pending[0].id);

    auto after = s.fetch_pending_events(10);
    ASSERT_EQ(after.size(), 1u);
    EXPECT_EQ(after[0].topic, "t2");
}

TEST_F(StorageTest, EmbeddingsAndPendingEventsAreIndependentTables) {
    // Sanity check: enqueueing pending events must not affect the
    // embeddings cache and vice versa.
    st::Storage s(db_path_.string(), migrations_);

    s.upsert_embedding({1, 42, ramp_vector(0.1f, 0.0f)});
    s.enqueue_pending_event("t", "p");

    EXPECT_EQ(s.load_all_embeddings().size(), 1u);
    EXPECT_EQ(s.fetch_pending_events(10).size(), 1u);
}

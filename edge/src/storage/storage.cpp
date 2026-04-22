#include "./storage.hpp"

#include <SQLiteCpp/SQLiteCpp.h>

#include <chrono>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <cstring>

namespace facegate::storage {

namespace {

std::string read_file(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        throw std::runtime_error("Storage: failed to open file '" + path + "'");
    }
    std::stringstream buffer;
    buffer << file.rdbuf();
    return buffer.str();
}

}  // namespace

struct Storage::Impl {
    SQLite::Database db;

    Impl(const std::string& path)
        : db(path,
             SQLite::OPEN_READWRITE | SQLite::OPEN_CREATE) {}
};

Storage::Storage(const std::string& db_path, const std::string& migrations_path)
    : impl_(nullptr) {
    try {
        impl_ = new Impl(db_path);
    } catch (const SQLite::Exception& e) {
        throw std::runtime_error(
            std::string("Storage: failed to open database '") + db_path + "': " + e.what()
        );
    }

    try {
        const std::string schema_sql = read_file(migrations_path);
        impl_->db.exec(schema_sql);
    } catch (const std::exception& e) {
        delete impl_;
        throw std::runtime_error(
            std::string("Storage: failed to apply schema from '") + migrations_path + "': " + e.what()
        );
    }
}

Storage::~Storage() {
    delete impl_;
}

std::vector<facegate::domain::Embedding> Storage::load_all_embeddings() {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<facegate::domain::Embedding> result;

    try {
        SQLite::Statement query(impl_->db,
            "SELECT employee_id, vector FROM embeddings ORDER BY id ASC");

        while (query.executeStep()) {
            facegate::domain::Embedding emb{};
            emb.owner = query.getColumn(0).getInt64();

            const void* blob = query.getColumn(1).getBlob();
            const int blob_size = query.getColumn(1).getBytes();

            constexpr int expected_bytes =
                static_cast<int>(facegate::domain::EMBEDDING_DIM * sizeof(float));

            if (blob_size != expected_bytes) {
                throw std::runtime_error(
                    "Storage: embedding blob has wrong size (expected " +
                    std::to_string(expected_bytes) + ", got " +
                    std::to_string(blob_size) + ")"
                );
            }

            std::memcpy(emb.vector.data(), blob, expected_bytes);
            result.push_back(std::move(emb));
        }
    } catch (const SQLite::Exception& e) {
        throw std::runtime_error(
            std::string("Storage: load_all_embeddings failed: ") + e.what()
        );
    }

    return result;
}

void Storage::insert_embedding(const facegate::domain::Embedding& embedding) {
    std::lock_guard<std::mutex> lock(mutex_);

    const auto now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    constexpr int blob_bytes =
        static_cast<int>(facegate::domain::EMBEDDING_DIM * sizeof(float));

    try {
        SQLite::Statement stmt(impl_->db,
            "INSERT INTO embeddings (employee_id, vector, created_at) VALUES (?, ?, ?)");

        stmt.bind(1, static_cast<std::int64_t>(embedding.owner));
        stmt.bind(2, embedding.vector.data(), blob_bytes);
        stmt.bind(3, static_cast<std::int64_t>(now_ms));

        stmt.exec();
    } catch (const SQLite::Exception& e) {
        throw std::runtime_error(
            std::string("Storage: insert_embedding failed: ") + e.what()
        );
    }
}

void Storage::delete_employee_embeddings(facegate::domain::EmployeeId employee_id) {
    std::lock_guard<std::mutex> lock(mutex_);

    try {
        SQLite::Statement stmt(impl_->db,
            "DELETE FROM embeddings WHERE employee_id = ?");
        stmt.bind(1, static_cast<std::int64_t>(employee_id));
        stmt.exec();
    } catch (const SQLite::Exception& e) {
        throw std::runtime_error(
            std::string("Storage: delete_employee_embeddings failed: ") + e.what()
        );
    }
}

void Storage::enqueue_pending_event(const std::string& topic, const std::string& payload) {
    std::lock_guard<std::mutex> lock(mutex_);

    const auto now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    try {
        SQLite::Statement stmt(impl_->db,
            "INSERT INTO pending_events (topic, payload, created_at) VALUES (?, ?, ?)");
        stmt.bind(1, topic);
        stmt.bind(2, payload);
        stmt.bind(3, static_cast<std::int64_t>(now_ms));
        stmt.exec();
    } catch (const SQLite::Exception& e) {
        throw std::runtime_error(
            std::string("Storage: enqueue_pending_event failed: ") + e.what()
        );
    }
}

std::vector<PendingEvent> Storage::fetch_pending_events(int limit) {
    std::lock_guard<std::mutex> lock(mutex_);

    std::vector<PendingEvent> result;

    try {
        SQLite::Statement query(impl_->db,
            "SELECT id, topic, payload, created_at FROM pending_events "
            "ORDER BY id ASC LIMIT ?");
        query.bind(1, limit);

        while (query.executeStep()) {
            PendingEvent ev;
            ev.id = query.getColumn(0).getInt64();
            ev.topic = query.getColumn(1).getString();
            ev.payload = query.getColumn(2).getString();

            const std::int64_t ms = query.getColumn(3).getInt64();
            ev.created_at = facegate::domain::Timestamp{
                std::chrono::milliseconds{ms}
            };

            result.push_back(std::move(ev));
        }
    } catch (const SQLite::Exception& e) {
        throw std::runtime_error(
            std::string("Storage: fetch_pending_events failed: ") + e.what()
        );
    }

    return result;
}

void Storage::delete_pending_event(std::int64_t id) {
    std::lock_guard<std::mutex> lock(mutex_);

    try {
        SQLite::Statement stmt(impl_->db,
            "DELETE FROM pending_events WHERE id = ?");
        stmt.bind(1, id);
        stmt.exec();
    } catch (const SQLite::Exception& e) {
        throw std::runtime_error(
            std::string("Storage: delete_pending_event failed: ") + e.what()
        );
    }
}

}  // namespace facegate::storage

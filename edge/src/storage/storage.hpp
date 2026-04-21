#pragma once

#include <cstdint>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

#include "domain/domain.hpp"

namespace facegate::storage {

struct PendingEvent {
    std::int64_t id;
    std::string topic;
    std::string payload;
    facegate::domain::Timestamp created_at;
};

class Storage {
public:
    Storage(const std::string& db_path, const std::string& migrations_path);
    ~Storage();

    Storage(const Storage&) = delete;
    Storage& operator=(const Storage&) = delete;
    Storage(Storage&&) = delete;
    Storage& operator=(Storage&&) = delete;

    // Embeddings — usado pelo app principal (read) e pelo enrollment CLI (write).
    std::vector<facegate::domain::Embedding> load_all_embeddings();
    void insert_embedding(const facegate::domain::Embedding& embedding);
    void delete_employee_embeddings(facegate::domain::EmployeeId employee_id);

    // Fila offline — usado pelo pipeline.
    void enqueue_pending_event(const std::string& topic, const std::string& payload);
    std::vector<PendingEvent> fetch_pending_events(int limit);
    void delete_pending_event(std::int64_t id);

private:
    struct Impl;
    Impl* impl_;
    std::mutex mutex_;
};

}  // namespace facegate::storage

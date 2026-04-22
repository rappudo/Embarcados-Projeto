#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace facegate::vision {

class OnnxSession {
public:
    OnnxSession(const std::string& model_path, int num_threads);
    ~OnnxSession();

    OnnxSession(const OnnxSession&) = delete;
    OnnxSession& operator=(const OnnxSession&) = delete;
    OnnxSession(OnnxSession&&) = delete;
    OnnxSession& operator=(OnnxSession&&) = delete;

    enum class TensorType {
        Float32,
        Int64,
    };

    struct InputTensor {
        std::string name;
        TensorType type;
        const void* data;
        std::vector<std::int64_t> shape;
    };

    struct TensorView {
        const float* data;
        std::vector<std::int64_t> shape;
        std::size_t element_count;
    };

    std::vector<TensorView> run(
        const std::vector<InputTensor>& inputs,
        const std::vector<std::string>& output_names
    );

    std::vector<std::string> input_names() const;
    std::vector<std::string> output_names() const;

private:
    struct Impl;
    Impl* impl_;
};

}  // namespace facegate::vision

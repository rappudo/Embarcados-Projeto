#include "vision/onnx_session.hpp"

#include <onnxruntime_cxx_api.h>

#include <stdexcept>

namespace facegate::vision {

struct OnnxSession::Impl {
    Ort::Env env;
    Ort::SessionOptions session_options;
    Ort::Session session;

    std::vector<std::string> input_names_cache;
    std::vector<std::string> output_names_cache;

    std::vector<Ort::Value> last_outputs;

    Impl(const std::string& model_path, int num_threads)
        : env(ORT_LOGGING_LEVEL_ERROR, "facegate"),
          session_options(),
          session(nullptr) {
        session_options.SetIntraOpNumThreads(num_threads);
        session_options.SetGraphOptimizationLevel(
            GraphOptimizationLevel::ORT_ENABLE_ALL
        );

        session = Ort::Session(env, model_path.c_str(), session_options);

        Ort::AllocatorWithDefaultOptions allocator;

        const std::size_t n_inputs = session.GetInputCount();
        input_names_cache.reserve(n_inputs);
        for (std::size_t i = 0; i < n_inputs; ++i) {
            auto name = session.GetInputNameAllocated(i, allocator);
            input_names_cache.emplace_back(name.get());
        }

        const std::size_t n_outputs = session.GetOutputCount();
        output_names_cache.reserve(n_outputs);
        for (std::size_t i = 0; i < n_outputs; ++i) {
            auto name = session.GetOutputNameAllocated(i, allocator);
            output_names_cache.emplace_back(name.get());
        }
    }
};

OnnxSession::OnnxSession(const std::string& model_path, int num_threads)
    : impl_(nullptr) {
    try {
        impl_ = new Impl(model_path, num_threads);
    } catch (const Ort::Exception& e) {
        throw std::runtime_error(
            std::string("OnnxSession: failed to load model '") + model_path +
            "': " + e.what()
        );
    }
}

OnnxSession::~OnnxSession() {
    delete impl_;
}

std::vector<std::string> OnnxSession::input_names() const {
    return impl_->input_names_cache;
}

std::vector<std::string> OnnxSession::output_names() const {
    return impl_->output_names_cache;
}

std::vector<OnnxSession::TensorView> OnnxSession::run(
    const std::vector<InputTensor>& inputs,
    const std::vector<std::string>& output_names
) {
    Ort::MemoryInfo memory_info = Ort::MemoryInfo::CreateCpu(
        OrtArenaAllocator, OrtMemTypeDefault
    );

    std::vector<Ort::Value> input_tensors;
    input_tensors.reserve(inputs.size());

    for (const auto& input : inputs) {
        std::size_t element_count = 1;
        for (auto dim : input.shape) {
            element_count *= static_cast<std::size_t>(dim);
        }

        if (input.type == TensorType::Float32) {
            input_tensors.push_back(Ort::Value::CreateTensor<float>(
                memory_info,
                const_cast<float*>(static_cast<const float*>(input.data)),
                element_count,
                input.shape.data(),
                input.shape.size()
            ));
        } else if (input.type == TensorType::Int64) {
            input_tensors.push_back(Ort::Value::CreateTensor<std::int64_t>(
                memory_info,
                const_cast<std::int64_t*>(static_cast<const std::int64_t*>(input.data)),
                element_count,
                input.shape.data(),
                input.shape.size()
            ));
        } else {
            throw std::runtime_error("OnnxSession::run: unsupported tensor type");
        }
    }

    std::vector<const char*> input_name_ptrs;
    input_name_ptrs.reserve(inputs.size());
    for (const auto& input : inputs) {
        input_name_ptrs.push_back(input.name.c_str());
    }

    std::vector<const char*> output_name_ptrs;
    output_name_ptrs.reserve(output_names.size());
    for (const auto& name : output_names) {
        output_name_ptrs.push_back(name.c_str());
    }

    try {
        impl_->last_outputs = impl_->session.Run(
            Ort::RunOptions{nullptr},
            input_name_ptrs.data(),
            input_tensors.data(),
            input_tensors.size(),
            output_name_ptrs.data(),
            output_name_ptrs.size()
        );
    } catch (const Ort::Exception& e) {
        throw std::runtime_error(
            std::string("OnnxSession::run: inference failed: ") + e.what()
        );
    }

    std::vector<TensorView> result;
    result.reserve(impl_->last_outputs.size());

    for (auto& output : impl_->last_outputs) {
        TensorView view;
        view.data = output.GetTensorMutableData<float>();

        Ort::TensorTypeAndShapeInfo shape_info = output.GetTensorTypeAndShapeInfo();
        std::vector<std::int64_t> shape = shape_info.GetShape();

        std::size_t element_count = 1;
        for (auto dim : shape) {
            if (dim < 0) {
                throw std::runtime_error(
                    "OnnxSession::run: output has dynamic dimension (unsupported)"
                );
            }
            element_count *= static_cast<std::size_t>(dim);
        }

        view.shape = std::move(shape);
        view.element_count = element_count;
        result.push_back(std::move(view));
    }

    return result;
}

}  // namespace facegate::vision

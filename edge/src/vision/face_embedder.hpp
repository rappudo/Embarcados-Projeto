#pragma once

#include <memory>
#include <optional>
#include <string>

#include <opencv2/core.hpp>

#include "../domain/domain.hpp"
#include "vision/types.hpp"

namespace facegate::vision {

class OnnxSession;

class FaceEmbedder {
public:
    FaceEmbedder(const std::string& model_path, int num_threads);
    ~FaceEmbedder();

    FaceEmbedder(const FaceEmbedder&) = delete;
    FaceEmbedder& operator=(const FaceEmbedder&) = delete;
    FaceEmbedder(FaceEmbedder&&) = delete;
    FaceEmbedder& operator=(FaceEmbedder&&) = delete;

    std::optional<facegate::domain::EmbeddingVector> extract(
        const cv::Mat& frame_bgr,
        const Detection& detection
    );

private:
    std::unique_ptr<OnnxSession> session_;
    std::string input_name_;
    std::string output_name_;
};

}  // namespace facegate::vision

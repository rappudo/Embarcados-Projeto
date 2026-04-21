#include "vision/face_embedder.hpp"

#include <opencv2/imgproc.hpp>

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <vector>
#include <iostream>

#include "vision/onnx_session.hpp"

namespace facegate::vision {

namespace {

constexpr int kArcFaceInputSize = 112;
constexpr float kNormMean = 127.5f;
constexpr float kNormScale = 128.0f;

}  // namespace

FaceEmbedder::FaceEmbedder(const std::string& model_path, int num_threads)
    : session_(std::make_unique<OnnxSession>(model_path, num_threads)) {
    const auto in_names = session_->input_names();
    const auto out_names = session_->output_names();

    if (in_names.empty() || out_names.empty()) {
        throw std::runtime_error(
            "FaceEmbedder: model has no inputs or no outputs"
        );
    }

    input_name_ = in_names[0];
    output_name_ = out_names[0];
}

FaceEmbedder::~FaceEmbedder() = default;

std::optional<facegate::domain::EmbeddingVector> FaceEmbedder::extract(
    const cv::Mat& frame_bgr,
    const Detection& detection
) {
    const int frame_w = frame_bgr.cols;
    const int frame_h = frame_bgr.rows;

    const int x = std::clamp(static_cast<int>(detection.bbox.x), 0, frame_w - 1);
    const int y = std::clamp(static_cast<int>(detection.bbox.y), 0, frame_h - 1);
    const int w = std::clamp(
        static_cast<int>(detection.bbox.width), 1, frame_w - x
    );
    const int h = std::clamp(
        static_cast<int>(detection.bbox.height), 1, frame_h - y
    );

    if (w < 10 || h < 10) {
            std::cerr << "FaceEmbedder: bbox too small: w=" << w << " h=" << h << "\n";
            return std::nullopt;
        }

    const cv::Rect roi(x, y, w, h);
    cv::Mat face_bgr = frame_bgr(roi);

    cv::Mat face_resized;
    cv::resize(face_bgr, face_resized,
               cv::Size(kArcFaceInputSize, kArcFaceInputSize));

    cv::Mat face_rgb;
    cv::cvtColor(face_resized, face_rgb, cv::COLOR_BGR2RGB);

    std::vector<float> input_tensor(
        3 * kArcFaceInputSize * kArcFaceInputSize
    );

    for (int row = 0; row < kArcFaceInputSize; ++row) {
            for (int col = 0; col < kArcFaceInputSize; ++col) {
                const cv::Vec3b& px = face_rgb.at<cv::Vec3b>(row, col);
                const int idx = (row * kArcFaceInputSize + col) * 3;
                input_tensor[idx + 0] = (static_cast<float>(px[0]) - kNormMean) / kNormScale;
                input_tensor[idx + 1] = (static_cast<float>(px[1]) - kNormMean) / kNormScale;
                input_tensor[idx + 2] = (static_cast<float>(px[2]) - kNormMean) / kNormScale;
            }
        }

    OnnxSession::InputTensor image_input;
    image_input.name = input_name_;
    image_input.type = OnnxSession::TensorType::Float32;
    image_input.data = input_tensor.data();
    image_input.shape = {1, kArcFaceInputSize, kArcFaceInputSize, 3};

    std::vector<OnnxSession::TensorView> outputs;
    try {
            outputs = session_->run(
                {image_input},
                {output_name_}
            );
        } catch (const std::exception& e) {
            std::cerr << "FaceEmbedder: inference threw: " << e.what() << "\n";
            return std::nullopt;
        }

    if (outputs.empty()) {
            std::cerr << "FaceEmbedder: empty output\n";
            return std::nullopt;
        }
        if (outputs[0].element_count != facegate::domain::EMBEDDING_DIM) {
            std::cerr << "FaceEmbedder: unexpected output size: "
                      << outputs[0].element_count
                      << " (expected " << facegate::domain::EMBEDDING_DIM << ")\n";
            return std::nullopt;
        }

    facegate::domain::EmbeddingVector embedding{};
    std::memcpy(
        embedding.data(),
        outputs[0].data,
        facegate::domain::EMBEDDING_DIM * sizeof(float)
    );

    float norm_sq = 0.0f;
    for (float v : embedding) {
        norm_sq += v * v;
    }
    const float norm = std::sqrt(norm_sq);
    if (norm < 1e-9f) {
            std::cerr << "FaceEmbedder: degenerate norm: " << norm << "\n";
            return std::nullopt;
        }

    const float inv_norm = 1.0f / norm;
    for (float& v : embedding) {
        v *= inv_norm;
    }

    return embedding;
}

}  // namespace facegate::vision

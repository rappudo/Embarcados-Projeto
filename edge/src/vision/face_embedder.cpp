#include "vision/face_embedder.hpp"

#include <opencv2/imgproc.hpp>

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

// InsightFace canonical 5-point landmarks for a 112x112 crop. We use only
// the two eye positions to solve a closed-form similarity transform
// (rotation + uniform scale + translation), which avoids linking
// opencv_calib3d for estimateAffinePartial2D.
constexpr float kCanonicalRightEyeX = 38.2946f;
constexpr float kCanonicalRightEyeY = 51.6963f;
constexpr float kCanonicalLeftEyeX  = 73.5318f;
constexpr float kCanonicalLeftEyeY  = 51.5014f;

// MediaPipe BlazeFace 6-keypoint order: 0=subject right eye (image-left),
// 1=subject left eye (image-right), 2=nose, 3=mouth, 4/5=ears. Matches
// InsightFace's "right_eye"/"left_eye" naming (subject-relative).
constexpr std::size_t kRightEyeIdx = 0;
constexpr std::size_t kLeftEyeIdx  = 1;

cv::Mat similarity_transform_from_eyes(const Keypoints& kps) {
    const float sx0 = kps[kRightEyeIdx].x;
    const float sy0 = kps[kRightEyeIdx].y;
    const float sx1 = kps[kLeftEyeIdx].x;
    const float sy1 = kps[kLeftEyeIdx].y;

    const float dx = sx1 - sx0;
    const float dy = sy1 - sy0;
    const float norm_sq = dx * dx + dy * dy;
    if (norm_sq < 1e-6f) {
        return {};
    }

    const float Dx = kCanonicalLeftEyeX - kCanonicalRightEyeX;
    const float Dy = kCanonicalLeftEyeY - kCanonicalRightEyeY;

    const float a = (dx * Dx + dy * Dy) / norm_sq;
    const float b = (dx * Dy - dy * Dx) / norm_sq;

    const float tx = kCanonicalRightEyeX - (a * sx0 - b * sy0);
    const float ty = kCanonicalRightEyeY - (b * sx0 + a * sy0);

    return (cv::Mat_<float>(2, 3) << a, -b, tx, b, a, ty);
}

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
    if (detection.bbox.width < 10.0f || detection.bbox.height < 10.0f) {
        std::cerr << "FaceEmbedder: bbox too small: w=" << detection.bbox.width
                  << " h=" << detection.bbox.height << "\n";
        return std::nullopt;
    }

    const cv::Mat M = similarity_transform_from_eyes(detection.keypoints);
    if (M.empty()) {
        std::cerr << "FaceEmbedder: degenerate eye keypoints, skipping\n";
        return std::nullopt;
    }

    cv::Mat face_aligned;
    cv::warpAffine(
        frame_bgr, face_aligned, M,
        cv::Size(kArcFaceInputSize, kArcFaceInputSize),
        cv::INTER_LINEAR, cv::BORDER_CONSTANT, cv::Scalar(0, 0, 0)
    );

    cv::Mat face_rgb;
    cv::cvtColor(face_aligned, face_rgb, cv::COLOR_BGR2RGB);

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

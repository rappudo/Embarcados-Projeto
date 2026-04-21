#include "vision/face_detector.hpp"

#include <opencv2/imgproc.hpp>

#include <algorithm>
#include <cstdint>
#include <stdexcept>
#include <vector>

#include "vision/onnx_session.hpp"

namespace facegate::vision {

namespace {

constexpr int kBlazeFaceInputSize = 128;
constexpr int kMaxDetections = 25;
constexpr int kFloatsPerDetection = 16;

std::vector<float> preprocess_bgr_to_blaze_input(const cv::Mat& frame_bgr) {
    cv::Mat resized;
    cv::resize(frame_bgr, resized,
               cv::Size(kBlazeFaceInputSize, kBlazeFaceInputSize));

    cv::Mat rgb;
    cv::cvtColor(resized, rgb, cv::COLOR_BGR2RGB);

    std::vector<float> tensor(
        3 * kBlazeFaceInputSize * kBlazeFaceInputSize
    );

    const int hw = kBlazeFaceInputSize * kBlazeFaceInputSize;
    for (int row = 0; row < kBlazeFaceInputSize; ++row) {
        for (int col = 0; col < kBlazeFaceInputSize; ++col) {
            const cv::Vec3b& px = rgb.at<cv::Vec3b>(row, col);
            const int idx = row * kBlazeFaceInputSize + col;
            tensor[0 * hw + idx] = static_cast<float>(px[0]) / 255.0f;
            tensor[1 * hw + idx] = static_cast<float>(px[1]) / 255.0f;
            tensor[2 * hw + idx] = static_cast<float>(px[2]) / 255.0f;
        }
    }

    return tensor;
}

}  // namespace

FaceDetector::FaceDetector(
    const std::string& model_path,
    int num_threads,
    float conf_threshold,
    float iou_threshold
)
    : session_(std::make_unique<OnnxSession>(model_path, num_threads)),
      conf_threshold_(conf_threshold),
      iou_threshold_(iou_threshold) {
    const auto in_names = session_->input_names();
    const auto out_names = session_->output_names();

    if (in_names.size() < 4 || out_names.empty()) {
        throw std::runtime_error(
            "FaceDetector: BlazeFace model expected to have 4 inputs and 1 output"
        );
    }

    input_name_image_   = in_names[0];
    input_name_conf_    = in_names[1];
    input_name_max_det_ = in_names[2];
    input_name_iou_     = in_names[3];

    output_name_boxes_ = out_names[0];
}

FaceDetector::~FaceDetector() = default;

std::optional<Detection> FaceDetector::detect_best(const cv::Mat& frame_bgr) {
    const int frame_w = frame_bgr.cols;
    const int frame_h = frame_bgr.rows;

    if (frame_w <= 0 || frame_h <= 0) {
        return std::nullopt;
    }

    std::vector<float> image_tensor = preprocess_bgr_to_blaze_input(frame_bgr);
    std::vector<float> conf_tensor = {conf_threshold_};
    std::vector<float> iou_tensor = {iou_threshold_};
    std::vector<std::int64_t> max_det_tensor = {kMaxDetections};

    OnnxSession::InputTensor image_in;
    image_in.name = input_name_image_;
    image_in.type = OnnxSession::TensorType::Float32;
    image_in.data = image_tensor.data();
    image_in.shape = {1, 3, kBlazeFaceInputSize, kBlazeFaceInputSize};

    OnnxSession::InputTensor conf_in;
    conf_in.name = input_name_conf_;
    conf_in.type = OnnxSession::TensorType::Float32;
    conf_in.data = conf_tensor.data();
    conf_in.shape = {1};

    OnnxSession::InputTensor max_det_in;
    max_det_in.name = input_name_max_det_;
    max_det_in.type = OnnxSession::TensorType::Int64;
    max_det_in.data = max_det_tensor.data();
    max_det_in.shape = {1};

    OnnxSession::InputTensor iou_in;
    iou_in.name = input_name_iou_;
    iou_in.type = OnnxSession::TensorType::Float32;
    iou_in.data = iou_tensor.data();
    iou_in.shape = {1};

    std::vector<OnnxSession::TensorView> outputs;
    try {
        outputs = session_->run(
            {image_in, conf_in, max_det_in, iou_in},
            {output_name_boxes_}
        );
    } catch (const std::exception&) {
        return std::nullopt;
    }

    if (outputs.empty()) {
        return std::nullopt;
    }

    const auto& boxes = outputs[0];

    std::size_t num_detections = 0;
    if (boxes.shape.size() == 3 && boxes.shape[2] == kFloatsPerDetection) {
        num_detections = static_cast<std::size_t>(boxes.shape[1]);
    } else if (boxes.shape.size() == 2 && boxes.shape[1] == kFloatsPerDetection) {
        num_detections = static_cast<std::size_t>(boxes.shape[0]);
    } else {
        return std::nullopt;
    }

    if (num_detections == 0) {
        return std::nullopt;
    }

    const float* det = boxes.data;

    const float x1 = det[0] * frame_w;
    const float y1 = det[1] * frame_h;
    const float x2 = det[2] * frame_w;
    const float y2 = det[3] * frame_h;

    Detection result;
    result.bbox.x = x1;
    result.bbox.y = y1;
    result.bbox.width = x2 - x1;
    result.bbox.height = y2 - y1;

    for (std::size_t k = 0; k < NUM_KEYPOINTS; ++k) {
        result.keypoints[k].x = det[4 + k * 2 + 0] * frame_w;
        result.keypoints[k].y = det[4 + k * 2 + 1] * frame_h;
    }

    result.score = conf_threshold_;
    return result;
}

}  // namespace facegate::vision

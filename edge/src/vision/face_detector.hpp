#pragma once

#include <memory>
#include <optional>
#include <string>

#include <opencv2/core.hpp>

#include "vision/types.hpp"

namespace facegate::vision {

class OnnxSession;

class FaceDetector {
public:
    FaceDetector(
        const std::string& model_path,
        int num_threads,
        float conf_threshold = 0.5f,
        float iou_threshold = 0.3f
    );
    ~FaceDetector();

    FaceDetector(const FaceDetector&) = delete;
    FaceDetector& operator=(const FaceDetector&) = delete;
    FaceDetector(FaceDetector&&) = delete;
    FaceDetector& operator=(FaceDetector&&) = delete;

    std::optional<Detection> detect_best(const cv::Mat& frame_bgr);

    private:
        std::unique_ptr<OnnxSession> session_;

        std::string input_name_image_;
        std::string input_name_conf_;
        std::string input_name_max_det_;
        std::string input_name_iou_;
        std::string output_name_boxes_;

        float conf_threshold_;
        float iou_threshold_;
    };

}  // namespace facegate::vision

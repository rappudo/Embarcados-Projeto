#include "hardware/camera.hpp"

#include <opencv2/videoio.hpp>

#include <chrono>
#include <iostream>
#include <stdexcept>

namespace facegate::hardware {

struct Camera::Impl {
    cv::VideoCapture cap;
};

Camera::Camera(const std::string& source, int width, int height, int fps)
    : impl_(new Impl()) {
    if (!impl_->cap.open(source)) {
        delete impl_;
        throw std::runtime_error("Camera: failed to open source '" + source + "'");
    }

    impl_->cap.set(cv::CAP_PROP_FRAME_WIDTH, width);
    impl_->cap.set(cv::CAP_PROP_FRAME_HEIGHT, height);
    impl_->cap.set(cv::CAP_PROP_FPS, fps);

    std::cerr << "Camera: opened '" << source << "' ("
              << width << "x" << height << " @" << fps << "fps requested)\n";

    try {
        capture_thread_ = std::thread(&Camera::capture_loop, this);
    } catch (...) {
        impl_->cap.release();
        delete impl_;
        throw;
    }
}

Camera::~Camera() {
    stop_.store(true);
    if (capture_thread_.joinable()) {
        capture_thread_.join();
    }
    if (impl_) {
        impl_->cap.release();
        delete impl_;
    }
}

void Camera::capture_loop() {
    constexpr int kFailureLogThreshold = 30;
    int consecutive_failures = 0;
    bool was_failing = false;

    cv::Mat frame;

    while (!stop_.load()) {
        if (!impl_->cap.read(frame) || frame.empty()) {
            consecutive_failures++;
            if (consecutive_failures == kFailureLogThreshold) {
                std::cerr << "Camera: capture failing ("
                          << kFailureLogThreshold << " consecutive read failures)\n";
                was_failing = true;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            continue;
        }

        if (was_failing) {
            std::cerr << "Camera: capture recovered after "
                      << consecutive_failures << " failed reads\n";
            was_failing = false;
        }
        consecutive_failures = 0;

        {
            std::lock_guard<std::mutex> lock(frame_mutex_);
            latest_frame_ = frame;
            has_frame_ = true;
        }
    }
}

std::optional<cv::Mat> Camera::capture() {
    std::lock_guard<std::mutex> lock(frame_mutex_);
    if (!has_frame_) {
        return std::nullopt;
    }
    return latest_frame_.clone();
}

}  // namespace facegate::hardware

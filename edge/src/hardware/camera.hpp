#pragma once

#include <atomic>
#include <mutex>
#include <optional>
#include <string>
#include <thread>

#include <opencv2/core.hpp>

namespace facegate::hardware {

class Camera {
public:
    Camera(const std::string& source, int width, int height, int fps);
    ~Camera();

    Camera(const Camera&) = delete;
    Camera& operator=(const Camera&) = delete;
    Camera(Camera&&) = delete;
    Camera& operator=(Camera&&) = delete;

    std::optional<cv::Mat> capture();

private:
    void capture_loop();

    struct Impl;
    Impl* impl_;

    std::mutex frame_mutex_;
    cv::Mat latest_frame_;
    bool has_frame_ = false;

    std::atomic<bool> stop_{false};
    std::thread capture_thread_;
};

}  // namespace facegate::hardware

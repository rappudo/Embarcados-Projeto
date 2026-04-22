#pragma once

#include <array>
#include <cstddef>

namespace facegate::vision {

struct BBox {
    float x;
    float y;
    float width;
    float height;
};

struct Keypoint {
    float x;
    float y;
};

inline constexpr std::size_t NUM_KEYPOINTS = 6;

using Keypoints = std::array<Keypoint, NUM_KEYPOINTS>;

struct Detection {
    BBox bbox;
    Keypoints keypoints;
    float score;
};

}  // namespace facegate::vision

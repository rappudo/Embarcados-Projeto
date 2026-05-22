cmake_minimum_required(VERSION 3.16)
project(facegate CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

include_directories(${CMAKE_SOURCE_DIR}/src)

# -----------------------------------------------------------------------------
# Dependências externas
# -----------------------------------------------------------------------------
find_package(OpenCV REQUIRED)

find_package(PkgConfig REQUIRED)
pkg_check_modules(GPIOD REQUIRED libgpiod>=2.0)
pkg_check_modules(ONNXRUNTIME REQUIRED libonnxruntime)
pkg_check_modules(MOSQUITTO REQUIRED libmosquittopp)

find_package(tomlplusplus REQUIRED)
find_package(SQLiteCpp REQUIRED)
find_package(nlohmann_json REQUIRED)
find_package(Threads REQUIRED)

# -----------------------------------------------------------------------------
# Módulos
# -----------------------------------------------------------------------------
add_library(facegate_domain INTERFACE)
target_include_directories(facegate_domain INTERFACE ${CMAKE_SOURCE_DIR}/src)

add_library(facegate_config STATIC src/config/config.cpp)
target_link_libraries(facegate_config
    PUBLIC facegate_domain tomlplusplus::tomlplusplus
)

add_library(facegate_hardware STATIC
    src/hardware/turnstile.cpp
    src/hardware/buzzer.cpp
    src/hardware/camera.cpp
    src/hardware/rgb_led.cpp
)
target_include_directories(facegate_hardware
    PUBLIC ${OpenCV_INCLUDE_DIRS} ${GPIOD_INCLUDE_DIRS}
)
# Only the OpenCV modules the code actually uses (cv::Mat, cv::resize,
# cv::cvtColor, cv::VideoCapture). Avoids pulling opencv_cvv (Qt6),
# opencv_viz (VTK), opencv_hdf (HDF5) which Arch's `opencv` package
# ships unconditionally and the linker would otherwise demand at the
# transitive link step.
target_link_libraries(facegate_hardware
    PUBLIC facegate_domain
           opencv_core opencv_imgproc opencv_videoio
           ${GPIOD_LIBRARIES} Threads::Threads
)

add_library(facegate_storage STATIC src/storage/storage.cpp)
target_link_libraries(facegate_storage
    PUBLIC facegate_domain SQLiteCpp
)

add_library(facegate_vision STATIC
    src/vision/matcher.cpp
    src/vision/onnx_session.cpp
    src/vision/face_embedder.cpp
    src/vision/face_detector.cpp
)
target_include_directories(facegate_vision
    PUBLIC ${OpenCV_INCLUDE_DIRS} ${ONNXRUNTIME_INCLUDE_DIRS}
)
# Same selective-link rationale as facegate_hardware above.
target_link_libraries(facegate_vision
    PUBLIC facegate_domain
           opencv_core opencv_imgproc opencv_videoio
           ${ONNXRUNTIME_LIBRARIES}
)

add_library(facegate_mqtt STATIC
    src/mqtt/serialization.cpp
    src/mqtt/mqtt_publisher.cpp
    src/mqtt/mqtt_subscriber.cpp
)
target_include_directories(facegate_mqtt
    PUBLIC ${MOSQUITTO_INCLUDE_DIRS}
)
target_link_libraries(facegate_mqtt
    PUBLIC
        facegate_domain
        facegate_storage
        facegate_vision
        nlohmann_json::nlohmann_json
        ${MOSQUITTO_LIBRARIES}
        Threads::Threads
)
add_library(facegate_pipeline STATIC
    src/pipeline/pipeline.cpp
)
target_link_libraries(facegate_pipeline
    PUBLIC
        facegate_domain
        facegate_hardware
        facegate_vision
        facegate_storage
        facegate_mqtt
)

# -----------------------------------------------------------------------------
# App: facegate
# -----------------------------------------------------------------------------
add_executable(facegate apps/facegate/main.cpp)
target_link_libraries(facegate
    PRIVATE
        facegate_config
        facegate_domain
        facegate_hardware
        facegate_storage
        facegate_vision
        facegate_mqtt
        facegate_pipeline
)

# -----------------------------------------------------------------------------
# App: enroll
# -----------------------------------------------------------------------------
add_executable(enroll apps/enroll/main.cpp)
target_link_libraries(enroll
    PRIVATE
        facegate_config
        facegate_domain
        facegate_hardware
        facegate_storage
        facegate_vision
)

# -----------------------------------------------------------------------------
# Testes — opt-in via -DBUILD_TESTING=ON.
# Mantemos desligado por padrão para não atrasar o build do device, mas
# o CI / make targets locais ativam fácil. GoogleTest é encontrado pelo
# pacote do sistema (Arch: pacman -S gtest).
# -----------------------------------------------------------------------------
option(BUILD_TESTING "Build unit tests" OFF)
if(BUILD_TESTING)
    enable_testing()
    add_subdirectory(tests)
endif()

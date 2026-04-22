#include <chrono>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <iostream>
#include <optional>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include "config/config.hpp"
#include "domain/domain.hpp"
#include "hardware/camera.hpp"
#include "storage/storage.hpp"
#include "vision/face_detector.hpp"
#include "vision/face_embedder.hpp"

namespace {

struct Args {
    std::string config_path;
    facegate::domain::EmployeeId employee_id = 0;
    int photos = 5;
    bool append = false;
};

void print_usage(const char* prog) {
    std::cerr << "Usage: " << prog
              << " --config <path> --employee-id <id> [--photos N] [--append]\n"
              << "  --config       Path to config.toml (required)\n"
              << "  --employee-id  Numeric employee ID (required, > 0)\n"
              << "  --photos       Number of photos to capture (default: 5)\n"
              << "  --append       Add to existing embeddings instead of replacing\n";
}

std::optional<Args> parse_args(int argc, char** argv) {
    Args args;
    bool has_config = false;
    bool has_id = false;

    for (int i = 1; i < argc; ++i) {
        const std::string a = argv[i];
        if (a == "--config" && i + 1 < argc) {
            args.config_path = argv[++i];
            has_config = true;
        } else if (a == "--employee-id" && i + 1 < argc) {
            try {
                args.employee_id =
                    static_cast<facegate::domain::EmployeeId>(std::stoll(argv[++i]));
            } catch (...) {
                return std::nullopt;
            }
            has_id = true;
        } else if (a == "--photos" && i + 1 < argc) {
            try {
                args.photos = std::stoi(argv[++i]);
            } catch (...) {
                return std::nullopt;
            }
        } else if (a == "--append") {
            args.append = true;
        } else {
            return std::nullopt;
        }
    }

    if (!has_config || !has_id || args.employee_id <= 0 || args.photos <= 0) {
        return std::nullopt;
    }
    return args;
}

void ensure_parent_directory(const std::string& file_path) {
    std::filesystem::path path(file_path);
    auto parent = path.parent_path();
    if (parent.empty()) {
        return;
    }
    std::error_code ec;
    std::filesystem::create_directories(parent, ec);
    if (ec) {
        throw std::runtime_error(
            "Failed to create directory '" + parent.string() + "': " + ec.message()
        );
    }
}

void wait_for_enter() {
    std::string dummy;
    std::getline(std::cin, dummy);
}

}  // namespace

int main(int argc, char** argv) {
    auto args_opt = parse_args(argc, argv);
    if (!args_opt) {
        print_usage(argv[0]);
        return 2;
    }
    const Args args = *args_opt;

    try {
        std::cerr << "enroll: loading config from '" << args.config_path << "'\n";
        const auto cfg = facegate::config::load_config(args.config_path);

        ensure_parent_directory(cfg.storage.sqlite_path);

        std::cerr << "enroll: opening storage\n";
        facegate::storage::Storage storage(
            cfg.storage.sqlite_path,
            "migrations/schema.sql"
        );

        if (!args.append) {
            std::cerr << "enroll: removing existing embeddings for employee "
                      << args.employee_id << "\n";
            storage.delete_employee_embeddings(args.employee_id);
        }

        std::cerr << "enroll: opening camera\n";
        facegate::hardware::Camera camera(
            cfg.camera.device,
            cfg.camera.width,
            cfg.camera.height,
            cfg.camera.fps
        );

        std::cerr << "enroll: loading vision models\n";
        facegate::vision::FaceDetector detector(
            cfg.vision.blazeface_model,
            cfg.vision.onnx_threads
        );
        facegate::vision::FaceEmbedder embedder(
            cfg.vision.mobilefacenet_model,
            cfg.vision.onnx_threads
        );

        std::cerr << "enroll: warming up camera...\n";
        std::this_thread::sleep_for(std::chrono::seconds(2));

        int captured = 0;
        while (captured < args.photos) {
            std::cout << "\n[Photo " << (captured + 1) << " of " << args.photos
                      << "] Position the face and press Enter to capture..."
                      << std::flush;
            wait_for_enter();

            auto frame_opt = camera.capture();
            if (!frame_opt) {
                std::cout << "  No frame available yet, try again.\n";
                continue;
            }

            auto detection_opt = detector.detect_best(*frame_opt);
            if (!detection_opt) {
                std::cout << "  No face detected, try again.\n";
                continue;
            }

            std::cout << "  Face detected (score=" << detection_opt->score
                      << "). Extracting embedding...\n";

            auto embedding_opt = embedder.extract(*frame_opt, *detection_opt);
            if (!embedding_opt) {
                std::cout << "  Embedding extraction failed, try again.\n";
                continue;
            }

            facegate::domain::Embedding emb;
            emb.owner = args.employee_id;
            emb.vector = *embedding_opt;

            try {
                storage.insert_embedding(emb);
            } catch (const std::exception& e) {
                std::cerr << "  Failed to save: " << e.what() << "\n";
                continue;
            }

            ++captured;
            std::cout << "  Saved (" << captured << "/" << args.photos << ").\n";
        }

        std::cout << "\nenroll: done. " << captured
                  << " embeddings saved for employee "
                  << args.employee_id << ".\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "enroll: fatal error: " << e.what() << "\n";
        return 1;
    }
}

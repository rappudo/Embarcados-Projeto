// Offline evaluation harness for FaceGateway's recognition pipeline.
//
// Two modes — both use the same FaceDetector + FaceEmbedder code paths as
// the production edge daemon, so the alignment/normalization is byte-
// identical with what runs on the Pi.
//
//   --pairs <pairs.txt> --dataset <lfw_root>
//       Read LFW's canonical pairs.txt, embed every referenced image,
//       compute cosine distance per pair, and emit:
//         image_a,image_b,same,distance,status
//       Drive a FAR/FRR sweep in pandas from the resulting CSV.
//
//   --enroll-scale <N> --dataset <lfw_root>
//       Pick N identities (seeded random), enroll their first image as
//       gallery embeddings, then query every remaining image (genuine
//       probes) plus a sampled set of out-of-gallery images (impostors)
//       through the real Matcher (linear scan). Emit:
//         gallery_size,probe_path,probe_identity,is_genuine,
//         top1_identity,distance,match_us
//       Sweep gallery size by re-running with different N to study how
//       FAR drifts as the registered population grows.
//
// Image path resolution follows LFW's convention:
//   <dataset>/<Name>/<Name>_NNNN.jpg, NNNN zero-padded to 4 digits.

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <optional>
#include <random>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

#include <opencv2/core.hpp>
#include <opencv2/imgcodecs.hpp>

#include "domain/domain.hpp"
#include "vision/face_detector.hpp"
#include "vision/face_embedder.hpp"
#include "vision/matcher.hpp"

namespace fs = std::filesystem;

namespace {

enum class Mode { None, Pairs, EnrollScale };

struct Args {
    Mode mode = Mode::None;
    fs::path pairs_path;
    int enroll_n = 0;
    fs::path dataset;
    fs::path blaze_model = "models/blaze.onnx";
    fs::path arc_model = "models/arc.onnx";
    int onnx_threads = 2;
    fs::path out;
    std::uint64_t seed = 42;
    int max_probes_per_identity = 5;
    int max_impostors = 1000;
};

void print_usage(const char* prog) {
    std::cerr <<
        "Usage:\n"
        "  " << prog << " --pairs <pairs.txt> --dataset <lfw_dir> --out <pairs.csv>\n"
        "  " << prog << " --enroll-scale <N> --dataset <lfw_dir> --out <scale.csv>\n"
        "\n"
        "Common (with defaults):\n"
        "  --blaze-model <path>          (models/blaze.onnx)\n"
        "  --arc-model <path>            (models/arc.onnx)\n"
        "  --onnx-threads <n>            (2)\n"
        "  --seed <n>                    (42)\n"
        "  --max-probes-per-identity <n> (5,  enroll-scale mode only)\n"
        "  --max-impostors <n>           (1000, enroll-scale mode only)\n";
}

std::optional<Args> parse_args(int argc, char** argv) {
    Args a;
    for (int i = 1; i < argc; ++i) {
        const std::string k = argv[i];
        auto next = [&](const char* name) -> const char* {
            if (i + 1 >= argc) {
                std::cerr << "eval: missing value for " << name << "\n";
                return nullptr;
            }
            return argv[++i];
        };
        if (k == "--pairs") {
            const char* v = next("--pairs"); if (!v) return std::nullopt;
            a.pairs_path = v; a.mode = Mode::Pairs;
        } else if (k == "--enroll-scale") {
            const char* v = next("--enroll-scale"); if (!v) return std::nullopt;
            try { a.enroll_n = std::stoi(v); } catch (...) { return std::nullopt; }
            a.mode = Mode::EnrollScale;
        } else if (k == "--dataset") {
            const char* v = next("--dataset"); if (!v) return std::nullopt;
            a.dataset = v;
        } else if (k == "--blaze-model") {
            const char* v = next("--blaze-model"); if (!v) return std::nullopt;
            a.blaze_model = v;
        } else if (k == "--arc-model") {
            const char* v = next("--arc-model"); if (!v) return std::nullopt;
            a.arc_model = v;
        } else if (k == "--onnx-threads") {
            const char* v = next("--onnx-threads"); if (!v) return std::nullopt;
            try { a.onnx_threads = std::stoi(v); } catch (...) { return std::nullopt; }
        } else if (k == "--out") {
            const char* v = next("--out"); if (!v) return std::nullopt;
            a.out = v;
        } else if (k == "--seed") {
            const char* v = next("--seed"); if (!v) return std::nullopt;
            try { a.seed = std::stoull(v); } catch (...) { return std::nullopt; }
        } else if (k == "--max-probes-per-identity") {
            const char* v = next("--max-probes-per-identity"); if (!v) return std::nullopt;
            try { a.max_probes_per_identity = std::stoi(v); } catch (...) { return std::nullopt; }
        } else if (k == "--max-impostors") {
            const char* v = next("--max-impostors"); if (!v) return std::nullopt;
            try { a.max_impostors = std::stoi(v); } catch (...) { return std::nullopt; }
        } else {
            std::cerr << "eval: unknown argument: " << k << "\n";
            return std::nullopt;
        }
    }

    if (a.mode == Mode::None || a.dataset.empty() || a.out.empty()) {
        return std::nullopt;
    }
    if (a.mode == Mode::Pairs && a.pairs_path.empty()) return std::nullopt;
    if (a.mode == Mode::EnrollScale && a.enroll_n <= 0) return std::nullopt;
    return a;
}

fs::path lfw_image_path(const fs::path& dataset,
                        const std::string& name,
                        int idx) {
    std::ostringstream filename;
    filename << name << "_" << std::setw(4) << std::setfill('0') << idx << ".jpg";
    return dataset / name / filename.str();
}

// Extraction status reflects which stage (if any) bailed out. Surfaces in
// the pairs CSV so the user can quantify dataset-side failures separately
// from genuine distance distribution.
enum class ExtractStatus { Ok, ImreadFailed, NoFace, EmbedFailed };

struct EmbedResult {
    ExtractStatus status;
    facegate::domain::EmbeddingVector vector;
};

EmbedResult embed_image(facegate::vision::FaceDetector& detector,
                        facegate::vision::FaceEmbedder& embedder,
                        const fs::path& path) {
    EmbedResult r{};
    cv::Mat frame = cv::imread(path.string(), cv::IMREAD_COLOR);
    if (frame.empty()) {
        r.status = ExtractStatus::ImreadFailed;
        return r;
    }
    auto det = detector.detect_best(frame);
    if (!det) {
        r.status = ExtractStatus::NoFace;
        return r;
    }
    auto emb = embedder.extract(frame, *det);
    if (!emb) {
        r.status = ExtractStatus::EmbedFailed;
        return r;
    }
    r.status = ExtractStatus::Ok;
    r.vector = *emb;
    return r;
}

const char* status_str(ExtractStatus s) {
    switch (s) {
        case ExtractStatus::Ok: return "ok";
        case ExtractStatus::ImreadFailed: return "imread_failed";
        case ExtractStatus::NoFace: return "no_face";
        case ExtractStatus::EmbedFailed: return "embed_failed";
    }
    return "unknown";
}

float cosine_distance(const facegate::domain::EmbeddingVector& a,
                      const facegate::domain::EmbeddingVector& b) {
    float dot = 0.0f, na = 0.0f, nb = 0.0f;
    for (std::size_t i = 0; i < facegate::domain::EMBEDDING_DIM; ++i) {
        dot += a[i] * b[i];
        na  += a[i] * a[i];
        nb  += b[i] * b[i];
    }
    const float denom = std::sqrt(na) * std::sqrt(nb);
    if (denom < 1e-9f) return std::numeric_limits<float>::infinity();
    return 1.0f - (dot / denom);
}

// --------------------- Pairs mode ---------------------

struct LfwPair {
    fs::path a;
    fs::path b;
    bool same;
};

std::vector<LfwPair> parse_lfw_pairs(const fs::path& pairs_path,
                                    const fs::path& dataset) {
    std::ifstream f(pairs_path);
    if (!f) throw std::runtime_error("eval: cannot open " + pairs_path.string());

    std::string header;
    std::getline(f, header);  // "10 300" — we accept it but don't enforce.

    std::vector<LfwPair> out;
    std::string line;
    while (std::getline(f, line)) {
        if (line.empty()) continue;
        std::istringstream iss(line);
        std::vector<std::string> tok;
        std::string t;
        while (iss >> t) tok.push_back(t);

        if (tok.size() == 3) {
            // Same identity: name idx_a idx_b
            const auto& n = tok[0];
            const int ia = std::stoi(tok[1]);
            const int ib = std::stoi(tok[2]);
            out.push_back({lfw_image_path(dataset, n, ia),
                           lfw_image_path(dataset, n, ib),
                           true});
        } else if (tok.size() == 4) {
            // Different identity: name_a idx_a name_b idx_b
            const int ia = std::stoi(tok[1]);
            const int ib = std::stoi(tok[3]);
            out.push_back({lfw_image_path(dataset, tok[0], ia),
                           lfw_image_path(dataset, tok[2], ib),
                           false});
        }
        // Other shapes (header re-emitted between folds, etc.) are skipped.
    }
    return out;
}

int run_pairs_mode(const Args& a) {
    std::cerr << "eval[pairs]: loading models\n";
    facegate::vision::FaceDetector detector(a.blaze_model.string(), a.onnx_threads);
    facegate::vision::FaceEmbedder embedder(a.arc_model.string(), a.onnx_threads);

    std::cerr << "eval[pairs]: parsing " << a.pairs_path << "\n";
    const auto pairs = parse_lfw_pairs(a.pairs_path, a.dataset);
    std::cerr << "eval[pairs]: " << pairs.size() << " pairs to evaluate\n";

    // Embed each unique image once — LFW pairs reuse the same image many
    // times across pairs, so the cache cuts ONNX work roughly in half.
    std::unordered_map<std::string, EmbedResult> cache;
    std::size_t unique_imgs = 0;
    for (const auto& p : pairs) {
        if (cache.find(p.a.string()) == cache.end()) cache[p.a.string()] = {};
        if (cache.find(p.b.string()) == cache.end()) cache[p.b.string()] = {};
    }
    unique_imgs = cache.size();
    std::cerr << "eval[pairs]: " << unique_imgs << " unique images\n";

    std::size_t done = 0;
    std::size_t failed = 0;
    for (auto& [path_str, result] : cache) {
        result = embed_image(detector, embedder, fs::path(path_str));
        if (result.status != ExtractStatus::Ok) ++failed;
        if ((++done) % 250 == 0 || done == unique_imgs) {
            std::cerr << "eval[pairs]: embedded " << done << "/" << unique_imgs
                      << " (" << failed << " failed)\n";
        }
    }

    std::ofstream out(a.out);
    if (!out) {
        std::cerr << "eval: cannot open output " << a.out << "\n";
        return 1;
    }
    out << "image_a,image_b,same,distance,status\n";
    for (const auto& p : pairs) {
        const auto& ra = cache[p.a.string()];
        const auto& rb = cache[p.b.string()];
        std::string status;
        if (ra.status != ExtractStatus::Ok && rb.status != ExtractStatus::Ok) {
            status = std::string("a:") + status_str(ra.status) +
                     "|b:" + status_str(rb.status);
        } else if (ra.status != ExtractStatus::Ok) {
            status = std::string("a:") + status_str(ra.status);
        } else if (rb.status != ExtractStatus::Ok) {
            status = std::string("b:") + status_str(rb.status);
        } else {
            status = "ok";
        }
        out << p.a.string() << ',' << p.b.string() << ','
            << (p.same ? "1" : "0") << ',';
        if (ra.status == ExtractStatus::Ok && rb.status == ExtractStatus::Ok) {
            out << cosine_distance(ra.vector, rb.vector);
        }
        out << ',' << status << '\n';
    }
    out.flush();
    std::cerr << "eval[pairs]: wrote " << a.out << "\n";
    return 0;
}

// --------------------- Enroll-scale mode ---------------------

struct Identity {
    std::string name;
    std::vector<fs::path> images;
};

std::vector<Identity> enumerate_identities(const fs::path& dataset) {
    std::vector<Identity> out;
    if (!fs::is_directory(dataset)) {
        throw std::runtime_error("eval: dataset is not a directory: " + dataset.string());
    }
    for (const auto& entry : fs::directory_iterator(dataset)) {
        if (!entry.is_directory()) continue;
        Identity id;
        id.name = entry.path().filename().string();
        for (const auto& f : fs::directory_iterator(entry.path())) {
            const auto p = f.path();
            const auto ext = p.extension().string();
            if (ext == ".jpg" || ext == ".jpeg" || ext == ".png") {
                id.images.push_back(p);
            }
        }
        std::sort(id.images.begin(), id.images.end());
        if (!id.images.empty()) out.push_back(std::move(id));
    }
    std::sort(out.begin(), out.end(),
              [](const Identity& x, const Identity& y){ return x.name < y.name; });
    return out;
}

int run_enroll_scale_mode(const Args& a) {
    std::cerr << "eval[scale]: loading models\n";
    facegate::vision::FaceDetector detector(a.blaze_model.string(), a.onnx_threads);
    facegate::vision::FaceEmbedder embedder(a.arc_model.string(), a.onnx_threads);

    std::cerr << "eval[scale]: enumerating identities under " << a.dataset << "\n";
    auto identities = enumerate_identities(a.dataset);
    std::cerr << "eval[scale]: " << identities.size() << " identities total\n";

    // For genuine probes we need >=2 images per identity (one for the
    // gallery, the rest as probes). Partition without filtering identities
    // with single images out of the impostor pool — they're still valid
    // out-of-gallery samples.
    std::vector<std::size_t> multi_img_idx;
    for (std::size_t i = 0; i < identities.size(); ++i) {
        if (identities[i].images.size() >= 2) multi_img_idx.push_back(i);
    }
    if (static_cast<int>(multi_img_idx.size()) < a.enroll_n) {
        std::cerr << "eval[scale]: only " << multi_img_idx.size()
                  << " identities have >=2 images; cannot enroll " << a.enroll_n << "\n";
        return 1;
    }

    std::mt19937_64 rng(a.seed);
    std::shuffle(multi_img_idx.begin(), multi_img_idx.end(), rng);

    std::unordered_set<std::size_t> enrolled_set(
        multi_img_idx.begin(), multi_img_idx.begin() + a.enroll_n);

    // Build the gallery: id 1..N, owner = sequential, name lookup separately.
    std::cerr << "eval[scale]: enrolling " << a.enroll_n << " identities\n";
    std::vector<facegate::domain::Embedding> gallery;
    std::map<facegate::domain::EmployeeId, std::string> id_to_name;
    std::vector<std::pair<std::size_t, fs::path>> genuine_probes;  // (identity idx, probe path)
    std::size_t enroll_skipped = 0;
    for (std::size_t k = 0; k < static_cast<std::size_t>(a.enroll_n); ++k) {
        const std::size_t ident_idx = multi_img_idx[k];
        const auto& id = identities[ident_idx];
        const auto er = embed_image(detector, embedder, id.images.front());
        if (er.status != ExtractStatus::Ok) {
            ++enroll_skipped;
            continue;
        }
        facegate::domain::Embedding e;
        e.id = static_cast<std::int64_t>(gallery.size() + 1);
        e.owner = static_cast<facegate::domain::EmployeeId>(gallery.size() + 1);
        e.vector = er.vector;
        gallery.push_back(e);
        id_to_name[e.owner] = id.name;

        // Genuine probes: every image after the first, capped by config.
        int taken = 0;
        for (std::size_t j = 1;
             j < id.images.size() &&
             taken < a.max_probes_per_identity;
             ++j, ++taken) {
            genuine_probes.emplace_back(ident_idx, id.images[j]);
        }
        if ((k + 1) % 50 == 0) {
            std::cerr << "eval[scale]: enrolled " << (k + 1) << "/" << a.enroll_n
                      << " (" << enroll_skipped << " skipped)\n";
        }
    }
    std::cerr << "eval[scale]: gallery size " << gallery.size()
              << ", " << genuine_probes.size() << " genuine probes queued\n";

    // Impostor probes: one image per identity NOT in the enrolled set,
    // sampled uniformly to keep the run bounded.
    std::vector<std::pair<std::size_t, fs::path>> impostor_probes;
    {
        std::vector<std::size_t> candidates;
        for (std::size_t i = 0; i < identities.size(); ++i) {
            if (enrolled_set.count(i) == 0) candidates.push_back(i);
        }
        std::shuffle(candidates.begin(), candidates.end(), rng);
        const std::size_t take = std::min<std::size_t>(
            candidates.size(), static_cast<std::size_t>(a.max_impostors));
        for (std::size_t i = 0; i < take; ++i) {
            const auto& id = identities[candidates[i]];
            impostor_probes.emplace_back(candidates[i], id.images.front());
        }
    }
    std::cerr << "eval[scale]: " << impostor_probes.size() << " impostor probes queued\n";

    // Threshold sentinel: Matcher returns nullopt above its threshold, so
    // we ask it to never reject — distance is recorded raw and the user
    // sweeps thresholds in pandas afterwards.
    constexpr float kAcceptAll = 999.0f;
    auto matcher = std::make_unique<facegate::vision::Matcher>(gallery, kAcceptAll);

    std::ofstream out(a.out);
    if (!out) {
        std::cerr << "eval: cannot open output " << a.out << "\n";
        return 1;
    }
    out << "gallery_size,probe_path,probe_identity,is_genuine,"
           "top1_identity,distance,match_us\n";

    auto run_probes = [&](const std::vector<std::pair<std::size_t, fs::path>>& probes,
                          bool is_genuine,
                          const char* label) {
        std::size_t done = 0, failed = 0;
        for (const auto& [ident_idx, path] : probes) {
            const auto er = embed_image(detector, embedder, path);
            if (er.status != ExtractStatus::Ok) {
                ++failed;
                if ((++done) % 250 == 0) {
                    std::cerr << "eval[scale]: " << label << " " << done << "/"
                              << probes.size() << " (" << failed << " failed)\n";
                }
                continue;
            }
            const auto t0 = std::chrono::steady_clock::now();
            const auto match = matcher->find_match(er.vector);
            const auto t1 = std::chrono::steady_clock::now();
            const auto us = std::chrono::duration_cast<std::chrono::microseconds>(
                t1 - t0).count();

            std::string top1_name = "";
            float distance = std::numeric_limits<float>::infinity();
            if (match) {
                auto it = id_to_name.find(match->employee);
                if (it != id_to_name.end()) top1_name = it->second;
                distance = match->distance;
            }
            out << gallery.size() << ',' << path.string() << ','
                << identities[ident_idx].name << ','
                << (is_genuine ? "1" : "0") << ','
                << top1_name << ',';
            if (match) out << distance;
            out << ',' << us << '\n';
            if ((++done) % 250 == 0 || done == probes.size()) {
                std::cerr << "eval[scale]: " << label << " " << done << "/"
                          << probes.size() << " (" << failed << " failed)\n";
            }
        }
    };

    run_probes(genuine_probes, true, "genuine");
    run_probes(impostor_probes, false, "impostor");
    out.flush();
    std::cerr << "eval[scale]: wrote " << a.out << "\n";
    return 0;
}

}  // namespace

int main(int argc, char** argv) {
    auto args_opt = parse_args(argc, argv);
    if (!args_opt) {
        print_usage(argv[0]);
        return 2;
    }
    try {
        if (args_opt->mode == Mode::Pairs) {
            return run_pairs_mode(*args_opt);
        }
        return run_enroll_scale_mode(*args_opt);
    } catch (const std::exception& e) {
        std::cerr << "eval: fatal error: " << e.what() << "\n";
        return 1;
    }
}

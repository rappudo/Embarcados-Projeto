# Contributing to FaceGateway

Single-page onboarding for a teammate who just cloned the repo. For
deeper references, see:

- [`README.md`](README.md) — project overview, stack, demo credentials
- [`docs/CODE_GUIDE.md`](docs/CODE_GUIDE.md) — file-by-file reference
- [`edge/DESIGN.md`](edge/DESIGN.md) — rationale for the C++ design decisions
- [`backend/tests/README.md`](backend/tests/README.md), [`panel/src/app/TESTING.md`](panel/src/app/TESTING.md), [`edge/tests/README.md`](edge/tests/README.md) — per-layer test guides

---

## 1. Prerequisites

| Tool | Why | Install (Arch) |
| ---- | --- | -------------- |
| Docker + Docker Compose | Postgres + Mosquitto for backend dev | `sudo pacman -S docker docker-compose` |
| Rust (stable) | Backend | [rustup.rs](https://rustup.rs/) |
| Node.js 20+ + Ionic CLI | Panel | `sudo pacman -S nodejs npm && sudo npm i -g @ionic/cli` |
| Chromium | Panel headless tests | `sudo pacman -S chromium` |
| CMake 3.16+, GCC 12+ | Edge build | `sudo pacman -S base-devel cmake` |
| Edge native deps (Pi only) | Vision + GPIO + MQTT | see `README.md` § Edge |

Optional but useful:

- `cargo-llvm-cov` (`cargo install cargo-llvm-cov`) for backend coverage
- `gcovr` (`sudo pacman -S gcovr`) for edge coverage
- `gtest` (`sudo pacman -S gtest`) — only needed if running edge tests locally

## 2. First-time setup

```bash
git clone git@github.com:rappudo/Embarcados-Projeto.git
cd Embarcados-Projeto

# Configure environment — Postgres password, JWT secret, MQTT host/port.
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD and JWT_SECRET to non-default values.

# Bring up the infrastructure (Postgres with pgvector + Mosquitto).
cd infra
docker compose --env-file ../.env up -d
cd ..
```

Verify the stack is alive:

```bash
docker exec facegate-db psql -U facegate -d facegate \
  -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
docker exec facegate-broker mosquitto_pub -t test/ping -m ok && echo "broker ok"
```

(Optional) seed demo data — 25 employees + a week of events:

```bash
docker exec -i facegate-db psql -U facegate -d facegate < infra/seed_demo.sql
```

## 3. Running the apps locally

| Layer | Command | Listens on |
| ----- | ------- | ---------- |
| Backend | `cd backend && cargo run --release` | `[::]:3000` |
| Panel | `cd panel && npm install && ionic serve` | `http://localhost:8100` |
| Edge | `cd edge && cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j$(nproc) && sudo ./build/facegate --config config/config.toml` | (Raspberry Pi only) |

Default login (from `infra/migrations/00_init.sql`): `admin@facegate.local` / `admin123`.

## 4. Running the tests

All three layers have automated test suites; all of them run in CI on
every push and pull request. To run them locally:

### Backend (Rust integration tests)

```bash
cd backend
DATABASE_URL=postgresql://facegate:<your_pw>@localhost:5432/facegate \
  cargo test -- --test-threads=1
```

`--test-threads=1` is required (tests share a single `facegate_test`
database that the harness creates on first run). The test database is
separate from the dev database — your data is untouched.

### Panel (Angular + Karma)

```bash
cd panel
CHROME_BIN=/usr/bin/chromium npm test -- \
  --watch=false --browsers=ChromeHeadlessCI
```

For local development with hot reload (and a real browser window):

```bash
CHROME_BIN=/usr/bin/chromium npm test -- --browsers=Chrome
```

### Edge (C++ + GoogleTest)

Opt-in via `-DBUILD_TESTING=ON`:

```bash
cd edge
cmake -S . -B build -DBUILD_TESTING=ON
cmake --build build -j$(nproc)
ctest --test-dir build --output-on-failure
```

### All three at once

```bash
# From repo root, requires infra/ up and the deps above installed.
(cd backend && DATABASE_URL=... cargo test -- --test-threads=1) && \
(cd panel && CHROME_BIN=/usr/bin/chromium npm test -- --watch=false --browsers=ChromeHeadlessCI) && \
(cd edge && cmake -S . -B build -DBUILD_TESTING=ON && cmake --build build -j$(nproc) && ctest --test-dir build)
```

## 5. Code quality checks

CI runs these on every PR. Run them locally before pushing to avoid the
round-trip:

```bash
# Backend
cd backend && cargo clippy --all-targets -- -D warnings
cd backend && cargo fmt --check

# Panel
cd panel && npm run lint
```

The edge layer enforces `-Wall -Wextra -Wpedantic` at compile time —
warnings become visible immediately during the build.

## 6. Coverage (optional)

If you want to see what's covered:

```bash
# Backend
cd backend && cargo llvm-cov --lcov --output-path coverage.lcov -- --test-threads=1
cargo llvm-cov report --summary-only

# Panel
cd panel && npm test -- --watch=false --browsers=ChromeHeadlessCI --code-coverage
# Browse coverage/app/index.html

# Edge
cd edge && cmake -S . -B build -DBUILD_TESTING=ON \
  -DCMAKE_CXX_FLAGS="-O0 --coverage" -DCMAKE_EXE_LINKER_FLAGS="--coverage"
cmake --build build -j$(nproc) && ctest --test-dir build
gcovr --root . --filter 'src/' --filter 'apps/' --print-summary build
```

CI uploads the same reports as workflow artifacts (`backend-coverage`,
`panel-coverage`, `edge-coverage`) — easier than rebuilding locally if
you just want to inspect a specific run.

## 7. Pull request workflow

1. Branch from `main`: `git checkout -b feat/<short-description>`.
2. Make changes; run the relevant test suite locally.
3. Push to your branch — CI (`backend`, `panel`, `edge` jobs) runs
   automatically on push and on PRs targeting `main`.
4. Open a PR against `main`.
5. CI must pass before merge. The badge in `README.md` should stay
   green on `main` at all times.

### Commit message style

The existing `git log` uses short, scope-prefixed messages:

- `panel: <change>` for `panel/` changes
- `backend: <change>` for `backend/` changes
- `edge: <change>` for `edge/` changes
- `infra: <change>` for `infra/` changes
- `ci: <change>` for `.github/workflows/` changes
- `deps(<layer>): <change>` — Dependabot's prefix (do not change)
- `fix: <description>` for cross-cutting bug fixes
- `feat: <description>` for cross-cutting new features

## 8. Dependency updates

Dependabot opens weekly PRs for `cargo`, `npm`, and `github-actions`
(see `.github/dependabot.yml`). Review them like any other PR — CI
will exercise the bumped dependency.

The edge layer's system packages (OpenCV, ONNXRuntime, etc.) come from
Arch's `pacman` in the CI container and aren't tracked by Dependabot;
bump them manually in `.github/workflows/ci.yml` when needed. SQLiteCpp
is built from source in CI — its tag is pinned in the same workflow.

## 9. Project layout cheat sheet

```
.
├── backend/      # Rust API + MQTT subscriber (cargo)
├── panel/        # Angular + Ionic PWA (npm)
├── edge/         # C++ daemon for Raspberry Pi (cmake)
├── infra/        # Docker stack + Postgres migrations
├── docs/         # CODE_GUIDE.md, arquitetura.png, LaTeX report
└── .github/
    ├── workflows/ci.yml    # CI: 3 parallel jobs + coverage
    └── dependabot.yml      # weekly dep update PRs
```

## 10. Where to ask questions

This is an academic project — the team is listed at the bottom of
[`README.md`](README.md). For implementation questions, check
[`docs/CODE_GUIDE.md`](docs/CODE_GUIDE.md) first; it's a file-by-file
reference that covers most "what is this for?" questions.

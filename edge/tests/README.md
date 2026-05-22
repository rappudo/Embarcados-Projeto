# Edge tests

GoogleTest-based unit tests for the C++ pipeline layers that have no
hardware coupling. Vision-network and GPIO modules need a real Pi and
real ONNX models, so they're excluded — see "Not covered" below.

## Prerequisites

- `gtest >= 1.10` system-wide. On Arch: `sudo pacman -S gtest`.
- All edge build deps already in place (OpenCV, ONNXRuntime, SQLiteCpp,
  nlohmann-json, tomlplusplus, libmosquittopp, libgpiod).

## Running

Tests are opt-in to keep the device build fast. Configure with
`-DBUILD_TESTING=ON`:

```bash
# from edge/
cmake -S . -B build -DBUILD_TESTING=ON
cmake --build build -j$(nproc)
ctest --test-dir build --output-on-failure
```

Run a single suite:

```bash
ctest --test-dir build -R Matcher
ctest --test-dir build -R Serialization
ctest --test-dir build -R StorageTest
ctest --test-dir build -R ConfigTest
```

Or invoke the binary directly for a friendlier failure summary:

```bash
./build/tests/matcher_test --gtest_filter='Matcher.UpsertReplacesWhenIdExists'
```

## Coverage

| File                      | Module           | Tests | Focus                                                                                                |
| ------------------------- | ---------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `matcher_test.cpp`        | `facegate_vision`| 10    | cosine distance correctness, threshold-exclusive boundary, tie-breaking, upsert insert/replace, remove, empty cache, zero-norm infinity guard |
| `serialization_test.cpp`  | `facegate_mqtt`  | 6     | AccessEvent JSON shape (granted/unknown/denied), explicit-null employee_id/distance, Heartbeat, FaultKind→string map, timestamp unit (ms not ns) |
| `storage_test.cpp`        | `facegate_storage`| 12   | embedding BLOB round-trip preserves all 512 floats, upsert insert/replace, id=0 rejection, delete-by-id, delete-by-employee, pending-events FIFO with limit, delete |
| `config_test.cpp`         | `facegate_config`| 11    | valid TOML loads, missing required fields throw, threshold range, GPIO pin uniqueness, GPIO-disabled skips pin checks, port range, log-level enum, optional `[recognition]` defaults to safe positives, malformed TOML surfaces as runtime_error |

Total: 39 tests, ~7s wall-clock.

## Design notes

- **Per-test isolation.** Storage and config tests allocate a unique
  temp path under `std::filesystem::temp_directory_path()` per test and
  clean up in `TearDown()`. No shared fixture state, no order
  dependencies.
- **Real SQLite, not in-memory.** Tests open with `OPEN_CREATE` against
  a temp file, matching production behavior. Catches bugs that
  `:memory:` would mask (e.g. BLOB encoding on disk).
- **CMake-injected paths.** The path to `migrations/schema.sql` is
  passed as a compile-time macro (`EDGE_MIGRATIONS_DIR`) so the test
  binary works from any build directory layout without hard-coded
  paths.
- **GoogleTest discovery.** `gtest_discover_tests` queries each test
  binary at build time and registers each `TEST(...)` as an individual
  ctest case. `ctest -V` lists them one by one; CI can filter with
  `-R PatternName`.

## Not yet covered

- `face_detector` / `face_embedder` (`facegate_vision`) — depend on the
  130 MB ArcFace ONNX model being on disk and on real `onnxruntime`
  init. Better fit for an integration test on the Pi than a unit test.
- `Camera`, `Turnstile`, `Buzzer`, `RgbLed` (`facegate_hardware`) —
  every method talks to V4L2 or libgpiod, neither of which exists in
  CI. Would need a HAL abstraction to mock.
- `MqttPublisher` / `MqttSubscriber` — talk to the broker. Pure logic
  (serialization, subscriber's "apply sync message to Storage") is
  already covered through `serialization_test` and `storage_test`.
- `Pipeline` (state machine + frame loop) — would be high-value but
  needs a fake camera + fake matcher + fake actuators. Worth a separate
  pass if there's time.

# Edge test binaries.
#
# Each TEST(...) suite lives in its own .cpp file and is compiled into a
# standalone executable that links against the relevant facegate_* lib.
# `gtest_discover_tests` queries the binary at build time and registers
# each TEST as an individual ctest case, so `ctest -V` lists them
# one-by-one.

find_package(GTest REQUIRED)
include(GoogleTest)

# Inject the path to the SQLite migration file so storage tests can
# point Storage at the real schema without baking an absolute path into
# source. The path resolves at configure time relative to the source
# tree, so the value is stable across out-of-tree builds.
set(EDGE_MIGRATIONS_DIR "${CMAKE_SOURCE_DIR}/migrations")

function(add_edge_test name)
    add_executable(${name} ${name}.cpp)
    target_link_libraries(${name} PRIVATE GTest::gtest GTest::gtest_main ${ARGN})
    target_compile_definitions(${name}
        PRIVATE EDGE_MIGRATIONS_DIR="${EDGE_MIGRATIONS_DIR}"
    )
    gtest_discover_tests(${name})
endfunction()

add_edge_test(matcher_test       facegate_vision)
add_edge_test(serialization_test facegate_mqtt)
add_edge_test(storage_test       facegate_storage)
add_edge_test(config_test        facegate_config)

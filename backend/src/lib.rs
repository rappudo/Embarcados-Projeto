//! Library entry point.
//!
//! The binary in `main.rs` is a thin wrapper around this crate. Exposing
//! the modules as a library lets integration tests in `tests/` build the
//! router in-process and exercise the real handlers against a test DB.

pub mod config;
pub mod db;
pub mod models;
pub mod mqtt;
pub mod routes;

/**
 * Base URL for the Rust backend.
 *
 * Resolution order:
 *   1. `localStorage['facegate.apiBaseUrl']` — set by the settings page so
 *      a single deployed bundle can target multiple backends without rebuild.
 *   2. The default below (good for `ionic serve` against `cargo run`).
 *
 * Evaluated once at module load. After saving a new value in settings
 * the page invites the user to reload — simpler than rewiring every
 * already-injected HttpClient call site.
 */
const STORAGE_KEY = "facegate.apiBaseUrl";
const DEFAULT_BASE_URL = "http://localhost:3000";

function resolveBaseUrl(): string {
  // `typeof window` guard so SSR / unit tests don't explode on first import.
  if (typeof window === "undefined") return DEFAULT_BASE_URL;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  // Reject blanks — an empty string would silently break every request.
  if (stored && stored.trim().length > 0) return stored.trim();
  return DEFAULT_BASE_URL;
}

export const API_BASE_URL = resolveBaseUrl();
export const API_BASE_URL_DEFAULT = DEFAULT_BASE_URL;
export const API_BASE_URL_STORAGE_KEY = STORAGE_KEY;

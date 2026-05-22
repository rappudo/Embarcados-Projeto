import { Injectable, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { Observable, tap } from "rxjs";

import { API_BASE_URL } from "../api/api.config";
import { JwtClaims, LoginRequest, LoginResponse } from "../models/auth.model";

/**
 * AuthService — owns authentication state for the whole app.
 *
 * `providedIn: 'root'` makes this a singleton: Angular's injector creates
 * exactly one instance, lazily on first injection. Components and other
 * services use `inject(AuthService)` to get the shared instance.
 *
 * Reactive state lives in a `signal` so templates can read
 * `auth.isLoggedIn()` directly and Angular re-runs the binding when it
 * changes. Token expiry is also checked proactively (see
 * `isAuthenticated`) so a stale localStorage entry doesn't keep the user
 * "logged in" until the next 401.
 */
@Injectable({ providedIn: "root" })
export class AuthService {
  // localStorage key for the JWT. Prefixed to avoid collisions with other
  // apps on the same origin. Single key across the whole app — there
  // used to be a parallel `facegate.auth.token` written by a legacy
  // login flow; both implementations have been merged into this one.
  private static readonly TOKEN_KEY = "facegate.jwt";

  private http = inject(HttpClient);
  private router = inject(Router);

  /** Reactive flag: true if a token is currently stored. Does NOT check
   * expiry on its own — use `isAuthenticated()` for that. The signal is
   * still useful for cheap reads inside templates that only care about
   * "is there a session at all". */
  readonly isLoggedIn = signal<boolean>(this.hasToken());

  /** Synchronous read of the JWT. Used by the interceptor. */
  getToken(): string | null {
    return localStorage.getItem(AuthService.TOKEN_KEY);
  }

  /**
   * Stronger than `isLoggedIn()`: also decodes the JWT and rejects if
   * `exp` is in the past. Used by the route guard so a stale token
   * doesn't grant access to protected pages before the first 401.
   */
  isAuthenticated(): boolean {
    const claims = this.decodeToken();
    if (!claims) return false;
    if (claims.exp * 1000 <= Date.now()) {
      // Clean up so subsequent reads see the truth.
      this.clearToken();
      return false;
    }
    return true;
  }

  /**
   * Hit POST /auth/login. On success, stash the token and flip
   * the signal. Returns the raw response in case the caller wants
   * to chain (e.g. to navigate after success).
   */
  login(email: string, password: string): Observable<LoginResponse> {
    const body: LoginRequest = { email, password };
    return this.http
      .post<LoginResponse>(`${API_BASE_URL}/auth/login`, body)
      .pipe(
        tap((res) => {
          localStorage.setItem(AuthService.TOKEN_KEY, res.token);
          this.isLoggedIn.set(true);
        }),
      );
  }

  /** Wipe the token, flip the signal, redirect to /login. */
  logout(): void {
    this.clearToken();
    this.router.navigate(["/login"]);
  }

  private clearToken(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
    this.isLoggedIn.set(false);
  }

  private hasToken(): boolean {
    return !!localStorage.getItem(AuthService.TOKEN_KEY);
  }

  private decodeToken(): JwtClaims | null {
    const token = this.getToken();
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    try {
      // Base64url → Base64, then decode.
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(base64)) as JwtClaims;
    } catch {
      return null;
    }
  }
}

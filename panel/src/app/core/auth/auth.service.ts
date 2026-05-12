import { Injectable, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Router } from "@angular/router";
import { Observable, tap } from "rxjs";

import { API_BASE_URL } from "../api/api.config";
import { LoginRequest, LoginResponse } from "../models/auth.model";

/**
 * AuthService — owns authentication state for the whole app.
 *
 * `providedIn: 'root'` makes this a singleton: Angular's dependency
 * injector creates exactly one instance, app-wide, lazily on first
 * injection. We never `new AuthService()` — components and other
 * services use `inject(AuthService)` to get the shared instance.
 *
 * Reactive state lives in a `signal`. Components can render
 * `auth.isLoggedIn()` directly in templates and Angular re-runs
 * the binding whenever the signal value changes. No subscribe/unsubscribe.
 */
@Injectable({ providedIn: "root" })
export class AuthService {
  // localStorage key for the JWT. Prefixed to avoid collisions
  // with other apps on the same origin.
  private static readonly TOKEN_KEY = "facegate.jwt";

  private http = inject(HttpClient);
  private router = inject(Router);

  /** Reactive flag: true if a token is currently stored. */
  readonly isLoggedIn = signal<boolean>(this.hasToken());

  /** Synchronous read of the JWT. Used by the interceptor. */
  getToken(): string | null {
    return localStorage.getItem(AuthService.TOKEN_KEY);
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
    localStorage.removeItem(AuthService.TOKEN_KEY);
    this.isLoggedIn.set(false);
    this.router.navigate(["/login"]);
  }

  private hasToken(): boolean {
    return !!localStorage.getItem(AuthService.TOKEN_KEY);
  }
}

import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, throwError } from "rxjs";

import { AuthService } from "./auth.service";

/**
 * Functional HTTP interceptor — runs for every request.
 *
 * Two responsibilities:
 *   1. Attach `Authorization: Bearer <token>` if we have one.
 *   2. If the server responds 401, auto-logout (token is stale).
 *
 * `/auth/login` is exempt from both: it has no token by definition,
 * and a 401 there means "wrong password" — not "token expired."
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // Heuristic: any URL containing /auth/ is an auth flow request.
  // Currently that's just /auth/login. If we later add /auth/refresh
  // or /auth/logout, they'll be handled too with no change here.
  const isAuthFlow = req.url.includes("/auth/");
  const token = auth.getToken();

  const outgoing =
    isAuthFlow || !token
      ? req
      : req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        });

  return next(outgoing).pipe(
    catchError((err) => {
      // Token rejected → log out so the UI returns to /login cleanly.
      // Skip for auth-flow requests so a wrong-password 401 doesn't
      // recursively trigger logout (we never logged in in the first place).
      if (err.status === 401 && !isAuthFlow) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};

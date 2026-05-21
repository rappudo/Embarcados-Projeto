import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { catchError, throwError } from "rxjs";
import { ToastController } from "@ionic/angular";

import { AuthService } from "./auth.service";

/**
 * Helper to decode the JWT and check its expiration proactively.
 */
function isTokenExpired(token: string): boolean {
  try {
    // JWTs are 3 parts separated by dots. The payload is the middle part.
    const payloadBase64 = token.split(".")[1];
    // Fix Base64Url encoding characters to standard Base64
    const base64 = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const decodedJson = atob(base64);
    const payload = JSON.parse(decodedJson);

    if (!payload.exp) return false;

    // Add a 10-second buffer to prevent race conditions
    const currentSeconds = Math.floor(Date.now() / 1000);
    return currentSeconds >= payload.exp - 10;
  } catch (e) {
    console.error("Failed to decode token", e);
    return true; // Treat malformed tokens as expired to be safe
  }
}

/**
 * Functional HTTP interceptor — runs for every request.
 *
 * Responsibilities:
 * 1. Attach `Authorization: Bearer <token>` if we have one.
 * 2. Proactively check if the token is expired before sending.
 * 3. If the server responds 401, auto-logout gracefully.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toastCtrl = inject(ToastController);

  const isAuthFlow = req.url.includes("/auth/");
  const token = auth.getToken();

  // 1. Proactive check: Don't even bother sending the request if we know it's dead.
  if (token && !isAuthFlow && isTokenExpired(token)) {
    toastCtrl
      .create({
        message: "Sua sessão expirou. Por favor, faça login novamente.",
        duration: 3500,
        color: "warning",
        position: "top",
      })
      .then((toast) => toast.present());

    auth.logout();
    return throwError(() => new Error("Local session expired"));
  }

  // 2. Attach token
  const outgoing =
    isAuthFlow || !token
      ? req
      : req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        });

  // 3. Reactive check: Just in case the backend rejects it for another reason
  return next(outgoing).pipe(
    catchError((err) => {
      if (err.status === 401 && !isAuthFlow) {
        toastCtrl
          .create({
            message: "Sua sessão expirou. Por favor, faça login novamente.",
            duration: 3500,
            color: "warning",
            position: "top",
          })
          .then((toast) => toast.present());

        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};

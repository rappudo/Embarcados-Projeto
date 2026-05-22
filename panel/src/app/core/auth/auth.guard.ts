import { CanActivateFn, Router } from "@angular/router";
import { inject } from "@angular/core";

import { AuthService } from "./auth.service";

/**
 * Functional guard — the modern Angular pattern (no class).
 *
 * Returning `true` lets the navigation proceed.
 * Returning a UrlTree triggers a redirect in one step.
 *
 * Attached to routes via `canActivate: [authGuard]`.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Use `isAuthenticated()` (not the cheap `isLoggedIn()` signal) so an
  // expired-but-still-stored token doesn't sneak the user past the guard.
  if (auth.isAuthenticated()) {
    return true;
  }

  // Not logged in → redirect to /login. Returning a UrlTree is
  // preferred over `router.navigate()` because it composes with the
  // router's URL state in one atomic step.
  return router.createUrlTree(["/login"]);
};

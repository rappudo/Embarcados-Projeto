import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';

import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

/**
 * Functional guards are plain functions, but they call `inject()` so
 * they must run inside an injection context. `TestBed.runInInjectionContext`
 * provides that context.
 */
function runGuard(): boolean | UrlTree {
  return TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  ) as boolean | UrlTree;
}

describe('authGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns true when AuthService.isAuthenticated() is true', () => {
    spyOn(TestBed.inject(AuthService), 'isAuthenticated').and.returnValue(true);
    expect(runGuard()).toBeTrue();
  });

  it('returns a UrlTree for /login when not authenticated', () => {
    spyOn(TestBed.inject(AuthService), 'isAuthenticated').and.returnValue(false);
    const router = TestBed.inject(Router);
    const expected = router.createUrlTree(['/login']);

    const result = runGuard();
    expect(result instanceof UrlTree).toBeTrue();
    expect(result.toString()).toBe(expected.toString());
  });

  it('uses isAuthenticated (proactive expiry check), not the cheap signal', () => {
    // Pre-populate localStorage with a token whose `exp` is in the
    // past. `isLoggedIn()` would return true (token present), but
    // `isAuthenticated()` must return false — the guard must follow
    // the stricter path.
    const past = Math.floor(Date.now() / 1000) - 600;
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ sub: 1, email: 'x', exp: past }));
    localStorage.setItem('facegate.jwt', `${header}.${payload}.sig`);

    const auth = TestBed.inject(AuthService);
    expect(auth.isLoggedIn()).toBeTrue();   // cheap check: token exists
    expect(auth.isAuthenticated()).toBeFalse(); // strict check: expired

    expect(runGuard() instanceof UrlTree).toBeTrue();
  });
});


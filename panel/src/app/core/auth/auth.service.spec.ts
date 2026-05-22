import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';

import { AuthService } from './auth.service';
import { API_BASE_URL } from '../api/api.config';

/**
 * Builds a fake JWT (header.payload.sig) whose payload encodes the given
 * `exp` (unix seconds). Signature is unverified client-side so any blob
 * works. Used to exercise expiry logic without minting a real token.
 */
function fakeJwt(exp: number, sub = 1, email = 'a@b.c'): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub, email, exp }));
  return `${header}.${payload}.signature`;
}

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // Each test runs against a clean localStorage so signal init doesn't
    // pick up state from a previous test.
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts logged out when localStorage is empty', () => {
    expect(service.isLoggedIn()).toBeFalse();
    expect(service.getToken()).toBeNull();
  });

  it('login stores the token and flips the signal', () => {
    service.login('admin@facegate.local', 'admin123').subscribe();

    const req = httpMock.expectOne(`${API_BASE_URL}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      email: 'admin@facegate.local',
      password: 'admin123',
    });
    req.flush({ token: 'jwt-token-value' });

    expect(service.getToken()).toBe('jwt-token-value');
    expect(service.isLoggedIn()).toBeTrue();
  });

  it('login error does NOT touch localStorage or the signal', () => {
    service.login('admin@facegate.local', 'wrong').subscribe({
      error: () => {
        /* swallow — tested via state below */
      },
    });
    const req = httpMock.expectOne(`${API_BASE_URL}/auth/login`);
    req.flush('invalid credentials', { status: 401, statusText: 'Unauthorized' });

    expect(service.getToken()).toBeNull();
    expect(service.isLoggedIn()).toBeFalse();
  });

  it('logout wipes the token, flips the signal, and navigates to /login', () => {
    // Seed a session first.
    localStorage.setItem('facegate.jwt', 'something');
    // Re-inject so the signal picks up the seeded token.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    service = TestBed.inject(AuthService);
    expect(service.isLoggedIn()).toBeTrue();

    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    service.logout();

    expect(localStorage.getItem('facegate.jwt')).toBeNull();
    expect(service.isLoggedIn()).toBeFalse();
    expect(navSpy).toHaveBeenCalledWith(['/login']);
  });

  it('isAuthenticated returns false when no token is stored', () => {
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('isAuthenticated returns false for malformed token', () => {
    localStorage.setItem('facegate.jwt', 'not-a-jwt');
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('isAuthenticated returns true for an unexpired token', () => {
    // 1 hour into the future.
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem('facegate.jwt', fakeJwt(exp));
    expect(service.isAuthenticated()).toBeTrue();
  });

  it('isAuthenticated returns false AND clears the token when expired', () => {
    // 10 minutes in the past.
    const exp = Math.floor(Date.now() / 1000) - 600;
    localStorage.setItem('facegate.jwt', fakeJwt(exp));

    expect(service.isAuthenticated()).toBeFalse();
    // Stale token must be evicted so the signal stays honest.
    expect(localStorage.getItem('facegate.jwt')).toBeNull();
  });
});

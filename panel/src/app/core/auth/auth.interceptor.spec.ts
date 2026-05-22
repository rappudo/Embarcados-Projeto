import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const FUTURE_EXP = () => Math.floor(Date.now() / 1000) + 3600;
const PAST_EXP = () => Math.floor(Date.now() / 1000) - 600;

function fakeJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: 1, email: 'x@y.z', exp }));
  return `${header}.${payload}.signature`;
}

/** Some calls (the toast) are async-creation; we don't need to assert on
 * them, but we DO need to stop them from leaving promises floating
 * around and confusing afterEach. Stub the toast controller to a no-op. */
function noopToastCtrl(): Partial<ToastController> {
  return {
    create: () =>
      Promise.resolve({
        present: () => Promise.resolve(),
      } as any),
  };
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        provideIonicAngular(),
        { provide: ToastController, useValue: noopToastCtrl() },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches Authorization: Bearer for protected requests', () => {
    localStorage.setItem('facegate.jwt', fakeJwt(FUTURE_EXP()));

    http.get('/employees').subscribe();

    const req = httpMock.expectOne('/employees');
    expect(req.request.headers.get('Authorization')).toBe(
      `Bearer ${localStorage.getItem('facegate.jwt')}`,
    );
    req.flush([]);
  });

  it('does NOT attach Authorization on /auth/* requests', () => {
    // Even with a token present, login should never re-send it.
    localStorage.setItem('facegate.jwt', fakeJwt(FUTURE_EXP()));

    http.post('http://api/auth/login', {}).subscribe();

    const req = httpMock.expectOne('http://api/auth/login');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ token: 'new' });
  });

  it('does not attach a header when no token is stored', () => {
    http.get('/employees').subscribe({
      error: () => {
        /* expected once the backend would 401 */
      },
    });
    const req = httpMock.expectOne('/employees');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush([]);
  });

  it('expired token short-circuits the request and triggers logout', (done) => {
    localStorage.setItem('facegate.jwt', fakeJwt(PAST_EXP()));
    const logoutSpy = spyOn(auth, 'logout').and.callThrough();

    http.get('/employees').subscribe({
      next: () => fail('request must not be sent when token is locally expired'),
      error: (err) => {
        expect(err.message).toContain('Local session expired');
        expect(logoutSpy).toHaveBeenCalled();
        done();
      },
    });

    // No HTTP request must have been issued — the interceptor threw before next().
    httpMock.expectNone('/employees');
  });

  it('backend 401 on a protected request triggers logout', () => {
    localStorage.setItem('facegate.jwt', fakeJwt(FUTURE_EXP()));
    const logoutSpy = spyOn(auth, 'logout').and.callThrough();

    http.get('/employees').subscribe({
      error: () => {
        /* expected */
      },
    });

    const req = httpMock.expectOne('/employees');
    req.flush('expired', { status: 401, statusText: 'Unauthorized' });

    expect(logoutSpy).toHaveBeenCalled();
  });

  it('backend 401 on the LOGIN endpoint does NOT trigger logout', () => {
    // Login itself returning 401 (wrong credentials) is a UI concern,
    // not an auth-session failure. The interceptor must not redirect.
    const logoutSpy = spyOn(auth, 'logout').and.callThrough();

    http.post('http://api/auth/login', { email: 'x', password: 'y' }).subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('http://api/auth/login');
    req.flush('invalid', { status: 401, statusText: 'Unauthorized' });

    expect(logoutSpy).not.toHaveBeenCalled();
  });
});

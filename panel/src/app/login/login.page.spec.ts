import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { LoginPage } from './login.page';
import { API_BASE_URL } from '../core/api/api.config';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('successful login navigates to /dashboard and clears password', () => {
    const navSpy = spyOn(router, 'navigateByUrl').and.returnValue(
      Promise.resolve(true),
    );

    component.email = '  admin@facegate.local  '; // intentionally with whitespace
    component.password = 'admin123';
    component.submitLogin();

    const req = httpMock.expectOne(`${API_BASE_URL}/auth/login`);
    // The page is supposed to .trim() the email before sending.
    expect(req.request.body).toEqual({
      email: 'admin@facegate.local',
      password: 'admin123',
    });
    req.flush({ token: 'jwt' });

    expect(navSpy).toHaveBeenCalledWith('/dashboard');
    expect(component.password).toBe(''); // never leave the password in memory
    expect(component.loading).toBeFalse();
  });

  it('401 from the server sets the Portuguese credentials error', () => {
    component.email = 'admin@facegate.local';
    component.password = 'wrong';
    component.submitLogin();

    httpMock
      .expectOne(`${API_BASE_URL}/auth/login`)
      .flush('invalid', { status: 401, statusText: 'Unauthorized' });

    expect(component.errorMessage).toBe('E-mail ou senha inválidos.');
    expect(component.loading).toBeFalse();
  });

  it('network error (status 0) sets the connectivity error', () => {
    component.email = 'admin@facegate.local';
    component.password = 'x';
    component.submitLogin();

    // Status 0 — browser blocked / DNS / TCP refused.
    httpMock
      .expectOne(`${API_BASE_URL}/auth/login`)
      .error(new ProgressEvent('Network'), { status: 0, statusText: '' });

    expect(component.errorMessage).toBe('Não foi possível conectar ao servidor.');
    expect(component.loading).toBeFalse();
  });

  it('other backend errors fall back to a generic message', () => {
    component.email = 'admin@facegate.local';
    component.password = 'x';
    component.submitLogin();

    httpMock
      .expectOne(`${API_BASE_URL}/auth/login`)
      .flush('boom', { status: 500, statusText: 'Internal Server Error' });

    expect(component.errorMessage).toBe('Erro ao fazer login. Tente novamente.');
    expect(component.loading).toBeFalse();
  });

  it('double-submit is ignored while a request is already in flight', fakeAsync(() => {
    // Stub navigation so the success path doesn't try to actually
    // resolve a /dashboard route (it isn't registered in this TestBed).
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));

    component.email = 'admin@facegate.local';
    component.password = 'admin123';

    component.submitLogin();   // first call — fires the request
    component.submitLogin();   // second call — must be no-op

    // Exactly one outbound request: prove the guard short-circuited the
    // second submit instead of firing a duplicate.
    const reqs = httpMock.match(`${API_BASE_URL}/auth/login`);
    expect(reqs.length).toBe(1);
    reqs[0].flush({ token: 'jwt' });
    tick();
  }));

  it('errorMessage is cleared at the start of a new submit', () => {
    component.errorMessage = 'leftover';
    component.email = 'admin@facegate.local';
    component.password = 'admin123';
    component.submitLogin();

    expect(component.errorMessage).toBe(''); // cleared synchronously

    httpMock.expectOne(`${API_BASE_URL}/auth/login`).flush({ token: 'jwt' });
  });
});

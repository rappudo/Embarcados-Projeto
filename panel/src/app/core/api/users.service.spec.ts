import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { UsersService } from './users.service';
import { API_BASE_URL } from './api.config';

describe('UsersService', () => {
  let service: UsersService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UsersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() GETs /users', () => {
    let received: unknown;
    service.list().subscribe((r) => (received = r));
    const req = httpMock.expectOne(`${API_BASE_URL}/users`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, email: 'admin@facegate.local', created_at: '' }]);
    expect(received).toBeDefined();
  });

  it('create() POSTs the DTO to /users', () => {
    service.create({ email: 'op@x.io', password: 'secret123' }).subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/users`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'op@x.io', password: 'secret123' });
    req.flush({ id: 2, email: 'op@x.io', created_at: '' });
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { EventsService } from './events.service';
import { API_BASE_URL } from './api.config';

describe('EventsService', () => {
  let service: EventsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EventsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() with no filters hits /analytics/events with no params', () => {
    service.list().subscribe();
    const req = httpMock.expectOne(
      (r) => r.url === `${API_BASE_URL}/analytics/events`,
    );
    expect(req.request.params.keys().length).toBe(0);
    req.flush([]);
  });

  it('list() includes only the provided filter keys (omits undefined)', () => {
    service.list({ employee_id: 7, status: 'granted' }).subscribe();
    const req = httpMock.expectOne(
      (r) => r.url === `${API_BASE_URL}/analytics/events`,
    );
    expect(req.request.params.get('employee_id')).toBe('7');
    expect(req.request.params.get('status')).toBe('granted');
    expect(req.request.params.has('from')).toBeFalse();
    expect(req.request.params.has('to')).toBeFalse();
    expect(req.request.params.has('limit')).toBeFalse();
    expect(req.request.params.has('offset')).toBeFalse();
    req.flush([]);
  });

  it('list() forwards from/to/limit/offset as strings', () => {
    service
      .list({ from: 1000, to: 2000, limit: 50, offset: 10 })
      .subscribe();
    const req = httpMock.expectOne(
      (r) => r.url === `${API_BASE_URL}/analytics/events`,
    );
    expect(req.request.params.get('from')).toBe('1000');
    expect(req.request.params.get('to')).toBe('2000');
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.params.get('offset')).toBe('10');
    req.flush([]);
  });
});

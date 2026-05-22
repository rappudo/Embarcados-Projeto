import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { AnalyticsService } from './analytics.service';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiBaseUrl}/analytics`;

/**
 * This is the legacy AnalyticsService — the one wired into the routed
 * DashboardPage and other in-use pages. It's distinct from
 * `core/api/analytics.service.ts`, which is the parallel "next-gen"
 * implementation. We keep both tested while the migration finishes.
 */
describe('AnalyticsService (legacy)', () => {
  let service: AnalyticsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('accessByHour() GETs /access-by-hour', () => {
    service.accessByHour().subscribe();
    const req = httpMock.expectOne(`${BASE}/access-by-hour`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('avgDelay() GETs /avg-delay', () => {
    service.avgDelay().subscribe();
    const req = httpMock.expectOne(`${BASE}/avg-delay`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('presenceHeatmap() GETs /presence-heatmap', () => {
    service.presenceHeatmap().subscribe();
    const req = httpMock.expectOne(`${BASE}/presence-heatmap`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('summaryToday() GETs /summary-today', () => {
    service.summaryToday().subscribe();
    const req = httpMock.expectOne(`${BASE}/summary-today`);
    expect(req.request.method).toBe('GET');
    req.flush({ total: 0, granted: 0, unknown: 0 });
  });

  it('presentToday() GETs /present-today', () => {
    service.presentToday().subscribe();
    const req = httpMock.expectOne(`${BASE}/present-today`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('events() with no filter sends no query params', () => {
    service.events().subscribe();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/events`);
    expect(req.request.params.keys().length).toBe(0);
    req.flush([]);
  });

  it('events() forwards each supplied filter as its own param', () => {
    service
      .events({
        employee_id: 7,
        status: 'granted',
        from: 1000,
        to: 2000,
        limit: 50,
        offset: 10,
      })
      .subscribe();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/events`);
    expect(req.request.params.get('employee_id')).toBe('7');
    expect(req.request.params.get('status')).toBe('granted');
    expect(req.request.params.get('from')).toBe('1000');
    expect(req.request.params.get('to')).toBe('2000');
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.params.get('offset')).toBe('10');
    req.flush([]);
  });

  it('events() omits undefined filter keys instead of emitting empty values', () => {
    // The backend rejects `?employee_id=` (empty string) on the typed
    // i32 deserializer. Pinning the "only include what was provided"
    // behavior here protects against a future refactor that would send
    // empty values.
    service.events({ status: 'unknown' }).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/events`);
    expect(req.request.params.get('status')).toBe('unknown');
    expect(req.request.params.has('employee_id')).toBeFalse();
    expect(req.request.params.has('from')).toBeFalse();
    expect(req.request.params.has('to')).toBeFalse();
    expect(req.request.params.has('limit')).toBeFalse();
    expect(req.request.params.has('offset')).toBeFalse();
    req.flush([]);
  });
});

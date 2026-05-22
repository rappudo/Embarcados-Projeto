import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { AnalyticsService } from './analytics.service';
import { API_BASE_URL } from './api.config';

describe('AnalyticsService', () => {
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

  it('accessByHour() GETs /analytics/access-by-hour', () => {
    service.accessByHour().subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/analytics/access-by-hour`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('summaryToday() GETs /analytics/summary-today', () => {
    service.summaryToday().subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/analytics/summary-today`);
    expect(req.request.method).toBe('GET');
    req.flush({ total: 0, granted: 0, unknown: 0 });
  });

  it('avgDelay() GETs /analytics/avg-delay', () => {
    service.avgDelay().subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/analytics/avg-delay`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('presenceHeatmap() GETs /analytics/presence-heatmap', () => {
    service.presenceHeatmap().subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/analytics/presence-heatmap`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});

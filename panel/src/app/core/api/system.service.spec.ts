import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { SystemService } from './system.service';
import { API_BASE_URL } from './api.config';

describe('SystemService', () => {
  let service: SystemService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SystemService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('health() requests /health as plain text', () => {
    // /health returns the string "ok" (not JSON). If the service ever
    // forgets `responseType: 'text'` the HttpClient throws a parse
    // error before the caller sees the body — this test pins the
    // contract.
    let received: string | undefined;
    service.health().subscribe((s) => (received = s));
    const req = httpMock.expectOne(`${API_BASE_URL}/health`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('text');
    req.flush('ok');
    expect(received).toBe('ok');
  });

  it('mqttStatus() GETs /system/mqtt-status', () => {
    let received: unknown;
    service.mqttStatus().subscribe((r) => (received = r));
    const req = httpMock.expectOne(`${API_BASE_URL}/system/mqtt-status`);
    expect(req.request.method).toBe('GET');
    req.flush({ connected: true, last_message_at_ms: 1700000000000 });
    expect(received).toEqual({ connected: true, last_message_at_ms: 1700000000000 });
  });
});

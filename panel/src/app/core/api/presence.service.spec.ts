import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { PresenceService } from './presence.service';
import { API_BASE_URL } from './api.config';

describe('PresenceService', () => {
  let service: PresenceService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PresenceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() GETs /analytics/present-today', () => {
    let received: unknown;
    service.list().subscribe((r) => (received = r));
    const req = httpMock.expectOne(`${API_BASE_URL}/analytics/present-today`);
    expect(req.request.method).toBe('GET');
    req.flush([{ employee_id: 1, name: 'Alice', last_entry_ms: 1700000000000 }]);
    expect(received).toBeDefined();
  });
});

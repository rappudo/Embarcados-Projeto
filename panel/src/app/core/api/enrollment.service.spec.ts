import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { EnrollmentService } from './enrollment.service';
import { API_BASE_URL } from './api.config';

describe('EnrollmentService', () => {
  let service: EnrollmentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EnrollmentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('enrollVector() POSTs the vector as a number[] to /employees/:id/embeddings', () => {
    // The backend's Deserialize accepts `Vec<f32>`. The service converts
    // the Float32Array to a plain number[] via Array.from — pinning that
    // conversion ensures we don't accidentally send `{}` or a typed array
    // representation the server can't parse.
    const vec = new Float32Array(512);
    for (let i = 0; i < 512; i++) vec[i] = i * 0.001;

    service.enrollVector(42, vec).subscribe();

    const req = httpMock.expectOne(`${API_BASE_URL}/employees/42/embeddings`);
    expect(req.request.method).toBe('POST');
    expect(Array.isArray(req.request.body.vector)).toBeTrue();
    expect(req.request.body.vector.length).toBe(512);
    expect(req.request.body.vector[0]).toBe(0);
    expect(req.request.body.vector[10]).toBeCloseTo(0.01, 6);
    req.flush({ id: 1, vector: Array.from(vec), created_at: '' });
  });
});

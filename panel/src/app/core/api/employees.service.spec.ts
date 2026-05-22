import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { EmployeesService } from './employees.service';
import { API_BASE_URL } from './api.config';
import { Employee } from '../models/employee.model';

const FAKE_EMP: Employee = {
  id: 1,
  name: 'Alice',
  shift: 'manhã',
  created_at: '2026-05-21T12:00:00Z',
};

describe('EmployeesService (core/api)', () => {
  let service: EmployeesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EmployeesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() GETs /employees and returns the array', () => {
    let received: Employee[] | undefined;
    service.list().subscribe((rows) => (received = rows));

    const req = httpMock.expectOne(`${API_BASE_URL}/employees`);
    expect(req.request.method).toBe('GET');
    req.flush([FAKE_EMP]);

    expect(received).toEqual([FAKE_EMP]);
  });

  it('get(id) GETs /employees/:id', () => {
    service.get(42).subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/employees/42`);
    expect(req.request.method).toBe('GET');
    req.flush(FAKE_EMP);
  });

  it('create() POSTs the DTO to /employees', () => {
    service.create({ name: 'Bob', shift: 'tarde' }).subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/employees`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Bob', shift: 'tarde' });
    req.flush({ ...FAKE_EMP, name: 'Bob', shift: 'tarde' });
  });

  it('update() PATCHes /employees/:id with the partial DTO', () => {
    service.update(7, { name: 'Renamed' }).subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/employees/7`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Renamed' });
    req.flush({ ...FAKE_EMP, id: 7, name: 'Renamed' });
  });

  it('delete() DELETEs /employees/:id', () => {
    service.delete(7).subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/employees/7`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});

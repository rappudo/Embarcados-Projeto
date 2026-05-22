import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { EmployeeDto, EmployeesService } from './employees.service';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiBaseUrl}/employees`;
const DTO: EmployeeDto = {
  id: 1,
  name: 'Alice',
  shift: 'manhã',
  created_at: '2026-05-21T12:34:56Z',
};

/**
 * This service exists to translate between the backend's English DTO and
 * the Portuguese-named domain model used by Ionic pages (`Funcionario`).
 * The mapping has subtle rules (shift display-case, date slicing,
 * trim+lowercase on write) — these tests exercise them.
 */
describe('EmployeesService (legacy)', () => {
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

  it('list() maps EmployeeDto → Funcionario (shift display-case + sliced date)', () => {
    let received: any[] = [];
    service.list().subscribe((rows) => (received = rows));

    const req = httpMock.expectOne(BASE);
    req.flush([DTO]);

    expect(received).toEqual([
      {
        id: 1,
        nome: 'Alice',
        turno: 'Manhã',                  // 'manhã' (DB) → 'Manhã' (display)
        dataIngresso: '2026-05-21',      // ISO sliced to YYYY-MM-DD
        registros: [],
      },
    ]);
  });

  it('list() handles null shift as empty turno (not the string "null")', () => {
    let received: any[] = [];
    service.list().subscribe((rows) => (received = rows));

    httpMock.expectOne(BASE).flush([{ ...DTO, shift: null }]);

    expect(received[0].turno).toBe('');
  });

  it('list() preserves unknown shift verbatim (no display mapping)', () => {
    let received: any[] = [];
    service.list().subscribe((rows) => (received = rows));

    httpMock.expectOne(BASE).flush([{ ...DTO, shift: 'flexible' }]);

    expect(received[0].turno).toBe('flexible');
  });

  it('create() converts turno → lowercase trimmed shift for the DB', () => {
    let received: any | undefined;
    service.create({ nome: 'Bob', turno: '  Tarde  ' }).subscribe((r) => (received = r));

    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Bob', shift: 'tarde' });
    req.flush({ ...DTO, name: 'Bob', shift: 'tarde' });

    expect(received.nome).toBe('Bob');
    expect(received.turno).toBe('Tarde');
  });

  it('create() with null turno sends shift: null', () => {
    service.create({ nome: 'Carol', turno: null }).subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.body).toEqual({ name: 'Carol', shift: null });
    req.flush({ ...DTO, name: 'Carol', shift: null });
  });

  it('create() with whitespace-only turno collapses to null', () => {
    service.create({ nome: 'Dan', turno: '   ' }).subscribe();
    const req = httpMock.expectOne(BASE);
    expect(req.request.body).toEqual({ name: 'Dan', shift: null });
    req.flush({ ...DTO, name: 'Dan', shift: null });
  });

  it('update() only sends keys the caller supplied (partial PATCH)', () => {
    service.update(5, { nome: 'New Name' }).subscribe();
    const req = httpMock.expectOne(`${BASE}/5`);
    expect(req.request.method).toBe('PATCH');
    // Note: turno was NOT provided → must NOT appear in the body, so
    // the backend leaves it alone.
    expect(req.request.body).toEqual({ name: 'New Name' });
    req.flush({ ...DTO, id: 5, name: 'New Name' });
  });

  it('update() sends shift: null when turno is explicitly null (clear)', () => {
    service.update(5, { turno: null }).subscribe();
    const req = httpMock.expectOne(`${BASE}/5`);
    expect(req.request.body).toEqual({ shift: null });
    req.flush({ ...DTO, id: 5, shift: null });
  });

  it('delete() DELETEs /employees/:id', () => {
    service.delete(9).subscribe();
    const req = httpMock.expectOne(`${BASE}/9`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});

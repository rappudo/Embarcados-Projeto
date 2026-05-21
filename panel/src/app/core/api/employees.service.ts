import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

import { API_BASE_URL } from "./api.config";
import {
  CreateEmployeeDto,
  Employee,
  UpdateEmployeeDto,
} from "../models/employee.model";

/**
 * EmployeesService — wraps the backend /employees endpoints.
 *
 * Pattern:
 *   - One method per endpoint, returning the parsed response as Observable.
 *   - No try/catch here; HTTP errors propagate as Observable errors,
 *     which the auth interceptor sees first (it auto-logs-out on 401).
 *     Component-level errors are handled in `.subscribe({ error: ... })`.
 *   - The auth interceptor attaches `Authorization: Bearer <token>`
 *     automatically — this service doesn't know auth exists.
 */
@Injectable({ providedIn: "root" })
export class EmployeesService {
  private http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/employees`;

  /** GET /employees — list all, ordered by name (backend handles sort) */
  list(): Observable<Employee[]> {
    return this.http.get<Employee[]>(this.base);
  }

  /** GET /employees/:id */
  get(id: number): Observable<Employee> {
    return this.http.get<Employee>(`${this.base}/${id}`);
  }

  /** POST /employees */
  create(dto: CreateEmployeeDto): Observable<Employee> {
    return this.http.post<Employee>(this.base, dto);
  }

  /** PATCH /employees/:id — partial update (any subset of fields) */
  update(id: number, dto: UpdateEmployeeDto): Observable<Employee> {
    return this.http.patch<Employee>(`${this.base}/${id}`, dto);
  }

  /** DELETE /employees/:id — backend cascades embeddings, sets event FK to NULL */
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}

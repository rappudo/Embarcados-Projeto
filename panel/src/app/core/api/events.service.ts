import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";

import { API_BASE_URL } from "./api.config";
import { AccessEvent, EventsQuery } from "../models/event.model";

/**
 * EventsService — wraps the backend /analytics/events endpoint.
 *
 * Note on HttpParams:
 *   We build query parameters conditionally — only include a key if the
 *   caller actually provided a value. Adding `?employee_id=` (empty)
 *   would fail server-side deserialization. HttpParams is immutable;
 *   each .set() returns a new instance, which is why we reassign.
 */
@Injectable({ providedIn: "root" })
export class EventsService {
  private http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/analytics`;

  list(query: EventsQuery = {}): Observable<AccessEvent[]> {
    let params = new HttpParams();
    if (query.employee_id != null)
      params = params.set("employee_id", query.employee_id);
    if (query.status != null) params = params.set("status", query.status);
    if (query.from != null) params = params.set("from", query.from);
    if (query.to != null) params = params.set("to", query.to);
    if (query.limit != null) params = params.set("limit", query.limit);
    if (query.offset != null) params = params.set("offset", query.offset);

    return this.http.get<AccessEvent[]>(`${this.base}/events`, { params });
  }
}

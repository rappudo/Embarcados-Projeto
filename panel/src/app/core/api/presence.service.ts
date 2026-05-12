import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

import { API_BASE_URL } from "./api.config";
import { PresentEmployee } from "../models/presence.model";

/**
 * PresenceService — wraps `/analytics/present-today`.
 *
 * The dashboard's "Pessoas presentes" card calls list(); the count is
 * `.length`. We expose the full list (not just the count) so a future
 * drawer or detail view can show *who* is present without a second
 * round-trip.
 */
@Injectable({ providedIn: "root" })
export class PresenceService {
  private http = inject(HttpClient);

  list(): Observable<PresentEmployee[]> {
    return this.http.get<PresentEmployee[]>(
      `${API_BASE_URL}/analytics/present-today`,
    );
  }
}

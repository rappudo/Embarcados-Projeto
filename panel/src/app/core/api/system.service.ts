import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

import { API_BASE_URL } from "./api.config";
import { MqttStatus } from "../models/system.model";

/**
 * SystemService — wraps the small set of "is the system alive?" endpoints
 * surfaced on the settings page.
 *
 * `health()` returns plain text "ok" rather than JSON; we expose it as
 * `responseType: 'text'` so the caller doesn't trip over a parse error.
 */
@Injectable({ providedIn: "root" })
export class SystemService {
  private http = inject(HttpClient);

  /** GET /health — public, no auth header attached (interceptor skips /auth/, but /health is open too). */
  health(): Observable<string> {
    return this.http.get(`${API_BASE_URL}/health`, { responseType: "text" });
  }

  /** GET /system/mqtt-status — protected. Returns broker connection snapshot. */
  mqttStatus(): Observable<MqttStatus> {
    return this.http.get<MqttStatus>(`${API_BASE_URL}/system/mqtt-status`);
  }
}

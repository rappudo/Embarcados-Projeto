import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

import { API_BASE_URL } from "./api.config";
import {
  AvgDelay,
  HeatmapCell,
  HourCount,
  SummaryToday,
} from "../models/analytics.model";

/**
 * AnalyticsService — wraps /analytics/* endpoints EXCEPT /events
 * (which has its own dedicated service because events are treated
 * as a first-class entity, not analytics).
 *
 * Dashboard (5.4) uses summaryToday + accessByHour.
 * Analytics page (5.5) will use avgDelay + presenceHeatmap.
 */
@Injectable({ providedIn: "root" })
export class AnalyticsService {
  private http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/analytics`;

  /** 24-element array — one entry per hour 0..23, zero-filled. */
  accessByHour(): Observable<HourCount[]> {
    return this.http.get<HourCount[]>(`${this.base}/access-by-hour`);
  }

  /** Today's 3 summary numbers (total, granted, unknown). */
  summaryToday(): Observable<SummaryToday> {
    return this.http.get<SummaryToday>(`${this.base}/summary-today`);
  }

  /** Per-employee tardiness — used by analytics page (5.5). */
  avgDelay(): Observable<AvgDelay[]> {
    return this.http.get<AvgDelay[]>(`${this.base}/avg-delay`);
  }

  /** Sparse (day, hour, count) grid for heatmap — used by 5.5. */
  presenceHeatmap(): Observable<HeatmapCell[]> {
    return this.http.get<HeatmapCell[]>(`${this.base}/presence-heatmap`);
  }
}

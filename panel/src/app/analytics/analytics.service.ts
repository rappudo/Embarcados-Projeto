import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface HourCount {
  hour: number;
  count: number;
}

export interface EventRow {
  id: number;
  employee_name: string | null;
  status: 'granted' | 'unknown';
  distance: number | null;
  timestamp_ms: number;
}

export interface AvgDelay {
  employee_id: number;
  name: string;
  avg_delay_minutes: number;
  days_observed: number;
}

export interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

export interface SummaryToday {
  total: number;
  granted: number;
  unknown: number;
}

export interface PresentEmployee {
  employee_id: number;
  name: string;
  last_entry_ms: number;
}

export interface EventsQuery {
  employee_id?: number;
  status?: 'granted' | 'unknown';
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/analytics`;

  accessByHour(): Observable<HourCount[]> {
    return this.http.get<HourCount[]>(`${this.base}/access-by-hour`);
  }

  events(q: EventsQuery = {}): Observable<EventRow[]> {
    let params = new HttpParams();
    if (q.employee_id !== undefined) params = params.set('employee_id', q.employee_id);
    if (q.status !== undefined) params = params.set('status', q.status);
    if (q.from !== undefined) params = params.set('from', q.from);
    if (q.to !== undefined) params = params.set('to', q.to);
    if (q.limit !== undefined) params = params.set('limit', q.limit);
    if (q.offset !== undefined) params = params.set('offset', q.offset);
    return this.http.get<EventRow[]>(`${this.base}/events`, { params });
  }

  avgDelay(): Observable<AvgDelay[]> {
    return this.http.get<AvgDelay[]>(`${this.base}/avg-delay`);
  }

  presenceHeatmap(): Observable<HeatmapCell[]> {
    return this.http.get<HeatmapCell[]>(`${this.base}/presence-heatmap`);
  }

  summaryToday(): Observable<SummaryToday> {
    return this.http.get<SummaryToday>(`${this.base}/summary-today`);
  }

  presentToday(): Observable<PresentEmployee[]> {
    return this.http.get<PresentEmployee[]>(`${this.base}/present-today`);
  }
}

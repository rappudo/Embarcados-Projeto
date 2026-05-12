/**
 * Row returned by GET /analytics/events.
 * Mirrors `EventRow` in `backend/src/routes/analytics.rs`.
 */
export interface AccessEvent {
  id: number;
  employee_name: string | null; // null for unknown faces or deleted employees
  status: AccessStatus;
  distance: number | null;
  timestamp_ms: number;
}

export type AccessStatus = "granted" | "unknown";

/** Optional query params for GET /analytics/events */
export interface EventsQuery {
  employee_id?: number;
  status?: AccessStatus;
  from?: number; // unix ms
  to?: number; // unix ms
  limit?: number;
  offset?: number;
}

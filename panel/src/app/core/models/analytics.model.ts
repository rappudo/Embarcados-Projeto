export interface HourCount {
  hour:  number;
  count: number;
}

export interface AvgDelay {
  employee_id:       number;
  name:              string;
  avg_delay_minutes: number;
  days_observed:     number;
}

export interface HeatmapCell {
  day:   number;
  hour:  number;
  count: number;
}

export interface SummaryToday {
  total:   number;
  granted: number;
  unknown: number;
}

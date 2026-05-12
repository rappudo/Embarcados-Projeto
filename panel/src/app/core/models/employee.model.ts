export interface Employee {
  id:         number;
  name:       string;
  shift:      Shift | null;
  created_at: string;
}

export type Shift = 'manhã' | 'tarde' | 'noite';

export interface CreateEmployeeDto {
  name:   string;
  shift?: Shift | null;
}

export interface UpdateEmployeeDto {
  name?:  string;
  shift?: Shift;
}

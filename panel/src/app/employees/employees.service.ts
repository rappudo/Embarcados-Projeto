import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface EmployeeDto {
  id: number;
  name: string;
  shift: string | null;
  created_at: string;
}

export interface Registro {
  data: string;
  entrada: string;
  saidas: string[];
}

export interface Funcionario {
  id: number;
  nome: string;
  turno: string;
  dataIngresso: string;
  idade?: number;
  registros: Registro[];
}

const TURNO_DISPLAY: Record<string, string> = {
  'manhã': 'Manhã',
  'tarde': 'Tarde',
  'noite': 'Noite',
};

function toFuncionario(dto: EmployeeDto): Funcionario {
  const shiftLower = dto.shift?.toLowerCase() ?? '';
  return {
    id: dto.id,
    nome: dto.name,
    turno: shiftLower ? (TURNO_DISPLAY[shiftLower] ?? dto.shift!) : '',
    dataIngresso: dto.created_at ? dto.created_at.slice(0, 10) : '',
    registros: [],
  };
}

function toShiftDb(turno: string | null | undefined): string | null {
  if (turno === null || turno === undefined) return null;
  const trimmed = turno.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

@Injectable({ providedIn: 'root' })
export class EmployeesService {
  private http = inject(HttpClient);
  private base = `${environment.apiBaseUrl}/employees`;

  list(): Observable<Funcionario[]> {
    return this.http
      .get<EmployeeDto[]>(this.base)
      .pipe(map((rows) => rows.map(toFuncionario)));
  }

  get(id: number): Observable<Funcionario> {
    return this.http.get<EmployeeDto>(`${this.base}/${id}`).pipe(map(toFuncionario));
  }

  create(input: { nome: string; turno?: string | null }): Observable<Funcionario> {
    return this.http
      .post<EmployeeDto>(this.base, { name: input.nome, shift: toShiftDb(input.turno) })
      .pipe(map(toFuncionario));
  }

  update(
    id: number,
    input: { nome?: string; turno?: string | null },
  ): Observable<Funcionario> {
    const body: Record<string, unknown> = {};
    if (input.nome !== undefined) body['name'] = input.nome;
    if (input.turno !== undefined) body['shift'] = toShiftDb(input.turno);
    return this.http
      .patch<EmployeeDto>(`${this.base}/${id}`, body)
      .pipe(map(toFuncionario));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}

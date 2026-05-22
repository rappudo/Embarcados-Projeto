// DashboardPage data-flow tests.
//
// The page is large and view-heavy; we cover the *logic* (state wiring,
// derived data, filter rules, KPI computation) and skip the SVG pie
// drawing, CSV export blob handling, and Ionic modal/alert UX. Those
// are visual or DOM-side and need a different harness (E2E) to assert
// usefully.

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { of, throwError } from 'rxjs';

import { DashboardPage } from './dashboard.page';
import { EmployeesService, Funcionario } from '../employees/employees.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AuthService } from '../core/auth/auth.service';

const FUNCS: Funcionario[] = [
  { id: 1, nome: 'Alice',  turno: 'Manhã', dataIngresso: '2026-01-01', registros: [] },
  { id: 2, nome: 'Bob',    turno: 'Manhã', dataIngresso: '2026-01-02', registros: [] },
  { id: 3, nome: 'Carol',  turno: 'Tarde', dataIngresso: '2026-01-03', registros: [] },
  { id: 4, nome: 'Dave',   turno: 'Noite', dataIngresso: '2026-01-04', registros: [] },
];

/** Build a stub for the analytics service that emits the supplied
 * payloads from each method. Defaults to empty arrays/zero numbers
 * so individual tests only need to override what they care about. */
function makeAnalyticsStub(overrides: Partial<{
  accessByHour: any[];
  avgDelay: any[];
  presenceHeatmap: any[];
  events: any[];
}> = {}) {
  return {
    accessByHour: jasmine.createSpy('accessByHour')
      .and.returnValue(of(overrides.accessByHour ?? [])),
    avgDelay: jasmine.createSpy('avgDelay')
      .and.returnValue(of(overrides.avgDelay ?? [])),
    presenceHeatmap: jasmine.createSpy('presenceHeatmap')
      .and.returnValue(of(overrides.presenceHeatmap ?? [])),
    events: jasmine.createSpy('events')
      .and.returnValue(of(overrides.events ?? [])),
    summaryToday: jasmine.createSpy('summaryToday')
      .and.returnValue(of({ total: 0, granted: 0, unknown: 0 })),
    presentToday: jasmine.createSpy('presentToday')
      .and.returnValue(of([])),
  };
}

function makeEmployeesStub(rows: Funcionario[] = FUNCS) {
  return {
    list: jasmine.createSpy('list').and.returnValue(of(rows)),
    get: jasmine.createSpy('get'),
    create: jasmine.createSpy('create'),
    update: jasmine.createSpy('update'),
    delete: jasmine.createSpy('delete').and.returnValue(of(undefined)),
  };
}

describe('DashboardPage', () => {
  let component: DashboardPage;
  let fixture: ComponentFixture<DashboardPage>;
  let employeesStub: ReturnType<typeof makeEmployeesStub>;
  let analyticsStub: ReturnType<typeof makeAnalyticsStub>;

  function setup(
    employeesStubArg = makeEmployeesStub(),
    analyticsStubArg = makeAnalyticsStub(),
  ): void {
    employeesStub = employeesStubArg;
    analyticsStub = analyticsStubArg;

    TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideIonicAngular(),
        { provide: EmployeesService, useValue: employeesStub },
        { provide: AnalyticsService, useValue: analyticsStub },
      ],
    });

    fixture = TestBed.createComponent(DashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges(); // triggers ngOnInit
  }

  // ---------------------------------------------------------------
  // Initial wiring
  // ---------------------------------------------------------------

  it('loads funcionarios on init and populates the totals + distinct turnos', () => {
    setup();
    expect(employeesStub.list).toHaveBeenCalled();
    expect(component.funcionarios.length).toBe(4);
    expect(component.totalFuncionarios).toBe(4);
    // turnos: distinct, sorted, no empties.
    expect(component.turnos).toEqual(['Manhã', 'Noite', 'Tarde']);
  });

  it('computes distribuição por turno (counts + percentages)', () => {
    setup();
    // 2 Manhã, 1 Tarde, 1 Noite, total 4.
    const byTurno = new Map(component.distribuicaoTurno.map((d) => [d.turno, d]));
    expect(byTurno.get('Manhã')!.count).toBe(2);
    expect(byTurno.get('Manhã')!.pct).toBe(50);
    expect(byTurno.get('Tarde')!.count).toBe(1);
    expect(byTurno.get('Tarde')!.pct).toBe(25);
    expect(byTurno.get('Noite')!.count).toBe(1);
    expect(byTurno.get('Noite')!.pct).toBe(25);
  });

  it('maps accessByHour rows into zero-padded labels + computes max', () => {
    setup(makeEmployeesStub(), makeAnalyticsStub({
      accessByHour: [
        { hour: 0,  count: 0 },
        { hour: 8,  count: 5 },
        { hour: 17, count: 12 },
      ],
    }));
    expect(component.acessosPorHora).toEqual([
      { label: '00h', count: 0 },
      { label: '08h', count: 5 },
      { label: '17h', count: 12 },
    ]);
    expect(component.maxAcessosHora).toBe(12);
  });

  it('keeps maxAcessosHora >= 1 even when every hour is zero (avoids divide-by-zero in template scaling)', () => {
    setup(makeEmployeesStub(), makeAnalyticsStub({
      accessByHour: [{ hour: 9, count: 0 }],
    }));
    expect(component.maxAcessosHora).toBe(1);
  });

  it('counts atrasos above the 15-min tolerance and averages all rows', () => {
    setup(makeEmployeesStub(), makeAnalyticsStub({
      avgDelay: [
        { employee_id: 1, name: 'A', avg_delay_minutes: 5,  days_observed: 3 },
        { employee_id: 2, name: 'B', avg_delay_minutes: 20, days_observed: 3 },
        { employee_id: 3, name: 'C', avg_delay_minutes: 35, days_observed: 3 },
        // Negative = early. Counts toward the average but NOT as "atrasado".
        { employee_id: 4, name: 'D', avg_delay_minutes: -10, days_observed: 3 },
      ],
    }));
    // Two employees over 15 min (B=20, C=35).
    expect(component.totalAtrasos).toBe(2);
    // Average: (5 + 20 + 35 + -10) / 4 = 12.5 → rounded to 1 decimal = 12.5
    expect(component.atrasoMedioMin).toBe(12.5);
  });

  it('atrasoMedioMin is 0 when avgDelay returns an empty array (avoids NaN)', () => {
    setup();
    expect(component.atrasoMedioMin).toBe(0);
    expect(component.totalAtrasos).toBe(0);
  });

  it('aggregates presence heatmap into day-of-week totals (Postgres DOW: 0=Sun)', () => {
    setup(makeEmployeesStub(), makeAnalyticsStub({
      presenceHeatmap: [
        { day: 1, hour: 9,  count: 3 }, // Mon
        { day: 1, hour: 10, count: 2 }, // Mon  → total 5
        { day: 3, hour: 14, count: 7 }, // Wed
        { day: 8, hour: 9,  count: 99 }, // out of range — must be ignored
        { day: -1, hour: 9, count: 99 }, // out of range — must be ignored
      ],
    }));
    const byDay = new Map(component.acessosPorDiaSemana.map((d) => [d.dia, d.count]));
    expect(byDay.get('Seg')).toBe(5);
    expect(byDay.get('Qua')).toBe(7);
    expect(byDay.get('Dom')).toBe(0);
    // The out-of-range entries must not inflate any day.
    expect([...byDay.values()].reduce((a, b) => a + b, 0)).toBe(12);
    expect(component.maxAcessoDiaSemana).toBe(7);
  });

  // ---------------------------------------------------------------
  // Tab + selection + filter logic
  // ---------------------------------------------------------------

  it('setTab updates activeTab', () => {
    setup();
    expect(component.activeTab).toBe('dashboard');
    component.setTab('funcionarios');
    expect(component.activeTab).toBe('funcionarios');
  });

  it('filtrarFuncionarios with empty search returns everyone', () => {
    setup();
    component.searchTerm = '';
    component.selectedTurno = null;
    component.filtrarFuncionarios();
    expect(component.funcionariosFiltrados.length).toBe(4);
  });

  it('filtrarFuncionarios applies case-insensitive name substring', () => {
    setup();
    component.searchTerm = 'AL';
    component.filtrarFuncionarios();
    expect(component.funcionariosFiltrados.map((f) => f.nome)).toEqual(['Alice']);
  });

  it('filtrarFuncionarios applies turno filter', () => {
    setup();
    component.selectedTurno = 'Manhã';
    component.filtrarFuncionarios();
    expect(component.funcionariosFiltrados.map((f) => f.nome).sort()).toEqual(['Alice', 'Bob']);
  });

  it('onTurnoChange clears selection when chosen turno no longer matches', () => {
    setup();
    component.selectedFuncionario = FUNCS.find((f) => f.turno === 'Tarde')!;
    component.selectedTurno = 'Manhã'; // disagrees with Carol's turno
    component.onTurnoChange();
    expect(component.selectedFuncionario).toBeNull();
  });

  it('onTurnoChange keeps selection when turnos still match', () => {
    setup();
    const alice = FUNCS[0]; // Manhã
    component.selectedFuncionario = alice;
    component.selectedTurno = 'Manhã';
    component.onTurnoChange();
    expect(component.selectedFuncionario).toBe(alice);
  });

  it('selecionarFuncionario stores selection and clears the search box', () => {
    setup();
    component.searchTerm = 'alice';
    component.selecionarFuncionario(FUNCS[0]);
    expect(component.selectedFuncionario).toBe(FUNCS[0]);
    expect(component.searchTerm).toBe('');
  });

  // ---------------------------------------------------------------
  // Cadastro (employee creation form)
  // ---------------------------------------------------------------

  it('submitCadastro rejects empty name without hitting the API', () => {
    setup();
    component.cadastroNome = '   ';
    component.submitCadastro();
    expect(component.cadastroError).toBe('Informe o nome do funcionário.');
    expect(employeesStub.create).not.toHaveBeenCalled();
  });

  it('submitCadastro success path POSTs trimmed name + reloads list', () => {
    setup();
    const created: Funcionario = {
      id: 99,
      nome: 'Eve',
      turno: 'Tarde',
      dataIngresso: '2026-05-22',
      registros: [],
    };
    employeesStub.create.and.returnValue(of(created));
    // We don't want to actually open a modal in this test.
    const modalCtrl = TestBed.inject(ModalController);
    spyOn(modalCtrl, 'create').and.returnValue(Promise.resolve({
      present: () => Promise.resolve(),
      onDidDismiss: () => Promise.resolve({ data: { status: 'cancelled' } }),
    } as any));

    component.cadastroNome = '  Eve  ';
    component.cadastroTurno = 'Tarde';
    component.submitCadastro();

    expect(employeesStub.create).toHaveBeenCalledWith({ nome: 'Eve', turno: 'Tarde' });
    expect(component.cadastroLoading).toBeFalse();
    expect(component.cadastroNome).toBe('');
    expect(component.cadastroTurno).toBeNull();
    expect(component.cadastroError).toBe('');
    // The list was reloaded after the create succeeded.
    expect(employeesStub.list).toHaveBeenCalledTimes(2);
  });

  it('submitCadastro maps 400 / 0 / other backend errors to specific pt-BR messages', () => {
    setup();

    employeesStub.create.and.returnValue(throwError(() => ({ status: 400 })));
    component.cadastroNome = 'X';
    component.submitCadastro();
    expect(component.cadastroError).toBe('Dados inválidos. Verifique o nome informado.');

    employeesStub.create.and.returnValue(throwError(() => ({ status: 0 })));
    component.cadastroNome = 'X';
    component.submitCadastro();
    expect(component.cadastroError).toBe('Não foi possível conectar ao servidor.');

    employeesStub.create.and.returnValue(throwError(() => ({ status: 500 })));
    component.cadastroNome = 'X';
    component.submitCadastro();
    expect(component.cadastroError).toBe('Erro ao cadastrar funcionário. Tente novamente.');
  });

  it('submitCadastro is a no-op while a previous request is in flight', () => {
    setup();
    // Don't emit — keeps `cadastroLoading` true.
    employeesStub.create.and.returnValue(of(/* never */).pipe());
    component.cadastroNome = 'X';
    component.cadastroLoading = true;
    component.submitCadastro();
    expect(employeesStub.create).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // Logout + remoção
  // ---------------------------------------------------------------

  it('logout delegates to AuthService and navigates to /login', () => {
    setup();
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    const logoutSpy = spyOn(auth, 'logout');
    const navSpy = spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));

    component.logout();

    expect(logoutSpy).toHaveBeenCalled();
    expect(navSpy).toHaveBeenCalledWith('/login');
  });

  it('removerFuncionario success clears selection + reloads list', fakeAsync(() => {
    setup();
    const target = FUNCS[0];
    component.selectedFuncionario = target;
    employeesStub.list.calls.reset();

    // The alert is async but its handler invokes the service directly.
    // Easiest path: invoke removerFuncionario by simulating the handler
    // bypassing the alert UI (private method). We use any-cast to call.
    (component as any).removerFuncionario(target);
    tick();

    expect(employeesStub.delete).toHaveBeenCalledWith(1);
    expect(component.selectedFuncionario).toBeNull();
    expect(employeesStub.list).toHaveBeenCalled();
  }));

  it('removerFuncionario on error pops an alert (does NOT reload)', fakeAsync(() => {
    setup();
    employeesStub.delete.and.returnValue(throwError(() => new Error('boom')));
    employeesStub.list.calls.reset();

    const alertCtrl = TestBed.inject(AlertController);
    const present = jasmine.createSpy('present').and.returnValue(Promise.resolve());
    spyOn(alertCtrl, 'create').and.returnValue(Promise.resolve({ present } as any));

    (component as any).removerFuncionario(FUNCS[0]);
    tick();

    expect(alertCtrl.create).toHaveBeenCalled();
    expect(present).toHaveBeenCalled();
    expect(employeesStub.list).not.toHaveBeenCalled();
  }));

  // ---------------------------------------------------------------
  // Não reconhecidos (status='unknown' rolling 7-day window)
  // ---------------------------------------------------------------

  it('loadUnknowns counts only events within the last 7 days and surfaces the latest 6', () => {
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const recentRow = (offsetDays: number, idx: number) => ({
      id: idx,
      employee_name: null,
      status: 'unknown' as const,
      distance: null,
      timestamp_ms: now - offsetDays * ONE_DAY,
    });

    setup(makeEmployeesStub(), makeAnalyticsStub({
      events: [
        recentRow(0, 1),  // today      → counts
        recentRow(2, 2),  // 2d ago     → counts
        recentRow(5, 3),  // 5d ago     → counts
        recentRow(8, 4),  // 8d ago     → past cutoff (must be dropped)
        recentRow(30, 5), // 30d ago    → past cutoff (must be dropped)
      ],
    }));

    // 3 inside the 7-day window.
    expect(component.naoRecCount).toBe(3);
    // ultimosNaoRec keeps the first 6 of the raw response (no cutoff).
    expect(component.ultimosNaoRec.length).toBe(5);
    // 7 buckets, sum equals counted total.
    expect(component.naoRecPorDia.length).toBe(7);
    expect(component.naoRecPorDia.reduce((acc, d) => acc + d.count, 0)).toBe(3);
  });

  // ---------------------------------------------------------------
  // Format helpers
  // ---------------------------------------------------------------

  it('formatDistance returns "—" for null/undefined, 2 decimals otherwise', () => {
    setup();
    expect(component.formatDistance(null)).toBe('—');
    expect(component.formatDistance(undefined as any)).toBe('—');
    expect(component.formatDistance(0.123456)).toBe('0.12');
    expect(component.formatDistance(1)).toBe('1.00');
  });
});

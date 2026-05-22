import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonText,
  IonToolbar,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonLabel,
  AlertController,
  ModalController,
} from '@ionic/angular/standalone';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { EmployeeCardComponent } from '../employee-card/employee-card.component';
import { EmployeesService, Funcionario } from '../employees/employees.service';
import { AnalyticsService, EventRow } from '../analytics/analytics.service';
import { AuthService } from '../core/auth/auth.service';
import { EnrollmentWizardComponent } from '../features/enrollment/enrollment-wizard.component';

interface AcessoHoraItem {
  label: string;
  count: number;
}

interface DistribuicaoTurnoItem {
  turno: string;
  count: number;
  pct: number;
  color: string;
}

interface PieSegment {
  turno: string;
  pct: number;
  color: string;
  d: string;
}

interface AcessoDiaSemanaItem {
  dia: string;
  count: number;
}

type DashboardTab =
  | 'dashboard'
  | 'funcionarios'
  | 'cadastro'
  | 'exportar';

const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_PAGES = 50;

const TOLERANCIA_ATRASO_MIN = 15;

const TURNO_CORES: Record<string, string> = {
  'Manhã': '#fbbf24',
  'Tarde': '#6fd96f',
  'Noite': '#60a5fa',
};

const COR_TURNO_FALLBACK = '#9ca3af';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonText,
    IonToolbar,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonLabel,
    EmployeeCardComponent,
  ],
})
export class DashboardPage implements OnInit {
  private http = inject(HttpClient);
  private employees = inject(EmployeesService);
  private analytics = inject(AnalyticsService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);

  activeTab: DashboardTab = 'dashboard';

  searchTerm = '';
  selectedTurno: string | null = null;
  selectedFuncionario: Funcionario | null = null;

  funcionarios: Funcionario[] = [];
  turnos: string[] = [];
  funcionariosFiltrados: Funcionario[] = [];

  // KPIs / dados derivados
  totalFuncionarios = 0;
  totalAtrasos = 0;
  atrasoMedioMin = 0;

  // Não reconhecidos (últimos 7 dias)
  naoRecCount = 0;
  naoRecPorDia: { dia: string; count: number }[] = [];
  maxNaoRecPorDia = 1;
  ultimosNaoRec: EventRow[] = [];

  acessosPorHora: AcessoHoraItem[] = [];
  maxAcessosHora = 0;

  distribuicaoTurno: DistribuicaoTurnoItem[] = [];
  pieSegments: PieSegment[] = [];

  acessosPorDiaSemana: AcessoDiaSemanaItem[] = [];
  maxAcessoDiaSemana = 0;

  // Form de cadastro de funcionário
  cadastroNome = '';
  cadastroTurno: string | null = null;
  cadastroLoading = false;
  cadastroError = '';
  cadastroSuccess = '';

  // Exportar dados
  exportSelectedEmployees: number[] = [];
  exportLimitOptions: number[] = [50, 100, 200, 500, 1000];
  exportLimit = 100;
  exportFrom = '';
  exportTo = '';
  exportLoading = false;
  exportError = '';
  exportSuccess = '';

  ngOnInit(): void {
    this.reloadFuncionarios();

    this.loadUnknowns();

    this.analytics.avgDelay().subscribe((rows) => {
      this.totalAtrasos = rows.filter(
        (r) => r.avg_delay_minutes > TOLERANCIA_ATRASO_MIN,
      ).length;
      this.atrasoMedioMin =
        rows.length > 0
          ? Math.round(
              (rows.reduce((acc, r) => acc + r.avg_delay_minutes, 0) /
                rows.length) *
                10,
            ) / 10
          : 0;
    });

    this.analytics.accessByHour().subscribe((rows) => {
      this.acessosPorHora = rows.map((r) => ({
        label: `${r.hour.toString().padStart(2, '0')}h`,
        count: r.count,
      }));
      this.maxAcessosHora = Math.max(1, ...rows.map((r) => r.count));
    });

    this.analytics.presenceHeatmap().subscribe((rows) => {
      const byDay = [0, 0, 0, 0, 0, 0, 0];
      for (const r of rows) {
        if (r.day >= 0 && r.day < 7) byDay[r.day] += r.count;
      }
      this.acessosPorDiaSemana = DIAS_SEMANA.map((dia, i) => ({
        dia,
        count: byDay[i],
      }));
      this.maxAcessoDiaSemana = Math.max(1, ...byDay);
    });
  }

  setTab(tab: DashboardTab): void {
    this.activeTab = tab;
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  // ---------- Não reconhecidos ----------

  private loadUnknowns(): void {
    console.log('[unknowns] requesting events?status=unknown&limit=200');
    this.analytics.events({ status: 'unknown', limit: 200 }).subscribe({
      next: (rows) => {
        console.log('[unknowns] rows received:', rows.length, rows.slice(0, 3));

        const dayLabels: string[] = [];
        const byDay = new Map<string, number>();
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = this.spDayKey(d.getTime());
          dayLabels.push(key);
          byDay.set(key, 0);
        }
        console.log('[unknowns] dayLabels (last 7 days):', dayLabels);

        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        console.log('[unknowns] cutoff ms:', cutoff, 'now ms:', Date.now());

        let count = 0;
        let skippedOldCutoff = 0;
        let skippedMissingKey = 0;
        for (const r of rows) {
          if (r.timestamp_ms < cutoff) {
            skippedOldCutoff++;
            continue;
          }
          const key = this.spDayKey(r.timestamp_ms);
          if (byDay.has(key)) {
            byDay.set(key, byDay.get(key)! + 1);
            count++;
          } else {
            skippedMissingKey++;
            if (skippedMissingKey <= 3) {
              console.warn(
                '[unknowns] key not in dayLabels:',
                key,
                'ts_ms:',
                r.timestamp_ms,
              );
            }
          }
        }
        console.log(
          '[unknowns] counted:',
          count,
          'skipped(old):',
          skippedOldCutoff,
          'skipped(no-key):',
          skippedMissingKey,
        );

        this.naoRecCount = count;
        this.naoRecPorDia = dayLabels.map((dia) => ({
          dia,
          count: byDay.get(dia) ?? 0,
        }));
        this.maxNaoRecPorDia = Math.max(
          1,
          ...this.naoRecPorDia.map((d) => d.count),
        );
        this.ultimosNaoRec = rows.slice(0, 6);
      },
      error: (err) => {
        console.error('[unknowns] API error:', err);
      },
    });
  }

  private spDayKey(ms: number): string {
    const fmt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
    });
    return fmt.format(new Date(ms));
  }

  formatUnknownTime(ms: number): string {
    const fmt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date(ms));
    const get = (t: string) =>
      parts.find((p) => p.type === t)?.value ?? '';
    return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`;
  }

  formatDistance(d: number | null): string {
    return d === null || d === undefined ? '—' : d.toFixed(2);
  }

  // ---------- Cadastro ----------

  private reloadFuncionarios(): void {
    this.employees.list().subscribe((rows) => {
      this.funcionarios = rows;
      this.totalFuncionarios = rows.length;
      this.turnos = [...new Set(rows.map((f) => f.turno).filter((t) => !!t))].sort();
      this.distribuicaoTurno = this.computeDistribuicaoTurno();
      this.pieSegments = this.computePieSegments(this.distribuicaoTurno);
      this.filtrarFuncionarios();
    });
  }

  submitCadastro(): void {
    if (this.cadastroLoading) return;
    const nome = this.cadastroNome.trim();
    this.cadastroError = '';
    this.cadastroSuccess = '';
    if (!nome) {
      this.cadastroError = 'Informe o nome do funcionário.';
      return;
    }

    this.cadastroLoading = true;
    this.employees.create({ nome, turno: this.cadastroTurno }).subscribe({
      next: (f) => {
        this.cadastroLoading = false;
        this.cadastroNome = '';
        this.cadastroTurno = null;
        this.reloadFuncionarios();
        this.openEnrollmentWizard(f);
      },
      error: (err: HttpErrorResponse) => {
        this.cadastroLoading = false;
        if (err.status === 400) {
          this.cadastroError = 'Dados inválidos. Verifique o nome informado.';
        } else if (err.status === 0) {
          this.cadastroError = 'Não foi possível conectar ao servidor.';
        } else {
          this.cadastroError = 'Erro ao cadastrar funcionário. Tente novamente.';
        }
      },
    });
  }

  private async openEnrollmentWizard(employee: Funcionario): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: EnrollmentWizardComponent,
      componentProps: {
        employeeId: employee.id,
        employeeName: employee.nome,
      },
      backdropDismiss: false,
    });

    await modal.present();
    const { data } = await modal.onDidDismiss<{
      status: 'completed' | 'cancelled';
      count?: number;
    }>();

    if (data?.status === 'completed') {
      this.cadastroSuccess =
        `Funcionário "${employee.nome}" cadastrado com ${data.count ?? 0} captura(s).`;
    } else {
      this.cadastroSuccess =
        `Funcionário "${employee.nome}" cadastrado. Capture as fotos depois pela lista.`;
    }
  }

  // ---------- Computações de distribuição por turno ----------

  private computeDistribuicaoTurno(): DistribuicaoTurnoItem[] {
    const counts = new Map<string, number>();
    for (const f of this.funcionarios) {
      const t = f.turno || 'Sem turno';
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const total = this.funcionarios.length || 1;
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([turno, count]) => ({
        turno,
        count,
        pct: Math.round((count / total) * 100),
        color: TURNO_CORES[turno] ?? COR_TURNO_FALLBACK,
      }));
  }

  private computePieSegments(dist: DistribuicaoTurnoItem[]): PieSegment[] {
    const cx = 50;
    const cy = 50;
    const r = 42;

    if (dist.length === 1) {
      const only = dist[0];
      return [
        {
          turno: only.turno,
          pct: only.pct,
          color: only.color,
          d: `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`,
        },
      ];
    }

    let startAngle = -Math.PI / 2;
    return dist.map((d) => {
      const angle = (d.pct / 100) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const largeArc = angle > Math.PI ? 1 : 0;
      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      startAngle = endAngle;
      return { turno: d.turno, pct: d.pct, color: d.color, d: path };
    });
  }

  // ---------- Aba Funcionários ----------

  filtrarFuncionarios(): void {
    const termo = this.searchTerm.trim().toLowerCase();
    // Empty search no longer means "hide all" — opening the tab fresh
    // should reveal everyone, with the turno dropdown narrowing the list.
    this.funcionariosFiltrados = this.funcionarios.filter((f) => {
      const matchNome = !termo || f.nome.toLowerCase().includes(termo);
      const matchTurno = !this.selectedTurno || f.turno === this.selectedTurno;
      return matchNome && matchTurno;
    });
  }

  onTurnoChange(): void {
    if (
      this.selectedFuncionario &&
      this.selectedTurno &&
      this.selectedFuncionario.turno !== this.selectedTurno
    ) {
      this.selectedFuncionario = null;
    }
    this.filtrarFuncionarios();
  }

  selecionarFuncionario(f: Funcionario): void {
    this.selectedFuncionario = f;
    this.searchTerm = '';
    this.filtrarFuncionarios();
  }

  async confirmarRemocaoFuncionario(): Promise<void> {
    if (!this.selectedFuncionario) return;
    const target = this.selectedFuncionario;

    const alert = await this.alertCtrl.create({
      header: `Remover ${target.nome}?`,
      message:
        'Esta ação não pode ser desfeita e apaga também os embeddings ' +
        'faciais cadastrados.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Remover',
          role: 'destructive',
          handler: () => this.removerFuncionario(target),
        },
      ],
    });
    await alert.present();
  }

  private removerFuncionario(f: Funcionario): void {
    this.employees.delete(f.id).subscribe({
      next: () => {
        if (this.selectedFuncionario?.id === f.id) {
          this.selectedFuncionario = null;
        }
        this.reloadFuncionarios();
      },
      error: async () => {
        const alert = await this.alertCtrl.create({
          header: 'Erro ao remover',
          message: 'Não foi possível remover o funcionário. Tente novamente.',
          buttons: ['OK'],
        });
        await alert.present();
      },
    });
  }

  // ---------- Aba Exportar ----------

  exportSelectAllEmployees(): void {
    this.exportSelectedEmployees = this.funcionarios.map((f) => f.id);
  }

  exportClearEmployees(): void {
    this.exportSelectedEmployees = [];
  }

  async submitExport(): Promise<void> {
    if (this.exportLoading) return;
    this.exportError = '';
    this.exportSuccess = '';

    const fromMs = this.parseDateTimeLocal(this.exportFrom);
    const toMs = this.parseDateTimeLocal(this.exportTo);
    if (fromMs !== undefined && toMs !== undefined && fromMs > toMs) {
      this.exportError = 'O início do período deve ser anterior ao fim.';
      return;
    }

    this.exportLoading = true;
    try {
      const targets: (number | undefined)[] =
        this.exportSelectedEmployees.length === 0
          ? [undefined]
          : [...this.exportSelectedEmployees];

      const collected: EventRow[] = [];
      for (const empId of targets) {
        const batch = await this.fetchGrantedEvents(
          empId,
          fromMs,
          toMs,
          this.exportLimit,
        );
        collected.push(...batch);
      }

      collected.sort((a, b) => b.timestamp_ms - a.timestamp_ms);
      const top = collected.slice(0, this.exportLimit);

      if (top.length === 0) {
        this.exportError = 'Nenhum evento encontrado para os filtros selecionados.';
        return;
      }

      this.downloadEventsCsv(top);
      this.exportSuccess = `Exportados ${top.length} evento(s).`;
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : undefined;
      if (status === 0) {
        this.exportError = 'Não foi possível conectar ao servidor.';
      } else {
        this.exportError = 'Erro ao exportar eventos. Tente novamente.';
      }
    } finally {
      this.exportLoading = false;
    }
  }

  private async fetchGrantedEvents(
    employeeId: number | undefined,
    from: number | undefined,
    to: number | undefined,
    max: number,
  ): Promise<EventRow[]> {
    const rows: EventRow[] = [];
    let offset = 0;
    for (let page = 0; page < EXPORT_MAX_PAGES && rows.length < max; page++) {
      const pageSize = Math.min(EXPORT_PAGE_SIZE, max - rows.length);
      const batch = await firstValueFrom(
        this.analytics.events({
          status: 'granted',
          employee_id: employeeId,
          from,
          to,
          limit: pageSize,
          offset,
        }),
      );
      if (!batch.length) break;
      rows.push(...batch);
      if (batch.length < pageSize) break;
      offset += batch.length;
    }
    return rows;
  }

  private parseDateTimeLocal(s: string): number | undefined {
    if (!s) return undefined;
    const t = new Date(s).getTime();
    return Number.isFinite(t) ? t : undefined;
  }

  private downloadEventsCsv(events: EventRow[]): void {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const fmtDate = (ms: number): string => {
      const d = new Date(ms);
      return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      );
    };
    const fmtDistance = (v: number | null): string =>
      v === null || v === undefined ? '' : v.toFixed(4).replace('.', ',');
    const escape = (v: string | number | null | undefined): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = ['ID', 'Funcionário', 'Status', 'Distância', 'Data/Hora'];
    const lines = [
      header.map(escape).join(';'),
      ...events.map((e) =>
        [
          e.id,
          e.employee_name ?? 'Desconhecido',
          e.status,
          fmtDistance(e.distance),
          fmtDate(e.timestamp_ms),
        ]
          .map(escape)
          .join(';'),
      ),
    ];

    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const stamp =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `facegate-eventos-${stamp}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

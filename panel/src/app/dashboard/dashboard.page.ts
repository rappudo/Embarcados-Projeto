import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonToolbar,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonLabel,
} from '@ionic/angular/standalone';
import { EmployeeCardComponent } from '../employee-card/employee-card.component';
import { EventCardComponent } from '../event-card/event-card.component';

interface Evento {
  titulo: string;
  descricao: string;
  data?: string;
  icone?: string;
}

interface Registro {
  data: string;
  entrada: string;
  saidas: string[];
}

interface Funcionario {
  id: number;
  nome: string;
  idade: number;
  dataIngresso: string;
  turno: string;
  registros: Registro[];
}

interface HorariosPontoMock {
  funcionarios: Funcionario[];
}

interface EventosMock {
  eventos: Evento[];
}

interface HorasPorDiaItem {
  data: string;
  label: string;
  horas: number;
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

interface AtrasoDiaSemanaItem {
  dia: string;
  count: number;
}

type DashboardTab = 'dashboard' | 'funcionarios' | 'eventos';

const HORARIOS_TURNO: Record<string, number> = {
  'Manhã': 8 * 60,
  'Tarde': 13 * 60,
  'Noite': 22 * 60,
};

const TOLERANCIA_ATRASO_MIN = 15; // minutos de tolerância para considerar um registro como atraso

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
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonToolbar,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonLabel,
    EmployeeCardComponent,
    EventCardComponent,
  ],
})
export class DashboardPage implements OnInit {
  private http = inject(HttpClient);

  activeTab: DashboardTab = 'dashboard';

  searchTerm = '';
  selectedTurno: string | null = null;
  selectedFuncionario: Funcionario | null = null;

  funcionarios: Funcionario[] = [];
  turnos: string[] = [];
  funcionariosFiltrados: Funcionario[] = [];

  // Filtros do dashboard
  periodoDias: 30 | 60 | 90 = 30;
  turnoChartFiltro: string | null = null;

  // KPIs / dados derivados
  totalFuncionarios = 0;
  totalAtrasos = 0;
  pontualidadePct = 0;
  mediaHorasDiarias = 0;

  horasPorDia: HorasPorDiaItem[] = [];
  maxHorasDia = 0;

  distribuicaoTurno: DistribuicaoTurnoItem[] = [];
  pieSegments: PieSegment[] = [];

  atrasosPorDiaSemana: AtrasoDiaSemanaItem[] = [];
  maxAtrasoDiaSemana = 0;

  eventos: Evento[] = [];

  ngOnInit(): void {
    this.http
      .get<HorariosPontoMock>('assets/mock_data_jsons/horarios_ponto.json')
      .subscribe((data) => {
        this.funcionarios = data.funcionarios;
        this.turnos = [...new Set(data.funcionarios.map((f) => f.turno))].sort();
        this.recomputeAnalytics();
      });

    this.http
      .get<EventosMock>('assets/mock_data_jsons/eventos.json')
      .subscribe((data) => {
        this.eventos = data.eventos;
      });
  }

  setTab(tab: DashboardTab): void {
    this.activeTab = tab;
  }

  onPeriodoChange(): void {
    this.recomputeAnalytics();
  }

  onTurnoChartChange(): void {
    this.recomputeHorasPorDia();
  }

  // ---------- Computações ----------

  private recomputeAnalytics(): void {
    const cutoff = this.cutoffDate();

    let totalAtrasos = 0;
    let totalRegistros = 0;
    let totalMinutosTrabalhados = 0;
    const atrasosDiaSemana = [0, 0, 0, 0, 0, 0, 0];

    for (const f of this.funcionarios) {
      for (const r of f.registros) {
        const d = this.parseDate(r.data);
        if (d < cutoff) continue;
        totalRegistros++;
        totalMinutosTrabalhados += this.computeWorkedMin(r);
        if (this.isAtraso(r, f.turno)) {
          totalAtrasos++;
          atrasosDiaSemana[d.getDay()]++;
        }
      }
    }

    this.totalFuncionarios = this.funcionarios.length;
    this.totalAtrasos = totalAtrasos;
    this.pontualidadePct =
      totalRegistros > 0
        ? Math.round(((totalRegistros - totalAtrasos) / totalRegistros) * 100)
        : 0;
    this.mediaHorasDiarias =
      totalRegistros > 0
        ? Math.round((totalMinutosTrabalhados / totalRegistros / 60) * 10) / 10
        : 0;

    this.atrasosPorDiaSemana = DIAS_SEMANA.map((dia, i) => ({
      dia,
      count: atrasosDiaSemana[i],
    }));
    this.maxAtrasoDiaSemana = Math.max(1, ...atrasosDiaSemana);

    this.distribuicaoTurno = this.computeDistribuicaoTurno();
    this.pieSegments = this.computePieSegments(this.distribuicaoTurno);

    this.recomputeHorasPorDia();
  }

  private recomputeHorasPorDia(): void {
    const cutoff = this.cutoffDate();
    const byDate = new Map<string, number>();

    for (const f of this.funcionarios) {
      if (this.turnoChartFiltro && f.turno !== this.turnoChartFiltro) continue;
      for (const r of f.registros) {
        if (this.parseDate(r.data) < cutoff) continue;
        byDate.set(r.data, (byDate.get(r.data) ?? 0) + this.computeWorkedMin(r));
      }
    }

    const sortedDates = [...byDate.keys()].sort();
    this.horasPorDia = sortedDates.map((data) => ({
      data,
      label: this.formatDateLabel(data),
      horas: Math.round(((byDate.get(data) ?? 0) / 60) * 10) / 10,
    }));
    this.maxHorasDia = Math.max(1, ...this.horasPorDia.map((d) => d.horas));
  }

  private computeDistribuicaoTurno(): DistribuicaoTurnoItem[] {
    const counts = new Map<string, number>();
    for (const f of this.funcionarios) {
      counts.set(f.turno, (counts.get(f.turno) ?? 0) + 1);
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

  // ---------- Helpers ----------

  private cutoffDate(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - this.periodoDias);
    return d;
  }

  private parseDate(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private parseTime(s: string): number {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  }

  private computeWorkedMin(r: Registro): number {
    const pts = [r.entrada, ...r.saidas].map((t) => this.parseTime(t));
    for (let i = 1; i < pts.length; i++) {
      while (pts[i] < pts[i - 1]) pts[i] += 24 * 60;
    }
    let worked = 0;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      worked += pts[i + 1] - pts[i];
    }
    return worked;
  }

  private isAtraso(r: Registro, turno: string): boolean {
    const expected = HORARIOS_TURNO[turno];
    if (expected === undefined) return false;
    return this.parseTime(r.entrada) > expected + TOLERANCIA_ATRASO_MIN;
  }

  private formatDateLabel(s: string): string {
    const [, m, d] = s.split('-');
    return `${d}/${m}`;
  }

  // ---------- Aba Funcionários (já existente) ----------

  filtrarFuncionarios(): void {
    const termo = this.searchTerm.trim().toLowerCase();
    if (!termo) {
      this.funcionariosFiltrados = [];
      return;
    }
    this.funcionariosFiltrados = this.funcionarios.filter((f) => {
      const matchNome = f.nome.toLowerCase().includes(termo);
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
    this.funcionariosFiltrados = [];
  }
}

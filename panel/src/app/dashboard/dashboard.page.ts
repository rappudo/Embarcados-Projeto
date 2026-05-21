import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
} from '@ionic/angular/standalone';
import { HttpErrorResponse } from '@angular/common/http';
import { EmployeeCardComponent } from '../employee-card/employee-card.component';
import { EventCardComponent } from '../event-card/event-card.component';
import { EmployeesService, Funcionario } from '../employees/employees.service';
import { AnalyticsService, EventRow } from '../analytics/analytics.service';

interface Evento {
  titulo: string;
  descricao: string;
  data?: string;
  icone?: string;
}

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

type DashboardTab = 'dashboard' | 'funcionarios' | 'cadastro' | 'eventos';

const TOLERANCIA_ATRASO_MIN = 15;

const TURNO_CORES: Record<string, string> = {
  'Manhã': '#fbbf24',
  'Tarde': '#6fd96f',
  'Noite': '#60a5fa',
};

const COR_TURNO_FALLBACK = '#9ca3af';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Espelha o map shift→hora do backend ([analytics.rs:174-180](backend/src/routes/analytics.rs#L174-L180))
// para que os cálculos por funcionário batam com o /analytics/avg-delay global.
const SHIFT_START_HHMM: Record<string, [number, number]> = {
  'Manhã': [8, 0],
  'Tarde': [14, 0],
  'Noite': [22, 0],
};

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
    EventCardComponent,
  ],
})
export class DashboardPage implements OnInit {
  private employees = inject(EmployeesService);
  private analytics = inject(AnalyticsService);

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
  pontualidadePct = 0;
  atrasoMedioMin = 0;

  acessosPorHora: AcessoHoraItem[] = [];
  maxAcessosHora = 0;

  distribuicaoTurno: DistribuicaoTurnoItem[] = [];
  pieSegments: PieSegment[] = [];

  acessosPorDiaSemana: AcessoDiaSemanaItem[] = [];
  maxAcessoDiaSemana = 0;

  eventos: Evento[] = [];

  // Form de cadastro de funcionário
  cadastroNome = '';
  cadastroTurno: string | null = null;
  cadastroLoading = false;
  cadastroError = '';
  cadastroSuccess = '';

  // Foto de perfil
  fotoPerfil = 'assets/Images/Profile_Placeholder.jpg';
  fotoPerfilBase64: string | null = null;
  fileInput: HTMLInputElement | null = null;

  // Dashboard por funcionário (aba Funcionários, exibido só com selectedFuncionario)
  funcPontualidadePct: number | null = null;
  funcTotalAtrasos: number | null = null;
  funcAtrasoMedioMin: number | null = null;
  funcAcessosPorHora: AcessoHoraItem[] = [];
  funcMaxAcessosHora = 0;
  funcAcessosPorDiaSemana: AcessoDiaSemanaItem[] = [];
  funcMaxAcessoDiaSemana = 0;

  ngOnInit(): void {
    this.reloadFuncionarios();

    this.analytics.summaryToday().subscribe((s) => {
      this.pontualidadePct =
        s.total > 0 ? Math.round((s.granted / s.total) * 100) : 0;
    });

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

    this.analytics.events({ limit: 20 }).subscribe({
      next: (rows: EventRow[]) => {
        this.eventos = rows.map((row) => ({
          titulo: `${row.employee_name || 'Desconhecido'} - ${row.status === 'granted' ? 'Acesso Concedido' : 'Desconhecido'}`,
          descricao: row.distance !== null ? `Distância: ${row.distance.toFixed(2)}m` : 'Sem distância',
          data: new Date(row.timestamp_ms).toLocaleString('pt-BR'),
          icone: row.status === 'granted' ? 'checkmark-circle-outline' : 'alert-circle-outline',
        }));
      },
      error: (err) => {
        console.error('Erro ao carregar eventos:', err);
        this.eventos = [];
      },
    });
  }

  setTab(tab: DashboardTab): void {
    this.activeTab = tab;
  }

  // ---------- Cadastro ----------

  private reloadFuncionarios(): void {
    this.employees.list().subscribe((rows) => {
      this.funcionarios = rows;
      this.totalFuncionarios = rows.length;
      this.turnos = [...new Set(rows.map((f) => f.turno).filter((t) => !!t))].sort();
      this.distribuicaoTurno = this.computeDistribuicaoTurno();
      this.pieSegments = this.computePieSegments(this.distribuicaoTurno);
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
        this.cadastroSuccess = `Funcionário "${f.nome}" cadastrado com sucesso.`;
        this.cadastroNome = '';
        this.cadastroTurno = null;
        this.reloadFuncionarios();
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
      this.clearFuncionarioDashboard();
    }
    this.filtrarFuncionarios();
  }

  selecionarFuncionario(f: Funcionario): void {
    this.selectedFuncionario = f;
    this.searchTerm = '';
    this.funcionariosFiltrados = [];
    this.loadFuncionarioDashboard(f);
  }

  private clearFuncionarioDashboard(): void {
    this.funcPontualidadePct = null;
    this.funcTotalAtrasos = null;
    this.funcAtrasoMedioMin = null;
    this.funcAcessosPorHora = [];
    this.funcMaxAcessosHora = 0;
    this.funcAcessosPorDiaSemana = [];
    this.funcMaxAcessoDiaSemana = 0;
  }

  private loadFuncionarioDashboard(f: Funcionario): void {
    this.clearFuncionarioDashboard();
    this.analytics
      .events({ employee_id: f.id, status: 'granted', limit: 200 })
      .subscribe((rows: EventRow[]) => {
        // Bloqueia race condition se o usuário trocar de funcionário antes da resposta chegar.
        if (this.selectedFuncionario?.id !== f.id) return;
        this.computeFuncionarioCharts(rows);
        this.computeFuncionarioKpis(rows, f);
      });
  }

  private computeFuncionarioCharts(rows: EventRow[]): void {
    const hourly = new Array<number>(24).fill(0);
    const dow = new Array<number>(7).fill(0);
    for (const ev of rows) {
      const d = new Date(ev.timestamp_ms);
      const h = d.getHours();
      const w = d.getDay();
      if (h >= 0 && h < 24) hourly[h]++;
      if (w >= 0 && w < 7) dow[w]++;
    }
    this.funcAcessosPorHora = hourly.map((count, hour) => ({
      label: `${hour.toString().padStart(2, '0')}h`,
      count,
    }));
    this.funcMaxAcessosHora = Math.max(1, ...hourly);
    this.funcAcessosPorDiaSemana = DIAS_SEMANA.map((dia, i) => ({
      dia,
      count: dow[i],
    }));
    this.funcMaxAcessoDiaSemana = Math.max(1, ...dow);
  }

  private computeFuncionarioKpis(rows: EventRow[], f: Funcionario): void {
    const shiftStart = SHIFT_START_HHMM[f.turno];
    if (!shiftStart) {
      // Sem turno definido não há referência para calcular atraso.
      this.funcPontualidadePct = null;
      this.funcTotalAtrasos = null;
      this.funcAtrasoMedioMin = null;
      return;
    }

    // Primeiro evento de cada dia (chave = data local YYYY-MM-DD).
    const firstPerDay = new Map<string, number>();
    for (const ev of rows) {
      const d = new Date(ev.timestamp_ms);
      const key =
        `${d.getFullYear()}-` +
        `${(d.getMonth() + 1).toString().padStart(2, '0')}-` +
        `${d.getDate().toString().padStart(2, '0')}`;
      const cur = firstPerDay.get(key);
      if (cur === undefined || ev.timestamp_ms < cur) {
        firstPerDay.set(key, ev.timestamp_ms);
      }
    }

    if (firstPerDay.size === 0) {
      this.funcPontualidadePct = 0;
      this.funcTotalAtrasos = 0;
      this.funcAtrasoMedioMin = 0;
      return;
    }

    const shiftMinutes = shiftStart[0] * 60 + shiftStart[1];
    const delays: number[] = [];
    for (const firstMs of firstPerDay.values()) {
      const d = new Date(firstMs);
      const minutesIntoDay = d.getHours() * 60 + d.getMinutes();
      delays.push(minutesIntoDay - shiftMinutes);
    }

    const lateDays = delays.filter((m) => m > TOLERANCIA_ATRASO_MIN).length;
    const avg = delays.reduce((a, b) => a + b, 0) / delays.length;

    this.funcTotalAtrasos = lateDays;
    this.funcAtrasoMedioMin = Math.round(avg * 10) / 10;
    this.funcPontualidadePct = Math.round(
      ((delays.length - lateDays) / delays.length) * 100,
    );
  }

  // ---------- Foto de Perfil ----------

  escolherFoto(): void {
    if (!this.fileInput) {
      this.fileInput = document.createElement('input');
      this.fileInput.type = 'file';
      this.fileInput.accept = 'image/*';
      this.fileInput.style.display = 'none';
      this.fileInput.addEventListener('change', (event) => this.procesarArquivoFoto(event));
      document.body.appendChild(this.fileInput);
    }
    this.fileInput.click();
  }

  private procesarArquivoFoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        this.fotoPerfil = result;
        // Extrair base64 sem o prefixo data:image/...;base64,
        const base64 = result.split(',')[1];
        this.fotoPerfilBase64 = base64;
      }
    };
    reader.readAsDataURL(file);
    
    // Limpar o valor do input para permitir selecionar o mesmo arquivo novamente
    input.value = '';
  }
}

import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { DecimalPipe } from "@angular/common";
import { forkJoin } from "rxjs";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import { downloadOutline } from "ionicons/icons";
import { NgxEchartsDirective } from "ngx-echarts";
import type { EChartsOption } from "echarts";

import { AnalyticsService } from "../../core/api/analytics.service";
import { EventsService } from "../../core/api/events.service";
import { AvgDelay, HeatmapCell } from "../../core/models/analytics.model";

/**
 * Reports page.
 *
 * Two visualizations:
 *   - Avg-delay table — per-employee tardiness in minutes.
 *   - Presence heatmap — 7 rows (Sun…Sat) × 24 cols (hours 0…23),
 *     ECharts heatmap series, intensity = event count.
 *
 * Plus a "Exportar CSV" button that pulls up to 1000 events and emits
 * a download via a Blob URL. PDF/Excel intentionally not included:
 * jspdf/exceljs would add ~1MB to the bundle for marginal demo value.
 */
@Component({
  selector: "app-reports",
  templateUrl: "./reports.page.html",
  styleUrls: ["./reports.page.scss"],
  host: { class: "ion-page" },
  imports: [
    DecimalPipe,
    NgxEchartsDirective,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonNote,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class ReportsPage implements OnInit {
  private analytics = inject(AnalyticsService);
  private eventsApi = inject(EventsService);
  private toast = inject(ToastController);
  private destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly exporting = signal(false);

  readonly delays = signal<AvgDelay[]>([]);
  readonly heatmapOpts = signal<EChartsOption | null>(null);

  /** Portuguese day labels for the heatmap Y axis (0=Sunday per Postgres DOW). */
  private readonly dayLabels = [
    "Dom",
    "Seg",
    "Ter",
    "Qua",
    "Qui",
    "Sex",
    "Sáb",
  ];

  constructor() {
    addIcons({ downloadOutline });
  }

  ngOnInit(): void {
    forkJoin({
      delays: this.analytics.avgDelay(),
      heatmap: this.analytics.presenceHeatmap(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ delays, heatmap }) => {
          // Already ordered DESC by the backend, but we sort defensively
          // in case a future API change drops the ORDER BY clause.
          const sorted = [...delays].sort(
            (a, b) => b.avg_delay_minutes - a.avg_delay_minutes,
          );
          this.delays.set(sorted);
          this.heatmapOpts.set(this.buildHeatmap(heatmap));
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.showToast("Erro ao carregar relatórios.", "danger");
        },
      });
  }

  /** ECharts heatmap config. Sparse input — missing cells render as 0. */
  private buildHeatmap(cells: HeatmapCell[]): EChartsOption {
    const max = cells.reduce((m, c) => Math.max(m, c.count), 1);

    // ECharts heatmap wants [xIndex, yIndex, value] tuples. Our backend
    // gives (day, hour, count) — day on Y axis, hour on X.
    const data = cells.map((c) => [c.hour, c.day, c.count]);

    return {
      tooltip: {
        position: "top",
        formatter: (p: any) => {
          const [hour, day, count] = p.data as [number, number, number];
          return `${this.dayLabels[day]} • ${hour}h<br>${count} acesso(s)`;
        },
      },
      grid: {
        height: "70%",
        top: 30,
        left: 40,
        right: 20,
      },
      xAxis: {
        type: "category",
        data: Array.from({ length: 24 }, (_, h) => `${h}h`),
        splitArea: { show: true },
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: "category",
        data: this.dayLabels,
        splitArea: { show: true },
      },
      visualMap: {
        min: 0,
        max,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        // Light blue → strong blue gradient, matches Ionic primary
        inRange: { color: ["#e0eaff", "#3880ff", "#0b3b8a"] },
      },
      series: [
        {
          name: "Acessos",
          type: "heatmap",
          data,
          label: { show: false },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.4)",
            },
          },
        },
      ],
    };
  }

  /** Pull last 1000 events and trigger a CSV download. */
  exportCsv(): void {
    if (this.exporting()) return;
    this.exporting.set(true);

    this.eventsApi.list({ limit: 1000 }).subscribe({
      next: (events) => {
        const header = ["id", "timestamp", "status", "employee", "distance"];
        const rows = events.map((e) => [
          String(e.id),
          new Date(e.timestamp_ms).toISOString(),
          e.status,
          e.employee_name ?? "",
          e.distance != null ? String(e.distance) : "",
        ]);

        const csv = [header, ...rows]
          .map((cells) => cells.map(escapeCsv).join(","))
          .join("\r\n");

        // Blob → object URL → invisible <a> → click → revoke.
        // This is the standard browser-only CSV-download dance.
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `facegate-eventos-${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.exporting.set(false);
        this.showToast(`${events.length} eventos exportados.`, "success");
      },
      error: () => {
        this.exporting.set(false);
        this.showToast("Erro ao exportar.", "danger");
      },
    });
  }

  private async showToast(
    message: string,
    color: "success" | "danger",
  ): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 2500,
      position: "bottom",
      color,
    });
    await t.present();
  }
}

/** Minimal RFC-4180 quoting: wrap in double-quotes if value contains
 *  comma, double-quote, or line break, and escape any internal quotes. */
function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

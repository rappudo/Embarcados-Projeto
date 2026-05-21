import { Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { forkJoin } from "rxjs";
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonMenuButton,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";
import { NgxEchartsDirective } from "ngx-echarts";
import type { EChartsOption } from "echarts";

import { AnalyticsService } from "../../core/api/analytics.service";
import { PresenceService } from "../../core/api/presence.service";
import { HourCount, SummaryToday } from "../../core/models/analytics.model";
import { StatCardComponent } from "../../shared/stat-card/stat-card.component";

/** Auto-refresh interval. 30s is visible during a live demo but not noisy. */
const REFRESH_INTERVAL_MS = 30_000;

/**
 * Main dashboard. Four summary cards + access-by-hour bar chart.
 *
 * Refresh strategy:
 *   - Initial fetch in ngOnInit (forkJoin = all endpoints in parallel).
 *   - setInterval triggers re-fetch every 30s.
 *   - Interval is cleared via DestroyRef.onDestroy() — the modern, signal-
 *     friendly alternative to ngOnDestroy.
 *
 * ECharts is provided lazily via provideEchartsCore({ echarts: () => import(...) })
 * in app.config.ts — so the echarts library is not in the initial bundle.
 *
 * Navigation is provided by the app-shell <ion-menu>; this page just
 * shows a hamburger button to toggle it on small screens.
 */
@Component({
  selector: "app-dashboard",
  templateUrl: "./dashboard.page.html",
  styleUrls: ["./dashboard.page.scss"],
  // Required because we use <router-outlet> instead of <ion-router-outlet>.
  host: { class: "ion-page" },
  imports: [
    StatCardComponent,
    NgxEchartsDirective,
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonTitle,
    IonToolbar,
  ],
})
export class DashboardPage implements OnInit {
  private analytics = inject(AnalyticsService);
  private presence = inject(PresenceService);
  private destroyRef = inject(DestroyRef);

  readonly summary = signal<SummaryToday | null>(null);
  readonly chartOpts = signal<EChartsOption | null>(null);
  /** People currently inside the building today (entry without later exit). */
  readonly presentCount = signal<number>(0);

  ngOnInit(): void {
    this.refresh();

    const id = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
    this.destroyRef.onDestroy(() => clearInterval(id));
  }

  /** Fetch summary + chart + presence data in parallel and update signals. */
  private refresh(): void {
    forkJoin({
      summary: this.analytics.summaryToday(),
      hours: this.analytics.accessByHour(),
      present: this.presence.list(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ summary, hours, present }) => {
          this.summary.set(summary);
          this.chartOpts.set(this.buildChartOptions(hours));
          this.presentCount.set(present.length);
        },
        // Silent on error — auto-refresh shouldn't spam toasts.
        // If the user notices stale data, they can pull-to-refresh.
        error: (_: unknown) => {
          /* ignore */
        },
      });
  }

  /** Convert the 24-element hour-count array into ECharts options. */
  private buildChartOptions(hours: HourCount[]): EChartsOption {
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
      },
      grid: {
        left: 40,
        right: 16,
        top: 20,
        bottom: 28,
      },
      xAxis: {
        type: "category",
        data: hours.map((h) => `${h.hour}h`),
        axisLabel: { fontSize: 11 },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          name: "Acessos",
          type: "bar",
          data: hours.map((h) => h.count),
          itemStyle: {
            color: "#3880ff", // Ionic primary blue
            borderRadius: [4, 4, 0, 0], // rounded top corners
          },
        },
      ],
    };
  }
}

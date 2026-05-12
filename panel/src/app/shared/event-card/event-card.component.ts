import { Component, computed, input } from "@angular/core";
import { IonChip, IonIcon, IonItem, IonLabel } from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import { alertCircle, checkmarkCircle } from "ionicons/icons";

import { AccessEvent } from "../../core/models/event.model";

/**
 * Reusable event card.
 *
 * Visual design: icon-driven (no avatar, since unknown faces have no person).
 *   - granted  → green checkmark
 *   - unknown  → amber warning
 *
 * The relative-time formatter uses Intl.RelativeTimeFormat for nice
 * Portuguese strings ("há 5 minutos", "ontem"). For events older than
 * a week, falls back to "DD/MM HH:MM" formatting.
 */
@Component({
  selector: "app-event-card",
  templateUrl: "./event-card.component.html",
  styleUrls: ["./event-card.component.scss"],
  imports: [IonChip, IonIcon, IonItem, IonLabel],
})
export class EventCardComponent {
  readonly event = input.required<AccessEvent>();

  readonly iconName = computed(() =>
    this.event().status === "granted" ? "checkmark-circle" : "alert-circle",
  );

  readonly iconColor = computed(() =>
    this.event().status === "granted" ? "success" : "warning",
  );

  readonly displayName = computed(
    () => this.event().employee_name ?? "Rosto desconhecido",
  );

  readonly relativeTime = computed(() =>
    formatRelativeTime(this.event().timestamp_ms),
  );

  constructor() {
    addIcons({ checkmarkCircle, alertCircle });
  }
}

/**
 * Returns a Portuguese-localized relative time string for a unix-ms timestamp.
 * - < 1 minute  → "agora", "há 30 segundos"
 * - < 1 hour    → "há 5 minutos"
 * - < 1 day     → "há 3 horas"
 * - < 1 week    → "ontem", "há 3 dias"
 * - older       → "10/05 às 14:32"
 *
 * Kept as a module-private function rather than a pipe — only used here.
 * If a second consumer appears, refactor into `shared/pipes/relative-time.pipe.ts`.
 */
function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  if (seconds < 60) return rtf.format(-seconds, "second");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  if (hours < 24) return rtf.format(-hours, "hour");
  if (days < 7) return rtf.format(-days, "day");

  return new Date(timestampMs).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

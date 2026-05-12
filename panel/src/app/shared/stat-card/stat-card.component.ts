import { Component, input } from "@angular/core";
import { DecimalPipe } from "@angular/common";

/** Allowed color names for the value. Maps to Ionic color variables. */
export type StatColor = "primary" | "success" | "warning" | "danger";

/**
 * Reusable summary card. "Dumb" component — just renders a label
 * over a colored number.
 *
 * Usage:
 *   <app-stat-card label="Total hoje" [value]="42" color="primary" />
 *
 * The `color` input has a default of 'primary' so it's optional in templates.
 */
@Component({
  selector: "app-stat-card",
  templateUrl: "./stat-card.component.html",
  styleUrls: ["./stat-card.component.scss"],
  imports: [DecimalPipe],
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly color = input<StatColor>("primary");
}

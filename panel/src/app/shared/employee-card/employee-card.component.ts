import { Component, computed, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { IonAvatar, IonItem, IonLabel } from "@ionic/angular/standalone";

import { Employee } from "../../core/models/employee.model";

/**
 * Reusable employee card. "Dumb" component — knows nothing about HTTP.
 * It DOES know about routing (the link is part of its contract), but the
 * destination URL is hardcoded to the canonical employee detail route.
 *
 * Signal-based input + computed: see `initial` below — it auto-recomputes
 * whenever `employee()` changes.
 */
@Component({
  selector: "app-employee-card",
  templateUrl: "./employee-card.component.html",
  styleUrls: ["./employee-card.component.scss"],
  imports: [RouterLink, IonAvatar, IonItem, IonLabel],
})
export class EmployeeCardComponent {
  readonly employee = input.required<Employee>();

  readonly initial = computed(
    () => this.employee().name.charAt(0).toUpperCase() || "?",
  );
}

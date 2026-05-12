import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ReactiveFormsModule, FormBuilder, Validators } from "@angular/forms";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonMenuButton,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import { addOutline } from "ionicons/icons";

import { EmployeesService } from "../../core/api/employees.service";
import { Employee, Shift } from "../../core/models/employee.model";
import { EmployeeCardComponent } from "../../shared/employee-card/employee-card.component";

/**
 * Employees list page.
 *
 * Patterns introduced here:
 *   - Manual subscribe + signals for list state (vs `async` pipe).
 *     Lets us refresh on demand (after create, on pull, etc.) cleanly.
 *   - `takeUntilDestroyed(destroyRef)` so the subscription auto-cleans up.
 *   - `viewChild.required(...)` — signal-based version of @ViewChild.
 *   - Declarative `<ion-modal>` with `trigger=` for the create form.
 */
@Component({
  selector: "app-employees",
  templateUrl: "./employees.page.html",
  styleUrls: ["./employees.page.scss"],
  host: { class: 'ion-page' },
  imports: [
    ReactiveFormsModule,
    EmployeeCardComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonList,
    IonMenuButton,
    IonModal,
    IonRefresher,
    IonRefresherContent,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class EmployeesPage implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(EmployeesService);
  private toast = inject(ToastController);
  private destroyRef = inject(DestroyRef);

  /** Handle to the <ion-modal #createModal> so we can dismiss it on success. */
  readonly createModal = viewChild.required<IonModal>("createModal");

  // ---------- list state ----------
  readonly employees = signal<Employee[]>([]);
  readonly loading = signal(true);

  // ---------- create form state ----------
  readonly creating = signal(false);

  readonly createForm = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.minLength(2)]],
    shift: [null as Shift | null],
  });

  constructor() {
    // Icons used in this page must be registered explicitly.
    addIcons({ addOutline });
  }

  ngOnInit() {
    this.refresh();
  }

  /** Re-fetch the list. Called from ngOnInit, after create, and pull-to-refresh. */
  refresh(): void {
    this.loading.set(true);
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (emps) => {
          this.employees.set(emps);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.showToast("Erro ao carregar funcionários.", "danger");
        },
      });
  }

  /** Pull-to-refresh handler. `event.target.complete()` ends the spinner. */
  onRefresh(event: CustomEvent): void {
    this.api.list().subscribe({
      next: (emps) => {
        this.employees.set(emps);
        (event.target as HTMLIonRefresherElement).complete();
      },
      error: () => {
        (event.target as HTMLIonRefresherElement).complete();
        this.showToast("Erro ao recarregar.", "danger");
      },
    });
  }

  /** Submit the create form. Dismisses modal + refreshes list on success. */
  onCreateSubmit(): void {
    if (this.createForm.invalid || this.creating()) return;

    this.creating.set(true);
    const { name, shift } = this.createForm.getRawValue();

    this.api.create({ name, shift }).subscribe({
      next: (emp) => {
        this.creating.set(false);
        this.createForm.reset({ name: "", shift: null });
        this.createModal().dismiss();
        this.refresh();
        this.showToast(`${emp.name} cadastrado.`, "success");
      },
      error: () => {
        this.creating.set(false);
        this.showToast("Erro ao cadastrar.", "danger");
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

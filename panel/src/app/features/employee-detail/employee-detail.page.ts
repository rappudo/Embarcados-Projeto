import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import { DatePipe } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import {
  AlertController,
  IonAvatar,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonMenuButton,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  cameraOutline,
  pencilOutline,
  saveOutline,
  trashOutline,
} from "ionicons/icons";

import { EmployeesService } from "../../core/api/employees.service";
import { EventsService } from "../../core/api/events.service";
import { Employee, Shift } from "../../core/models/employee.model";
import { AccessEvent } from "../../core/models/event.model";
import { EventCardComponent } from "../../shared/event-card/event-card.component";
import { EnrollmentWizardComponent } from "../enrollment/enrollment-wizard.component";

/**
 * Employee detail page (route: /employees/:id).
 *
 * Sections:
 *   - Header: avatar + name (or inline edit form when editing)
 *   - Inline reactive edit form: name + shift, PATCH to /employees/:id
 *   - Recent access events list (last 20)
 *   - "Cadastrar rosto" button → opens enrollment wizard modal
 *   - Delete button with confirmation dialog
 *
 * Key pattern: route param → component input.
 *   Because `app.config.ts` has `withComponentInputBinding()`, the `:id`
 *   URL segment is delivered automatically into `this.id()`. No need for
 *   ActivatedRoute. The input is a string (URL segments always are);
 *   we parseInt to use it as the numeric DB id.
 *
 * Edit-form pattern: a single FormGroup we reset() whenever a fresh
 * Employee arrives. `markAsPristine()` after server-confirmed save so
 * the Save button disables again until the user types more.
 */
@Component({
  selector: "app-employee-detail",
  templateUrl: "./employee-detail.page.html",
  styleUrls: ["./employee-detail.page.scss"],
  host: { class: "ion-page" },
  imports: [
    DatePipe,
    ReactiveFormsModule,
    EnrollmentWizardComponent,
    EventCardComponent,
    IonAvatar,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonItemDivider,
    IonLabel,
    IonList,
    IonMenuButton,
    IonModal,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class EmployeeDetailPage implements OnInit {
  readonly id = input.required<string>();

  private fb = inject(FormBuilder);
  private api = inject(EmployeesService);
  private eventsApi = inject(EventsService);
  private router = inject(Router);
  private alert = inject(AlertController);
  private toast = inject(ToastController);
  private destroyRef = inject(DestroyRef);

  /** Handle to the enrollment modal so we can dismiss after a successful flow. */
  readonly enrollModal = viewChild.required<IonModal>("enrollModal");

  // ---------- state ----------
  readonly employee = signal<Employee | null>(null);
  readonly loading = signal(true);
  readonly deleting = signal(false);
  readonly saving = signal(false);

  readonly recentEvents = signal<AccessEvent[]>([]);
  readonly eventsLoading = signal(true);

  /** Whether the enrollment wizard modal is currently visible. */
  readonly enrollOpen = signal(false);

  readonly initial = computed(
    () => this.employee()?.name.charAt(0).toUpperCase() || "?",
  );

  // ---------- edit form ----------
  readonly editForm = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.minLength(2)]],
    shift: [null as Shift | null],
  });

  constructor() {
    addIcons({ cameraOutline, pencilOutline, saveOutline, trashOutline });

    // When `employee` changes (fresh load, or after PATCH), seed the form
    // and mark it pristine so Save is disabled again. Effect runs in the
    // injection context — no manual subscription cleanup needed.
    effect(() => {
      const emp = this.employee();
      if (emp) {
        this.editForm.reset({ name: emp.name, shift: emp.shift });
      }
    });
  }

  ngOnInit(): void {
    const numId = parseInt(this.id(), 10);
    if (isNaN(numId)) {
      this.router.navigate(["/employees"]);
      return;
    }

    this.fetchEmployee(numId);
    this.fetchRecentEvents(numId);
  }

  private fetchEmployee(numId: number): void {
    this.api
      .get(numId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (emp) => {
          this.employee.set(emp);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.showToast("Funcionário não encontrado.", "danger");
          this.router.navigate(["/employees"]);
        },
      });
  }

  private fetchRecentEvents(numId: number): void {
    this.eventsApi
      .list({ employee_id: numId, limit: 20 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (events) => {
          this.recentEvents.set(events);
          this.eventsLoading.set(false);
        },
        error: () => {
          this.eventsLoading.set(false);
          // Silent — the rest of the page is still usable without history.
        },
      });
  }

  /** PATCH the employee with whatever fields the form contains. */
  onSaveClick(): void {
    const emp = this.employee();
    if (!emp || this.editForm.invalid || this.saving() || this.editForm.pristine) return;

    this.saving.set(true);
    const { name, shift } = this.editForm.getRawValue();
    // We send both fields every time. The backend's COALESCE pattern
    // means absent fields are preserved — sending the unchanged value
    // is equivalent. Simpler than diffing.
    const payload: { name?: string; shift?: Shift } = {};
    if (name && name !== emp.name) payload.name = name;
    if (shift !== emp.shift && shift) payload.shift = shift;

    if (Object.keys(payload).length === 0) {
      this.saving.set(false);
      return;
    }

    this.api.update(emp.id, payload).subscribe({
      next: (updated) => {
        this.employee.set(updated); // the effect() reseeds + pristines the form
        this.saving.set(false);
        this.showToast("Alterações salvas.", "success");
      },
      error: () => {
        this.saving.set(false);
        this.showToast("Erro ao salvar.", "danger");
      },
    });
  }

  // ---------- enrollment wizard ----------

  openEnroll(): void {
    this.enrollOpen.set(true);
  }

  /** Wizard emitted `closed` — user cancelled. */
  onEnrollClose(): void {
    this.enrollOpen.set(false);
  }

  /** Wizard emitted `completed` — at least N captures uploaded successfully. */
  onEnrollDone(count: number): void {
    this.enrollOpen.set(false);
    this.showToast(`${count} foto(s) cadastrada(s).`, "success");
  }

  // ---------- delete ----------

  async onDeleteClick(): Promise<void> {
    const emp = this.employee();
    if (!emp || this.deleting()) return;

    const dialog = await this.alert.create({
      header: "Excluir funcionário",
      message:
        `Tem certeza que deseja excluir ${emp.name}? Esta ação não pode ser ` +
        `desfeita e removerá os dados biométricos cadastrados.`,
      buttons: [
        { text: "Cancelar", role: "cancel" },
        {
          text: "Excluir",
          role: "destructive",
          handler: () => this.confirmDelete(emp.id, emp.name),
        },
      ],
    });
    await dialog.present();
  }

  private confirmDelete(id: number, name: string): void {
    this.deleting.set(true);
    this.api.delete(id).subscribe({
      next: () => {
        this.showToast(`${name} excluído.`, "success");
        this.router.navigate(["/employees"]);
      },
      error: () => {
        this.deleting.set(false);
        this.showToast("Erro ao excluir.", "danger");
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

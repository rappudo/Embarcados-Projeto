import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { DatePipe } from "@angular/common";
import { catchError, of } from "rxjs";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonModal,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  addOutline,
  checkmarkCircle,
  cloudOfflineOutline,
  personAddOutline,
  refreshOutline,
  saveOutline,
} from "ionicons/icons";

import {
  API_BASE_URL_DEFAULT,
  API_BASE_URL_STORAGE_KEY,
} from "../../core/api/api.config";
import { SystemService } from "../../core/api/system.service";
import { UsersService } from "../../core/api/users.service";
import { EventsService } from "../../core/api/events.service";
import { MqttStatus } from "../../core/models/system.model";
import { User } from "../../core/models/user.model";

/** localStorage keys for Pi config. Prefixed with `facegate.` like the JWT key. */
const PI_MQTT_KEY = "facegate.piMqttHost";
const PI_HTTP_KEY = "facegate.piHttpEndpoint";

/** How often to ping /health and /system/mqtt-status. */
const STATUS_INTERVAL_MS = 10_000;

/**
 * Settings page.
 *
 * Sections:
 *   1. API base URL (localStorage; user must reload after save).
 *   2. Pi network config (localStorage; informational — not consumed
 *      by any code yet, but persisted so a future feature can read it).
 *   3. User management (GET /users; POST /users via inline modal).
 *   4. System status panel (backend /health, /system/mqtt-status,
 *      last event timestamp via /analytics/events?limit=1).
 *
 * The status panel auto-polls every 10s. We don't toast on errors —
 * if /health 502s, the "Backend offline" indicator IS the toast.
 */
@Component({
  selector: "app-settings",
  templateUrl: "./settings.page.html",
  styleUrls: ["./settings.page.scss"],
  host: { class: "ion-page" },
  imports: [
    DatePipe,
    ReactiveFormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonModal,
    IonNote,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class SettingsPage implements OnInit {
  private fb = inject(FormBuilder);
  private system = inject(SystemService);
  private usersApi = inject(UsersService);
  private eventsApi = inject(EventsService);
  private toast = inject(ToastController);
  private destroyRef = inject(DestroyRef);

  readonly createUserModal = viewChild.required<IonModal>("createUserModal");

  // ---------- Pi / API config ----------
  readonly apiDefault = API_BASE_URL_DEFAULT;

  readonly configForm = this.fb.nonNullable.group({
    apiBaseUrl: [this.read(API_BASE_URL_STORAGE_KEY)],
    piMqttHost: [this.read(PI_MQTT_KEY)],
    piHttpEndpoint: [this.read(PI_HTTP_KEY)],
  });

  // ---------- Users ----------
  readonly users = signal<User[]>([]);
  readonly usersLoading = signal(true);
  readonly creatingUser = signal(false);

  readonly createUserForm = this.fb.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(4)]],
  });

  // ---------- System status ----------
  readonly backendOk = signal<boolean | null>(null);
  readonly mqtt = signal<MqttStatus | null>(null);
  readonly lastEventMs = signal<number | null>(null);

  /** Pretty-printed status block — drives the colored indicator dots. */
  readonly mqttLabel = computed(() => {
    const s = this.mqtt();
    if (!s) return "—";
    return s.connected ? "Conectado" : "Desconectado";
  });

  constructor() {
    addIcons({
      addOutline,
      checkmarkCircle,
      cloudOfflineOutline,
      personAddOutline,
      refreshOutline,
      saveOutline,
    });
  }

  ngOnInit(): void {
    this.refreshUsers();
    this.refreshStatus();

    const id = setInterval(() => this.refreshStatus(), STATUS_INTERVAL_MS);
    this.destroyRef.onDestroy(() => clearInterval(id));
  }

  // ---------- config persistence ----------

  saveConfig(): void {
    const v = this.configForm.getRawValue();
    this.write(API_BASE_URL_STORAGE_KEY, v.apiBaseUrl);
    this.write(PI_MQTT_KEY, v.piMqttHost);
    this.write(PI_HTTP_KEY, v.piHttpEndpoint);
    this.configForm.markAsPristine();
    this.showToast(
      "Configurações salvas. Recarregue a página para aplicar a URL da API.",
      "success",
    );
  }

  /** Resets only the API URL (not the Pi fields) back to the default. */
  resetApiUrl(): void {
    this.configForm.patchValue({ apiBaseUrl: "" });
    this.configForm.markAsDirty();
  }

  // ---------- users ----------

  refreshUsers(): void {
    this.usersLoading.set(true);
    this.usersApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (users) => {
          this.users.set(users);
          this.usersLoading.set(false);
        },
        error: () => {
          this.usersLoading.set(false);
          this.showToast("Erro ao carregar usuários.", "danger");
        },
      });
  }

  onRefresh(event: CustomEvent): void {
    this.refreshStatus();
    this.usersApi.list().subscribe({
      next: (users) => {
        this.users.set(users);
        (event.target as HTMLIonRefresherElement).complete();
      },
      error: () => {
        (event.target as HTMLIonRefresherElement).complete();
      },
    });
  }

  onCreateUserSubmit(): void {
    if (this.createUserForm.invalid || this.creatingUser()) return;
    this.creatingUser.set(true);
    const { email, password } = this.createUserForm.getRawValue();

    this.usersApi.create({ email, password }).subscribe({
      next: (u) => {
        this.creatingUser.set(false);
        this.createUserForm.reset({ email: "", password: "" });
        this.createUserModal().dismiss();
        this.users.update((curr) => [...curr, u]);
        this.showToast(`Usuário ${u.email} criado.`, "success");
      },
      error: (err) => {
        this.creatingUser.set(false);
        const msg =
          err?.status === 409
            ? "Email já cadastrado."
            : "Erro ao criar usuário.";
        this.showToast(msg, "danger");
      },
    });
  }

  // ---------- system status ----------

  refreshStatus(): void {
    // health → text "ok"
    this.system
      .health()
      .pipe(catchError(() => of("")))
      .subscribe((res) => this.backendOk.set(res === "ok"));

    // mqtt status — returns null on failure so the UI shows "—"
    this.system
      .mqttStatus()
      .pipe(catchError(() => of(null)))
      .subscribe((s) => this.mqtt.set(s));

    // most recent event timestamp
    this.eventsApi
      .list({ limit: 1 })
      .pipe(catchError(() => of([])))
      .subscribe((page) => {
        this.lastEventMs.set(page.length > 0 ? page[0].timestamp_ms : null);
      });
  }

  // ---------- storage helpers ----------

  private read(key: string): string {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(key) ?? "";
  }
  private write(key: string, value: string): void {
    if (typeof window === "undefined") return;
    if (value && value.trim().length > 0) {
      window.localStorage.setItem(key, value.trim());
    } else {
      window.localStorage.removeItem(key);
    }
  }

  private async showToast(
    message: string,
    color: "success" | "danger",
  ): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 3000,
      position: "bottom",
      color,
    });
    await t.present();
  }
}

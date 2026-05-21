import { Component, inject, signal } from "@angular/core";
import { ReactiveFormsModule, FormBuilder, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from "@ionic/angular/standalone";

import { AuthService } from "../../core/auth/auth.service";

/**
 * Login page using Angular's Reactive Forms.
 *
 * The pattern:
 *   1. Build a `FormGroup` in the constructor / field initializer.
 *      Each field is a `FormControl` with validators.
 *   2. The template references controls by `formControlName="..."`.
 *   3. On submit, read `form.value`, call the service, handle the result.
 *
 * State management notes:
 *   - `loading` is a signal so the template can react to it via
 *     `loading()` in `@if` and `[disabled]` bindings.
 *   - Errors are shown via a transient Ionic toast — non-blocking and
 *     auto-dismisses. We pull `ToastController` from Ionic.
 */
@Component({
  selector: "app-login",
  templateUrl: "./login.page.html",
  styleUrls: ["./login.page.scss"],
  host: { class: 'ion-page' },
  imports: [
    ReactiveFormsModule,
    IonButton,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastController);

  /** Reactive form. Validators run automatically on every value change. */
  readonly form = this.fb.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(4)]],
  });

  /** True while a login HTTP request is in flight. */
  readonly loading = signal(false);

  onSubmit(): void {
    // Defense in depth — the button is also disabled when invalid,
    // but pressing Enter could in theory bypass that.
    if (this.form.invalid || this.loading()) {
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.loading.set(true);

    this.auth.login(email, password).subscribe({
      next: () => {
        // Token is already stored by AuthService.login()'s tap().
        // Navigate into the app.
        this.router.navigate(["/dashboard"]);
      },
      error: (err) => {
        this.loading.set(false);

        // 401 = wrong credentials. Anything else = network/server issue.
        const message =
          err?.status === 401
            ? "Email ou senha incorretos."
            : "Não foi possível conectar ao servidor.";

        this.showToast(message);
      },
      // We deliberately don't reset loading on `next`: the route is
      // about to change anyway, and resetting could cause a flash
      // before navigation completes.
    });
  }

  /** Helper — shows an error toast for 3 seconds at the bottom. */
  private async showToast(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 3000,
      position: "bottom",
      color: "danger",
    });
    await t.present();
  }
}

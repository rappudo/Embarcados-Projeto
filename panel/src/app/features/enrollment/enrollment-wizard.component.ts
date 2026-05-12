import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from "@ionic/angular/standalone";
import { addIcons } from "ionicons";
import {
  cameraOutline,
  checkmarkOutline,
  closeOutline,
  refreshOutline,
  trashOutline,
} from "ionicons/icons";

import { EnrollmentService } from "../../core/api/enrollment.service";

/**
 * In-browser enrollment wizard.
 *
 * Flow:
 *   1. Request camera access via getUserMedia.
 *   2. Live preview into a <video> element.
 *   3. Capture button grabs the current frame into a <canvas> and
 *      stores the base64 (data URL) in `captures`.
 *   4. User may discard a shot; capture more until ≥ MIN_CAPTURES.
 *   5. "Concluir" uploads each shot one at a time to /employees/:id/enroll.
 *
 * Why option (a) and not Pi-camera capture:
 *   Detailed in the brief — the demo path uses the browser webcam so it
 *   works on a laptop without needing Pi network reachability. The
 *   production path would publish an MQTT request to a topic the edge
 *   listens on, the edge would capture+embed and POST to /embeddings
 *   directly. See the inline note in the template.
 *
 * Lifecycle hygiene:
 *   - The MediaStream is stopped in DestroyRef.onDestroy() so the
 *     camera light goes off even if the modal closes via ESC.
 *   - In-flight uploads are NOT cancelled on close — the server-side
 *     write is already useful even if the user navigates away.
 */
@Component({
  selector: "app-enrollment-wizard",
  templateUrl: "./enrollment-wizard.component.html",
  styleUrls: ["./enrollment-wizard.component.scss"],
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonNote,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class EnrollmentWizardComponent {
  /** Employee that the captured embeddings will be associated with. */
  readonly employeeId = input.required<number>();
  /** Name to show in the header. Falls back to the id if absent. */
  readonly employeeName = input<string>("");

  /** Emitted when the user dismisses (cancel button). */
  readonly closed = output<void>();
  /** Emitted on successful completion with the count of stored captures. */
  readonly completed = output<number>();

  /** Minimum captures before "Concluir" enables. */
  static readonly MIN_CAPTURES = 3;

  // -------- DOM handles --------
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>("video");
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>("canvas");

  // -------- state --------
  /** "idle" → permission not yet requested; "live" → camera streaming;
   *  "denied" → user blocked access; "error" → unrecoverable issue. */
  readonly camState = signal<"idle" | "live" | "denied" | "error">("idle");
  readonly camError = signal<string>("");
  /** Captured frames as base64 data URLs. */
  readonly captures = signal<string[]>([]);
  /** True while uploads are in flight. */
  readonly uploading = signal(false);
  /** Progress: how many of N captures have been confirmed by the server. */
  readonly uploadProgress = signal(0);

  // -------- collaborators --------
  private enrollment = inject(EnrollmentService);
  private toast = inject(ToastController);
  private destroyRef = inject(DestroyRef);

  /** Locally cached so we can stop tracks on destroy. */
  private stream: MediaStream | null = null;

  constructor() {
    addIcons({ cameraOutline, checkmarkOutline, closeOutline, refreshOutline, trashOutline });
    this.destroyRef.onDestroy(() => this.stopStream());
  }

  /** Requests camera permission and pipes the stream into the <video>. */
  async startCamera(): Promise<void> {
    this.camError.set("");
    try {
      // facingMode: 'user' = front camera on phones. Browsers ignore it
      // when there's no choice (desktop webcam). 480p preview is plenty
      // for a 224x224 face crop later.
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      const el = this.video().nativeElement;
      el.srcObject = this.stream;
      // play() returns a promise; .catch keeps the autoplay-blocked
      // error visible to us rather than throwing it on the floor.
      await el.play().catch(() => {
        /* autoplay blocked — show error */
        this.camError.set("Toque na pré-visualização para iniciar.");
      });
      this.camState.set("live");
    } catch (err) {
      const e = err as DOMException;
      // NotAllowedError = user clicked "Block" on the permission prompt.
      // Other names (NotFoundError, NotReadableError) point to no camera.
      if (e.name === "NotAllowedError") {
        this.camState.set("denied");
      } else {
        this.camState.set("error");
        this.camError.set(e.message || "Câmera indisponível.");
      }
    }
  }

  /** Grabs the current video frame into the canvas, then keeps a base64 copy. */
  capture(): void {
    if (this.camState() !== "live") return;
    const video = this.video().nativeElement;
    const canvas = this.canvas().nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // 0.85 quality JPEG keeps the payload around 60-80kb at 640x480.
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    this.captures.update((arr) => [...arr, dataUrl]);
  }

  /** Drop a capture by index (the X button on each thumbnail). */
  removeCapture(idx: number): void {
    this.captures.update((arr) => arr.filter((_, i) => i !== idx));
  }

  /** Uploads each capture sequentially. Stops the camera on success. */
  async submit(): Promise<void> {
    const shots = this.captures();
    if (shots.length < EnrollmentWizardComponent.MIN_CAPTURES || this.uploading()) return;

    this.uploading.set(true);
    this.uploadProgress.set(0);

    // Sequential uploads — keeps the failure semantics simple. A retry
    // loop is overkill for a 3-5 image batch; if one fails we abort and
    // keep what's already stored (idempotency is server-side: each shot
    // produces a brand-new embeddings row).
    for (const shot of shots) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.enrollment.enroll(this.employeeId(), shot).subscribe({
            next: () => {
              this.uploadProgress.update((n) => n + 1);
              resolve();
            },
            error: (e) => reject(e),
          });
        });
      } catch {
        this.uploading.set(false);
        this.showToast("Erro ao enviar captura. Tente novamente.", "danger");
        return;
      }
    }

    this.uploading.set(false);
    this.stopStream();
    this.showToast(`${shots.length} capturas armazenadas.`, "success");
    this.completed.emit(shots.length);
  }

  /** Cancel button — close without uploading anything. */
  cancel(): void {
    this.stopStream();
    this.closed.emit();
  }

  private stopStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  // Bound by template; used to enable/disable the Concluir button.
  readonly minCaptures = EnrollmentWizardComponent.MIN_CAPTURES;

  private async showToast(message: string, color: "success" | "danger"): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 2500,
      position: "bottom",
      color,
    });
    await t.present();
  }
}

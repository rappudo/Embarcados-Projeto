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
  ModalController,
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
import { FaceEmbeddingService } from "../../core/vision/face-embedding.service";

/**
 * In-browser enrollment wizard.
 *
 * Detection and embedding extraction run locally via onnxruntime-web.
 * The captured frame stays in the browser; only the 512-d vector is
 * uploaded. This is the LGPD-friendly path — biometric data never
 * transits the network.
 */
interface Shot {
  /** Data URL kept only for the thumbnail UI. Discarded on submit. */
  thumb: string;
  /** L2-normalized 512-d ArcFace embedding. */
  embedding: Float32Array;
}

@Component({
  selector: "app-enrollment-wizard",
  templateUrl: "./enrollment-wizard.component.html",
  styleUrls: ["./enrollment-wizard.component.scss"],
  host: { class: "ion-page" },
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
  private readonly video =
    viewChild.required<ElementRef<HTMLVideoElement>>("video");
  private readonly canvas =
    viewChild.required<ElementRef<HTMLCanvasElement>>("canvas");

  // -------- state --------
  readonly camState = signal<"idle" | "live" | "denied" | "error">("idle");
  readonly camError = signal<string>("");
  /** Captures with both a thumbnail and the extracted embedding. */
  readonly captures = signal<Shot[]>([]);
  /** True while a single capture is being processed by ONNX. */
  readonly processingCapture = signal(false);
  /** True while uploads are in flight. */
  readonly uploading = signal(false);
  /** Progress: how many of N captures have been confirmed by the server. */
  readonly uploadProgress = signal(0);

  // -------- collaborators --------
  private enrollment = inject(EnrollmentService);
  private faces = inject(FaceEmbeddingService);
  private toast = inject(ToastController);
  private destroyRef = inject(DestroyRef);
  // Optional: present, when the wizard is opened via ModalController.create().
  // Null when the component is rendered as a route or embedded directly.
  private modalCtrl = inject(ModalController, { optional: true });

  /** Locally cached so we can stop tracks on destroy. */
  private stream: MediaStream | null = null;

  constructor() {
    addIcons({
      cameraOutline,
      checkmarkOutline,
      closeOutline,
      refreshOutline,
      trashOutline,
    });
    this.destroyRef.onDestroy(() => this.stopStream());
    // Kick off model download in the background while the admin frames
    // their face. arc.onnx is ~130 MB; first run is the slow one.
    this.faces.preload().catch(() => {
      /* surface only at capture time */
    });
  }

  /** Requests camera permission and pipes the stream into the <video>. */
  async startCamera(): Promise<void> {
    this.camError.set("");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      const el = this.video().nativeElement;
      el.srcObject = this.stream;
      await el.play().catch(() => {
        this.camError.set("Toque na pré-visualização para iniciar.");
      });
      this.camState.set("live");
    } catch (err) {
      const e = err as DOMException;
      if (e.name === "NotAllowedError") {
        this.camState.set("denied");
      } else {
        this.camState.set("error");
        this.camError.set(e.message || "Câmera indisponível.");
      }
    }
  }

  /**
   * Grabs the current video frame, runs face detection + embedding in the
   * browser, and stores only the resulting vector (plus a thumbnail).
   */
  async capture(): Promise<void> {
    if (this.camState() !== "live" || this.processingCapture()) return;
    const video = this.video().nativeElement;
    const canvas = this.canvas().nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    this.processingCapture.set(true);
    try {
      const embedding = await this.faces.embedFromCanvas(canvas);
      if (!embedding) {
        this.showToast("Nenhum rosto detectado. Tente novamente.", "danger");
        return;
      }
      const thumb = canvas.toDataURL("image/jpeg", 0.7);
      this.captures.update((arr) => [...arr, { thumb, embedding }]);
    } catch (e) {
      console.error("face embedding failed", e);
      this.showToast("Falha ao processar imagem. Tente novamente.", "danger");
    } finally {
      this.processingCapture.set(false);
    }
  }

  /** Drop a capture by index (the X button on each thumbnail). */
  removeCapture(idx: number): void {
    this.captures.update((arr) => arr.filter((_, i) => i !== idx));
  }

  /** Uploads each capture's embedding sequentially. */
  async submit(): Promise<void> {
    const shots = this.captures();
    if (
      shots.length < EnrollmentWizardComponent.MIN_CAPTURES ||
      this.uploading()
    )
      return;

    this.uploading.set(true);
    this.uploadProgress.set(0);

    for (const shot of shots) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.enrollment.enrollVector(this.employeeId(), shot.embedding).subscribe({
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
    this.modalCtrl?.dismiss({ status: "completed", count: shots.length });
  }

  /** Cancel button — close without uploading anything. */
  cancel(): void {
    this.stopStream();
    this.closed.emit();
    this.modalCtrl?.dismiss({ status: "cancelled" });
  }

  private stopStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  readonly minCaptures = EnrollmentWizardComponent.MIN_CAPTURES;

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

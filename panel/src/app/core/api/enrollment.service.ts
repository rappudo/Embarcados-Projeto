import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

import { API_BASE_URL } from "./api.config";

/** Response from POST /employees/:id/enroll. */
export interface EnrollResponse {
  id:         number;
  vector:     number[];
  created_at: string;
}

/**
 * EnrollmentService — uploads a captured frame to the backend.
 *
 * The backend currently derives a *stub* 128-d embedding from the image
 * bytes; the wire shape matches the production path so swapping in real
 * ONNX inference later is a backend-only change.
 *
 * Payload is base64. We accept either a raw base64 string or a
 * data-URL ("data:image/jpeg;base64,...") — the backend tolerates both.
 */
@Injectable({ providedIn: "root" })
export class EnrollmentService {
  private http = inject(HttpClient);

  enroll(employeeId: number, imageBase64: string): Observable<EnrollResponse> {
    return this.http.post<EnrollResponse>(
      `${API_BASE_URL}/employees/${employeeId}/enroll`,
      { image_base64: imageBase64 },
    );
  }
}

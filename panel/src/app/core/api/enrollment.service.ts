import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

import { API_BASE_URL } from "./api.config";

/** Response from POST /employees/:id/embeddings. */
export interface EnrollResponse {
  id:         number;
  vector:     number[];
  created_at: string;
}

/**
 * Uploads a face embedding produced in the browser. The face image
 * never leaves the user's device — only the 512-d vector is sent.
 */
@Injectable({ providedIn: "root" })
export class EnrollmentService {
  private http = inject(HttpClient);

  enrollVector(employeeId: number, vector: Float32Array): Observable<EnrollResponse> {
    return this.http.post<EnrollResponse>(
      `${API_BASE_URL}/employees/${employeeId}/embeddings`,
      { vector: Array.from(vector) },
    );
  }
}

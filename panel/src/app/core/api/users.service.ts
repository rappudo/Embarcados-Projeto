import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

import { API_BASE_URL } from "./api.config";
import { CreateUserDto, User } from "../models/user.model";

/**
 * UsersService — wraps `/users` endpoints used by the settings page.
 *
 * Single-tier auth for now: any logged-in operator can list/create.
 * If RBAC arrives, the guard belongs server-side (the interceptor
 * already attaches the JWT for these calls).
 */
@Injectable({ providedIn: "root" })
export class UsersService {
  private http = inject(HttpClient);
  private readonly base = `${API_BASE_URL}/users`;

  list(): Observable<User[]> {
    return this.http.get<User[]>(this.base);
  }

  create(dto: CreateUserDto): Observable<User> {
    return this.http.post<User>(this.base, dto);
  }
}

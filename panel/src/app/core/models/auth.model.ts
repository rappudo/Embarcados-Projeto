/** Body for POST /auth/login */
export interface LoginRequest {
  email:    string;
  password: string;
}

/** Response from POST /auth/login */
export interface LoginResponse {
  token: string;
}

/** Decoded JWT payload (informational — verified server-side, not client-side) */
export interface JwtClaims {
  sub:   number;
  email: string;
  exp:   number;
}

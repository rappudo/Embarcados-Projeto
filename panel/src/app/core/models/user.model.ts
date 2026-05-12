/** Mirrors `UserRow` in `backend/src/routes/users.rs`. */
export interface User {
  id:         number;
  email:      string;
  created_at: string;
}

/** Body for POST /users. */
export interface CreateUserDto {
  email:    string;
  password: string;
}

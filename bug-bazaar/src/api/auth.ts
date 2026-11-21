import type { LoginRequest, LoginResponse, User } from "../types/api.ts";
import { request } from "./client.ts";
import { loginResponseSchema, userSchema } from "./schemas.ts";

/** POST /api/login. Not an authenticated call: a 401 here means wrong credentials. */
export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return request("/login", { method: "POST", body: credentials, schema: loginResponseSchema });
}

/** GET /api/me. Validates the stored token. A 401 triggers onUnauthorized. */
export function getMe({ signal }: { signal?: AbortSignal } = {}): Promise<User> {
  return request("/me", { auth: true, schema: userSchema, ...(signal ? { signal } : {}) });
}

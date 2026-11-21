// The single HTTP client. Every request in the app goes through `request()`.
// (An ESLint rule bans `fetch` everywhere else in src/.)
//
// Responsibilities, all in one place:
//   - base URL + query-string building
//   - JSON encoding/decoding
//   - auth header (token supplied by the session layer via configureApiClient)
//   - timeout + caller cancellation (AbortSignal)
//   - normalizing every failure into ApiRequestError
//   - validating 2xx bodies against the contract schema
//   - notifying the session layer on 401 for authenticated calls (D3-3)

import type { ZodMiniType } from "zod/mini";
import { ApiRequestError } from "./errors.ts";
import { apiErrorBodySchema } from "./schemas.ts";

export type ApiClientConfig = {
  /** "/api" (same origin) or an absolute URL. */
  baseUrl: string;
  timeoutMs: number;
  /** Returns the current session token, or null when logged out. */
  getToken: () => string | null;
  /**
   * Called when an authenticated request gets 401, so the session can be
   * cleared. `token` is the one that request sent, so a late 401 for an old
   * token can be told apart from one for the current session.
   */
  onUnauthorized: (error: ApiRequestError, token: string | null) => void;
};

const defaultConfig: ApiClientConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api",
  timeoutMs: 10_000,
  getToken: () => null,
  onUnauthorized: () => undefined,
};

let config: ApiClientConfig = defaultConfig;

/**
 * Wire app-level concerns into the client at startup (e.g. the session
 * store's token getter). Returns a function that restores the previous
 * config, which tests use for isolation.
 */
export function configureApiClient(overrides: Partial<ApiClientConfig>): () => void {
  const previous = config;
  config = { ...config, ...overrides };
  return () => {
    config = previous;
  };
}

/**
 * The WebSocket URL for an API path (D4-4), from the same base URL as HTTP:
 * "/api" + "/stock" on https://shop.example → wss://shop.example/api/stock.
 */
export function apiWebSocketUrl(path: string): string {
  const base = config.baseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}${path}`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export type QueryValue = string | number | boolean | null | undefined;

export type RequestOptions<T> = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Contract schema for the success body. Required: no unvalidated data enters the app. */
  schema: ZodMiniType<T>;
  /** Attach the bearer token. 401s on these calls trigger onUnauthorized. */
  auth?: boolean;
  headers?: Record<string, string>;
  /** Caller cancellation, e.g. from an effect cleanup or a newer search. */
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function buildUrl(path: string, query: Record<string, QueryValue> = {}): string {
  const base = config.baseUrl.replace(/\/+$/, "");
  const origin = (globalThis as { location?: Location }).location?.origin;
  const url = new URL(`${base}${path}`, origin);

  for (const [key, value] of Object.entries(query)) {
    // Skip "not set" values so URLs stay short and cache keys stay stable.
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text; // e.g. an HTML error page from a proxy
  }
}

export async function request<T>(path: string, options: RequestOptions<T>): Promise<T> {
  const { method = "GET", query, body, schema, auth = false, headers = {}, signal } = options;
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? config.timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const context = { method, path };

  /** Classify a thrown fetch/body error using which signal fired. */
  const failure = (cause: unknown): ApiRequestError => {
    if (signal?.aborted) {
      return new ApiRequestError({
        ...context,
        kind: "aborted",
        message: "Request cancelled.",
        cause,
      });
    }
    if (timeoutSignal.aborted) {
      return new ApiRequestError({
        ...context,
        kind: "timeout",
        message: "Request timed out.",
        cause,
      });
    }
    return new ApiRequestError({
      ...context,
      kind: "network",
      message: "Network request failed.",
      cause,
    });
  };

  const token = auth ? config.getToken() : null;
  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? null : JSON.stringify(body),
      signal: combinedSignal,
    });
    payload = await readBody(response);
  } catch (cause) {
    throw failure(cause);
  }

  if (!response.ok) {
    const parsed = apiErrorBodySchema.safeParse(payload);
    const error = new ApiRequestError({
      ...context,
      kind: "http",
      status: response.status,
      code: parsed.success ? parsed.data.error.code : null,
      message: parsed.success ? parsed.data.error.message : `HTTP ${response.status}`,
      details: parsed.success ? (parsed.data.error.details ?? {}) : {},
    });
    // Only authenticated calls mean "session expired". A 401 from login means
    // wrong credentials and must not log anyone out.
    if (response.status === 401 && auth) config.onUnauthorized(error, token);
    throw error;
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiRequestError({
      ...context,
      kind: "invalid-response",
      status: response.status,
      message: `Unexpected response shape from ${method} ${path}.`,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

// One error type for every way a request can fail. Callers branch on `kind`
// (and `status`/`code` for HTTP errors) instead of guessing from messages.
// D3-4 maps these to user-facing copy; raw messages never reach the screen.

export type ApiErrorKind =
  /** Server answered with a non-2xx status. See `status`, `code` and `details`. */
  | "http"
  /** No response at all: offline, DNS, CORS, connection reset. */
  | "network"
  /** No response within the client timeout. */
  | "timeout"
  /** The caller cancelled it (e.g. the user switched products). Usually ignored. */
  | "aborted"
  /** 2xx, but the body doesn't match the contract schema. A server/contract bug. */
  | "invalid-response";

type ApiRequestErrorInit = {
  kind: ApiErrorKind;
  message: string;
  method: string;
  path: string;
  status?: number | null;
  code?: string | null;
  details?: Record<string, string>;
  cause?: unknown;
};

export class ApiRequestError extends Error {
  readonly kind: ApiErrorKind;
  readonly method: string;
  readonly path: string;
  /** HTTP status for `kind: "http"` and `"invalid-response"`, otherwise null. */
  readonly status: number | null;
  /** Contract error code (e.g. "OUT_OF_STOCK") when the server sent an ApiError body. */
  readonly code: string | null;
  /** Field → message (400) or productId → message (409). Empty when absent. */
  readonly details: Readonly<Record<string, string>>;

  constructor({
    kind,
    message,
    method,
    path,
    status = null,
    code = null,
    details = {},
    cause,
  }: ApiRequestErrorInit) {
    super(message, { cause });
    this.name = "ApiRequestError";
    this.kind = kind;
    this.method = method;
    this.path = path;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiRequestError(value: unknown): value is ApiRequestError {
  return value instanceof ApiRequestError;
}

/** True for cancellations, which callers usually swallow rather than show. */
export function isAbortError(value: unknown): boolean {
  return isApiRequestError(value) && value.kind === "aborted";
}

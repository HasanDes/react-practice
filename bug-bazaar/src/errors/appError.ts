// One way to handle every API error (D3-4).
//
// Anything a request can throw goes through classifyError() and comes out as
// one of a few kinds, the only thing the UI branches on. Pages never inspect
// HTTP statuses or error codes themselves, so the same failure looks the same
// everywhere.
//
// The result carries no server text: only field names (400) and product ids
// (409), used as lookup keys. Raw messages can't reach the screen through it,
// because they never make it into this type.

import { isApiRequestError } from "../api/index.ts";

export type AppError =
  /** 400: the server rejected what was sent. `fields` names the bad inputs. */
  | { kind: "invalid-input"; fields: string[] }
  /** 401: not accepted. On login: wrong credentials. Elsewhere: the session ended. */
  | { kind: "unauthenticated" }
  /** 404: the thing doesn't exist. Not retryable: show a Not Found page. */
  | { kind: "not-found" }
  /** 409: not enough stock. `productIds` names the items that ran short. */
  | { kind: "out-of-stock"; productIds: string[] }
  /** No response: offline, DNS, connection reset. */
  | { kind: "offline" }
  /** No response in time. */
  | { kind: "timeout" }
  /** 5xx, or a 2xx whose body breaks the contract. Not the user's fault. */
  | { kind: "server" }
  /** Anything else: another 4xx, or a bug in our own code. */
  | { kind: "unexpected" }
  /** We cancelled it ourselves (navigation, unmount). Never shown. */
  | { kind: "cancelled" };

export type AppErrorKind = AppError["kind"];

export function classifyError(error: unknown): AppError {
  if (!isApiRequestError(error)) return { kind: "unexpected" };

  switch (error.kind) {
    case "aborted":
      return { kind: "cancelled" };
    case "network":
      return { kind: "offline" };
    case "timeout":
      return { kind: "timeout" };
    case "invalid-response":
      return { kind: "server" };
    case "http":
      break;
  }

  const status = error.status ?? 0;
  if (status === 400) return { kind: "invalid-input", fields: Object.keys(error.details) };
  if (status === 401) return { kind: "unauthenticated" };
  if (status === 404) return { kind: "not-found" };
  if (status === 409) return { kind: "out-of-stock", productIds: Object.keys(error.details) };
  if (status >= 500) return { kind: "server" };
  return { kind: "unexpected" };
}

/**
 * Whether trying the same thing again can help. Only failures that are about
 * timing (connection, slowness, a server hiccup) qualify. Bad input, a
 * missing item or a session problem will fail the same way again.
 */
export function isRetryable(error: AppError): boolean {
  switch (error.kind) {
    case "offline":
    case "timeout":
    case "server":
    case "unexpected":
      return true;
    case "invalid-input":
    case "unauthenticated":
    case "not-found":
    case "out-of-stock":
    case "cancelled":
      return false;
  }
}

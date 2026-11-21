import { isApiRequestError } from "../api/index.ts";

export type ErrorDescription = {
  title: string;
  description: string;
  /** Whether "Try again" can plausibly help. */
  retryable: boolean;
};

/**
 * Turn any failure into user-facing copy for a failed *load*. Branches on
 * the error's kind/status, never shows its raw message (which is for logs).
 * D3-4 extends this for form (400), session (401) and stock (409) errors.
 *
 * @param subject what was being loaded, e.g. "products", "this product"
 */
export function describeLoadError(error: unknown, subject: string): ErrorDescription {
  const lead = `We couldn't load ${subject}.`;

  if (!isApiRequestError(error)) {
    return {
      title: "Something went wrong",
      description: `${lead} Please try again.`,
      retryable: true,
    };
  }

  switch (error.kind) {
    case "network":
      return {
        title: "You seem to be offline",
        description: `${lead} Check your connection, then try again.`,
        retryable: true,
      };
    case "timeout":
      return {
        title: "This is taking too long",
        description: `${lead} The server didn't respond in time. Please try again.`,
        retryable: true,
      };
    case "invalid-response":
      return {
        title: "Something went wrong",
        description: `${lead} We received an unexpected response. Please try again in a moment.`,
        retryable: true,
      };
    case "aborted":
      // Normally never shown (callers ignore aborts), but stay safe.
      return { title: "Request cancelled", description: lead, retryable: true };
    case "http":
      if (error.status !== null && error.status >= 500) {
        return {
          title: "Our server hit a problem",
          description: `${lead} It's not you. Please try again.`,
          retryable: true,
        };
      }
      return {
        title: "Something went wrong",
        description: `${lead} Please try again.`,
        retryable: true,
      };
  }
}

// The words for a failed *load*, by error kind (D3-4). One table, used by
// every page through LoadGate → ErrorState. Forms (login) and actions
// (checkout) explain errors in their own context, but switch on the same
// AppError kinds, so the policy is shared even where the wording differs.

import { isRetryable, type AppError } from "./appError.ts";

export type ErrorDescription = {
  title: string;
  description: string;
  /** Show "Try again" (only when repeating the request can help). */
  retryable: boolean;
  /** Offer "Sign in" (the session ended). */
  signIn: boolean;
};

/** @param subject what was being loaded, e.g. "products", "this product" */
export function describeLoadError(error: AppError, subject: string): ErrorDescription {
  const lead = `We couldn't load ${subject}.`;
  const describe = (title: string, description: string): ErrorDescription => ({
    title,
    description,
    retryable: isRetryable(error),
    signIn: error.kind === "unauthenticated",
  });

  switch (error.kind) {
    case "offline":
      return describe("You seem to be offline", `${lead} Check your connection, then try again.`);
    case "timeout":
      return describe(
        "This is taking too long",
        `${lead} The server didn't respond in time. Please try again.`,
      );
    case "server":
      return describe("Our server hit a problem", `${lead} It's not you. Please try again.`);
    case "unauthenticated":
      return describe("Please sign in again", `${lead} Your session has ended.`);
    case "not-found":
      // Pages normally show their own Not Found state instead (LoadGate's notFound).
      return describe("Not found", `We couldn't find ${subject}. The link may be wrong.`);
    case "invalid-input":
    case "out-of-stock":
      return describe("Something went wrong", `${lead} The request wasn't accepted.`);
    case "unexpected":
      return describe("Something went wrong", `${lead} Please try again.`);
    case "cancelled":
      // Normally never shown (callers ignore cancellations), but stay safe.
      return describe("Request cancelled", lead);
  }
}

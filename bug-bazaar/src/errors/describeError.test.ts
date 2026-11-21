// D3-4: one classification and one wording table for every API error.

import { describe, expect, it } from "vitest";
import { ApiRequestError, type ApiErrorKind } from "../api/index.ts";
import { classifyError, isRetryable, type AppErrorKind } from "./appError.ts";
import { describeLoadError } from "./describeError.ts";

const RAW = "raw server text that must never be shown";

const apiError = (kind: ApiErrorKind, status: number | null = null, details = {}) =>
  new ApiRequestError({ kind, status, method: "GET", path: "/x", message: RAW, details });

describe("classifyError: every failure becomes one of a few kinds", () => {
  it.each([
    ["http", 400, "invalid-input"],
    ["http", 401, "unauthenticated"],
    ["http", 404, "not-found"],
    ["http", 409, "out-of-stock"],
    ["http", 500, "server"],
    ["http", 503, "server"],
    ["http", 418, "unexpected"],
    ["http", 429, "unexpected"],
    ["network", null, "offline"],
    ["timeout", null, "timeout"],
    ["invalid-response", 200, "server"],
    ["aborted", null, "cancelled"],
  ] as const)("%s %s → %s", (kind, status, expected) => {
    expect(classifyError(apiError(kind, status)).kind).toBe(expected);
  });

  it("keeps only the keys of details (field names, product ids), never their text", () => {
    expect(classifyError(apiError("http", 400, { email: RAW, password: RAW }))).toEqual({
      kind: "invalid-input",
      fields: ["email", "password"],
    });
    expect(classifyError(apiError("http", 409, { "p-0001": RAW }))).toEqual({
      kind: "out-of-stock",
      productIds: ["p-0001"],
    });
  });

  it("treats anything that isn't an API error (a bug in our code) as unexpected", () => {
    expect(classifyError(new TypeError("x is undefined")).kind).toBe("unexpected");
    expect(classifyError("a thrown string").kind).toBe("unexpected");
  });
});

describe("isRetryable: Try again only when repeating can help", () => {
  it.each([
    ["offline", true],
    ["timeout", true],
    ["server", true],
    ["unexpected", true],
    ["invalid-input", false],
    ["unauthenticated", false],
    ["not-found", false],
    ["out-of-stock", false],
    ["cancelled", false],
  ] as const)("%s → %s", (kind: AppErrorKind, expected) => {
    const error =
      kind === "invalid-input"
        ? { kind, fields: [] }
        : kind === "out-of-stock"
          ? { kind, productIds: [] }
          : { kind };
    expect(isRetryable(error)).toBe(expected);
  });
});

describe("describeLoadError", () => {
  it.each([
    ["network", null, "You seem to be offline", true],
    ["timeout", null, "This is taking too long", true],
    ["invalid-response", 200, "Our server hit a problem", true],
    ["http", 500, "Our server hit a problem", true],
    ["http", 401, "Please sign in again", false],
    ["http", 404, "Not found", false],
    ["http", 418, "Something went wrong", true],
  ] as const)("%s %s → %s (retry: %s)", (kind, status, title, retryable) => {
    const description = describeLoadError(classifyError(apiError(kind, status)), "products");
    expect(description.title).toBe(title);
    expect(description.retryable).toBe(retryable);
  });

  it("offers Sign in only when the session ended", () => {
    const signIn = (status: number) =>
      describeLoadError(classifyError(apiError("http", status)), "x").signIn;
    expect(signIn(401)).toBe(true);
    expect(signIn(500)).toBe(false);
  });

  it("never contains the raw error message", () => {
    for (const [kind, status] of [
      ["network", null],
      ["timeout", null],
      ["invalid-response", 200],
      ["http", 400],
      ["http", 401],
      ["http", 404],
      ["http", 409],
      ["http", 500],
    ] as const) {
      const { title, description } = describeLoadError(
        classifyError(apiError(kind, status, { field: RAW })),
        "products",
      );
      expect(`${title} ${description}`).not.toContain(RAW);
    }
  });
});

import { describe, expect, it } from "vitest";
import { ApiRequestError, type ApiErrorKind } from "../api/index.ts";
import { describeLoadError } from "./describeError.ts";

const apiError = (kind: ApiErrorKind, status: number | null = null) =>
  new ApiRequestError({
    kind,
    status,
    method: "GET",
    path: "/products",
    message: "raw server text that must never be shown",
  });

describe("describeLoadError", () => {
  it.each([
    ["network", null, "You seem to be offline"],
    ["timeout", null, "This is taking too long"],
    ["invalid-response", 200, "Something went wrong"],
    ["http", 500, "Our server hit a problem"],
    ["http", 503, "Our server hit a problem"],
    ["http", 418, "Something went wrong"],
  ] as const)("%s %s → %s", (kind, status, title) => {
    const description = describeLoadError(apiError(kind, status), "products");
    expect(description.title).toBe(title);
    expect(description.description).toMatch(/^We couldn't load products\./);
    expect(description.retryable).toBe(true);
  });

  it("never leaks the raw error message", () => {
    for (const kind of ["network", "timeout", "invalid-response", "http"] as const) {
      const { title, description } = describeLoadError(apiError(kind, 500), "products");
      expect(`${title} ${description}`).not.toContain("raw server text");
    }
  });

  it("handles non-API errors (e.g. a bug in our own code)", () => {
    expect(describeLoadError(new TypeError("x is undefined"), "this product").title).toBe(
      "Something went wrong",
    );
  });
});

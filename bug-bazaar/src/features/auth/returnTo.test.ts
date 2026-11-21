// The ?returnTo value comes from the URL, so anyone can craft it. Only
// same-origin app paths may pass (no open redirect).

import { describe, expect, it } from "vitest";
import { loginHref, safeReturnTo } from "./returnTo.ts";

describe("safeReturnTo", () => {
  it.each([
    ["/checkout", "/checkout"],
    ["/products/p-0001", "/products/p-0001"],
    ["/?category=ducks&page=2", "/?category=ducks&page=2"],
    ["/account#orders", "/account#orders"],
  ])("keeps the in-app path %s", (raw, expected) => {
    expect(safeReturnTo(raw)).toBe(expected);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["absolute URL", "https://evil.test/phish"],
    ["protocol-relative", "//evil.test"],
    ["backslash trick", "/\\evil.test"],
    ["javascript: URL", "javascript:alert(1)"],
    ["relative path", "checkout"],
    ["tab inside (browsers strip it)", "/\t/evil.test"],
    ["newline inside", "/\n/evil.test"],
    ["the login page itself (loop)", "/login?returnTo=%2Fcheckout"],
    // Passes a raw-input check, but "." resolves away and leaves "//evil.test".
    ["dot segment that normalizes to //", "/.//evil.test"],
    ["double dot that normalizes to //", "/..//evil.test"],
  ])("rejects %s and returns the fallback", (_label, raw) => {
    // A distinct fallback, so a rejection can't be confused with an input
    // that happened to normalize to "/" (the first version of these tests
    // couldn't tell the two apart, and missed the dot-segment bypass).
    expect(safeReturnTo(raw, "/fallback")).toBe("/fallback");
  });

  it("falls back to the home page by default", () => {
    expect(safeReturnTo("//evil.test")).toBe("/");
  });
});

describe("loginHref", () => {
  it("encodes the current path, query and hash as the return path", () => {
    expect(loginHref({ pathname: "/products/p-0001", search: "?x=1", hash: "#top" })).toBe(
      "/login?returnTo=%2Fproducts%2Fp-0001%3Fx%3D1%23top",
    );
  });

  it("adds no return path for the home page or the login page", () => {
    expect(loginHref({ pathname: "/" })).toBe("/login");
    expect(loginHref({ pathname: "/login", search: "?returnTo=%2Fcart" })).toBe("/login");
  });
});

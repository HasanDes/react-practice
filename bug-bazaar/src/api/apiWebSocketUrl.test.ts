// @vitest-environment jsdom
// The live stock WebSocket URL comes from the same base URL as HTTP (D4-4),
// so pointing the app at a real API moves the feed with it.

import { afterEach, describe, expect, it } from "vitest";
import { apiWebSocketUrl, configureApiClient } from "./client.ts";

let restore: () => void = () => undefined;
afterEach(() => {
  restore();
});

describe("apiWebSocketUrl", () => {
  it("same origin: the page's host, ws:// for http pages", () => {
    restore = configureApiClient({ baseUrl: "/api" });
    expect(apiWebSocketUrl("/stock")).toBe(`ws://${window.location.host}/api/stock`);
  });

  it("an absolute https API becomes wss://, keeping its path (trailing slash or not)", () => {
    restore = configureApiClient({ baseUrl: "https://api.example.com/v1/" });
    expect(apiWebSocketUrl("/stock")).toBe("wss://api.example.com/v1/stock");
  });
});

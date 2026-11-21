// Data-layer tests: the client against the real mock handlers (integration)
// plus one-off handlers for failure modes the mock never produces.

import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createControls } from "../mocks/controls.ts";
import { createDb, createMemoryStorage, DEMO_USER, type MockDb } from "../mocks/db.ts";
import { createHandlers } from "../mocks/handlers.ts";
import { buildUrl } from "./client.ts";
import {
  ApiRequestError,
  configureApiClient,
  createOrder,
  getMe,
  getProduct,
  getProducts,
  login,
} from "./index.ts";

const server = setupServer();
let db: MockDb;
let token: string | null;
let restoreConfig: () => void;
const onUnauthorized = vi.fn<(error: ApiRequestError, token: string | null) => void>();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

beforeEach(() => {
  const storage = createMemoryStorage();
  db = createDb({ storage });
  server.resetHandlers(...createHandlers({ db, controls: createControls({ storage }) }));
  token = null;
  onUnauthorized.mockReset();
  restoreConfig = configureApiClient({
    baseUrl: "http://localhost/api",
    timeoutMs: 1_000,
    getToken: () => token,
    onUnauthorized,
  });
});
afterEach(() => restoreConfig());

/** Run a call that must fail, and return the ApiRequestError it threw. */
async function failure(promise: Promise<unknown>): Promise<ApiRequestError> {
  const error: unknown = await promise.then(
    () => {
      throw new Error("Expected the request to fail");
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiRequestError);
  return error as ApiRequestError;
}

describe("query building", () => {
  it("omits unset values and defaults so URLs stay short and stable", () => {
    expect(buildUrl("/products", { search: "", category: undefined, page: 2, inStock: true })).toBe(
      "http://localhost/api/products?page=2&inStock=true",
    );
  });

  it("getProducts sends filters and returns validated, typed data", async () => {
    const result = await getProducts({
      search: "  duck ",
      category: "ducks",
      sort: "price-asc",
      pageSize: 5,
    });
    expect(result.items).toHaveLength(5);
    expect(result.items.every((product) => product.category === "ducks")).toBe(true);
    const prices = result.items.map((product) => product.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });
});

describe("HTTP errors become ApiRequestError", () => {
  it("404 keeps status and contract code", async () => {
    const error = await failure(getProduct("p-9999"));
    expect(error).toMatchObject({ kind: "http", status: 404, code: "PRODUCT_NOT_FOUND" });
  });

  it("400 exposes field details for form errors", async () => {
    const error = await failure(login({ email: "not-an-email", password: "" }));
    expect(error.status).toBe(400);
    expect(Object.keys(error.details).sort()).toEqual(["email", "password"]);
  });

  it("non-JSON error bodies still produce a usable error", async () => {
    server.use(
      http.get("*/api/products", () => new HttpResponse("<h1>Bad Gateway</h1>", { status: 502 })),
    );
    const error = await failure(getProducts());
    expect(error).toMatchObject({ kind: "http", status: 502, code: null });
  });
});

describe("auth", () => {
  it("attaches the bearer token to authenticated calls", async () => {
    token = (await login({ email: DEMO_USER.email, password: DEMO_USER.password })).token;
    await expect(getMe()).resolves.toMatchObject({ email: DEMO_USER.email });
  });

  it("a 401 on an authenticated call notifies the session layer", async () => {
    token = "expired-token";
    const error = await failure(getMe());
    expect(error.status).toBe(401);
    expect(onUnauthorized).toHaveBeenCalledWith(error, "expired-token");
  });

  it("a 401 from login (wrong password) does NOT log anyone out", async () => {
    const error = await failure(login({ email: DEMO_USER.email, password: "wrong" }));
    expect(error).toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe("orders", () => {
  it("retrying with the same idempotency key returns the same order", async () => {
    token = (await login({ email: DEMO_USER.email, password: DEMO_USER.password })).token;
    db.setStock("p-0001", 10);
    const order = { items: [{ productId: "p-0001", quantity: 2 }] };

    const first = await createOrder(order, { idempotencyKey: "attempt-1" });
    const retry = await createOrder(order, { idempotencyKey: "attempt-1" });
    expect(retry.id).toBe(first.id);
    expect(db.getProduct("p-0001")?.stock).toBe(8);
  });

  it("409 names the out-of-stock item in details", async () => {
    token = (await login({ email: DEMO_USER.email, password: DEMO_USER.password })).token;
    db.setStock("p-0001", 0);
    const error = await failure(
      createOrder({ items: [{ productId: "p-0001", quantity: 1 }] }, { idempotencyKey: "a" }),
    );
    expect(error).toMatchObject({ status: 409, code: "OUT_OF_STOCK" });
    expect(error.details).toHaveProperty("p-0001");
  });
});

describe("failures without a valid response", () => {
  it("a 2xx body that breaks the contract is rejected as invalid-response", async () => {
    server.use(
      http.get("*/api/products/:id", () => HttpResponse.json({ id: "p-1", price: "free" })),
    );
    const error = await failure(getProduct("p-1"));
    expect(error).toMatchObject({ kind: "invalid-response", status: 200 });
  });

  it("a dropped connection is a network error", async () => {
    server.use(http.get("*/api/products", () => HttpResponse.error()));
    expect((await failure(getProducts())).kind).toBe("network");
  });

  it("a slow server hits the client timeout", async () => {
    restoreConfig();
    restoreConfig = configureApiClient({ baseUrl: "http://localhost/api", timeoutMs: 20 });
    server.use(
      http.get("*/api/products", async () => {
        await delay(500);
        return HttpResponse.json({ items: [], total: 0 });
      }),
    );
    expect((await failure(getProducts())).kind).toBe("timeout");
  });

  it("caller cancellation is reported as aborted, not as a failure to show", async () => {
    server.use(
      http.get("*/api/products/:id", async () => {
        await delay(500);
        return HttpResponse.json({});
      }),
    );
    const controller = new AbortController();
    const pending = getProduct("p-0001", { signal: controller.signal });
    controller.abort();
    expect((await failure(pending)).kind).toBe("aborted");
  });
});

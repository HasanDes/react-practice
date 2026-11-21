// Contract tests for the mock API (D1-2 "Done when": every endpoint returns
// the documented shapes and status codes, including each listed error).
// They hit the handlers over real fetch through MSW's Node interceptor.

import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CATEGORIES,
  type ApiError,
  type ApiErrorCode,
  type CreateOrderResponse,
  type LoginResponse,
  type Order,
  type Product,
  type ProductListResponse,
} from "../types/api.ts";
import { createControls, type MockControls } from "./controls.ts";
import { createDb, createMemoryStorage, DEMO_USER, type MockDb } from "./db.ts";
import { createHandlers } from "./handlers.ts";

const BASE = "http://localhost/api";

let db: MockDb;
let controls: MockControls;
let clock: { now: number };
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

beforeEach(() => {
  clock = { now: 1_000_000 };
  const storage = createMemoryStorage();
  db = createDb({ storage, now: () => clock.now });
  controls = createControls({ storage }); // zero latency
  server.resetHandlers(...createHandlers({ db, controls }));
});
afterEach(() => server.resetHandlers());

// --- helpers --------------------------------------------------------------

type CallOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
};

type CallResult<T> = { status: number; body: T };

/**
 * Typed fetch for tests. `T` is the shape the test *expects*. The cast is
 * the assertion under test, and the expect() calls verify it.
 */
async function call<T = unknown>(
  path: string,
  { method = "GET", body, token, headers = {} }: CallOptions = {},
): Promise<CallResult<T>> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as T };
}

async function login(): Promise<string> {
  const { body } = await call<LoginResponse>("/login", {
    method: "POST",
    body: { email: DEMO_USER.email, password: DEMO_USER.password },
  });
  return body.token;
}

/** Assert an ApiError response, then return its body typed for further checks. */
function expectApiError(result: CallResult<unknown>, status: number, code: ApiErrorCode): ApiError {
  expect(result.status).toBe(status);
  expect(result.body).toEqual({
    error: expect.objectContaining({ code, message: expect.any(String) as unknown }) as unknown,
  });
  const body = result.body as ApiError;
  for (const value of Object.values(body.error.details ?? {})) {
    expect(typeof value).toBe("string");
  }
  return body;
}

const productShape = {
  id: expect.stringMatching(/^p-\d{4}$/) as unknown,
  name: expect.any(String) as unknown,
  price: expect.any(Number) as unknown,
  category: expect.stringMatching(new RegExp(`^(${CATEGORIES.join("|")})$`)) as unknown,
  stock: expect.any(Number) as unknown,
  rating: expect.any(Number) as unknown,
  imageUrl: expect.stringMatching(/^\/images\/products\/.+\.svg$/) as unknown,
};

const getProduct = async (id: string) => (await call<Product>(`/products/${id}`)).body;

// --- GET /api/products ------------------------------------------------------

describe("GET /api/products", () => {
  it("returns { items, total } with 5,000 seeded products", async () => {
    const result = await call<ProductListResponse>("/products");
    expect(result.status).toBe(200);
    expect(result.body.total).toBe(5000);
    expect(result.body.items).toHaveLength(24);
    const [first] = result.body.items;
    expect(first).toEqual(productShape);
    expect(Object.keys(first ?? {}).sort()).toEqual(Object.keys(productShape).sort());
  });

  it("stores prices as integer cents", async () => {
    const { body } = await call<ProductListResponse>("/products?pageSize=100");
    for (const product of body.items) {
      expect(Number.isInteger(product.price)).toBe(true);
      expect(product.price % 100).toBe(99);
    }
  });

  it("filters by search (case-insensitive), category and inStock", async () => {
    const { body } = await call<ProductListResponse>(
      "/products?search=DUCK&category=ducks&inStock=true&pageSize=100",
    );
    expect(body.total).toBeGreaterThan(0);
    for (const product of body.items) {
      expect(product.name.toLowerCase()).toContain("duck");
      expect(product.category).toBe("ducks");
      expect(product.stock).toBeGreaterThan(0);
    }
  });

  it("sorts by price and paginates without overlap", async () => {
    const page1 = (await call<ProductListResponse>("/products?sort=price-asc&page=1&pageSize=50"))
      .body.items;
    const page2 = (await call<ProductListResponse>("/products?sort=price-asc&page=2&pageSize=50"))
      .body.items;
    const prices = [...page1, ...page2].map((product) => product.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const ids = new Set([...page1, ...page2].map((product) => product.id));
    expect(ids.size).toBe(100);
  });

  it("returns an empty page, not an error, when nothing matches", async () => {
    const result = await call("/products?search=zzz-no-such-product");
    expect(result).toEqual({ status: 200, body: { items: [], total: 0 } });
  });

  it("returns 500 when forced (header, query param or controls)", async () => {
    expectApiError(
      await call("/products", { headers: { "x-mock-error": "500" } }),
      500,
      "INTERNAL_ERROR",
    );
    expectApiError(await call("/products?mockError=500"), 500, "INTERNAL_ERROR");

    controls.fail("products:list", 500, { once: true });
    expectApiError(await call("/products"), 500, "INTERNAL_ERROR");
    expect((await call("/products")).status).toBe(200); // one-shot failure consumed
  });
});

// --- GET /api/products/:id --------------------------------------------------

describe("GET /api/products/:id", () => {
  it("returns a single Product", async () => {
    const result = await call("/products/p-0042");
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ...productShape, id: "p-0042" });
  });

  it("returns 404 for an unknown id", async () => {
    expectApiError(await call("/products/p-9999"), 404, "PRODUCT_NOT_FOUND");
  });
});

// --- POST /api/login & GET /api/me -----------------------------------------

describe("POST /api/login", () => {
  it("returns { token, user } for valid credentials", async () => {
    const result = await call("/login", {
      method: "POST",
      body: { email: DEMO_USER.email, password: DEMO_USER.password },
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      token: expect.any(String) as unknown,
      user: { id: DEMO_USER.id, name: DEMO_USER.name, email: DEMO_USER.email },
    });
  });

  it("returns 400 with field details for missing or malformed fields", async () => {
    const missing = expectApiError(
      await call("/login", { method: "POST", body: {} }),
      400,
      "VALIDATION_ERROR",
    );
    expect(Object.keys(missing.error.details ?? {}).sort()).toEqual(["email", "password"]);

    const badEmail = expectApiError(
      await call("/login", { method: "POST", body: { email: "nope", password: "x" } }),
      400,
      "VALIDATION_ERROR",
    );
    expect(badEmail.error.details).toEqual({ email: expect.any(String) as unknown });

    expectApiError(
      await call("/login", { method: "POST", body: "{not json" }),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("returns 401 for wrong credentials", async () => {
    const result = await call("/login", {
      method: "POST",
      body: { email: DEMO_USER.email, password: "wrong" },
    });
    expectApiError(result, 401, "INVALID_CREDENTIALS");
  });
});

describe("GET /api/me", () => {
  it("returns the user for a valid token", async () => {
    const result = await call("/me", { token: await login() });
    expect(result).toEqual({
      status: 200,
      body: { id: DEMO_USER.id, name: DEMO_USER.name, email: DEMO_USER.email },
    });
  });

  it("returns 401 without a token, with a bad token, or when forced", async () => {
    expectApiError(await call("/me"), 401, "UNAUTHORIZED");
    expectApiError(await call("/me", { token: "forged" }), 401, "UNAUTHORIZED");
    const token = await login();
    expectApiError(
      await call("/me", { token, headers: { "x-mock-error": "401" } }),
      401,
      "UNAUTHORIZED",
    );
  });
});

// --- POST /api/orders & GET /api/orders/:id ---------------------------------

describe("POST /api/orders", () => {
  const order = (productId: string, quantity: number) => ({ items: [{ productId, quantity }] });

  it("returns 201 { id, status: 'queued' } and decrements stock", async () => {
    const token = await login();
    db.setStock("p-0001", 10);

    const result = await call("/orders", { method: "POST", token, body: order("p-0001", 3) });
    expect(result).toEqual({
      status: 201,
      body: { id: expect.stringMatching(/^o-\d+$/) as unknown, status: "queued" },
    });
    expect((await getProduct("p-0001")).stock).toBe(7);
  });

  it("returns 401 without a session", async () => {
    expectApiError(
      await call("/orders", { method: "POST", body: order("p-0001", 1) }),
      401,
      "UNAUTHORIZED",
    );
  });

  it("returns 400 for an empty cart, unknown product or bad quantity", async () => {
    const token = await login();
    expectApiError(
      await call("/orders", { method: "POST", token, body: { items: [] } }),
      400,
      "VALIDATION_ERROR",
    );

    const bad = expectApiError(
      await call("/orders", {
        method: "POST",
        token,
        body: { items: [{ productId: "p-9999", quantity: 0 }] },
      }),
      400,
      "VALIDATION_ERROR",
    );
    expect(Object.keys(bad.error.details ?? {}).sort()).toEqual([
      "items.0.productId",
      "items.0.quantity",
    ]);
  });

  it("returns 409 naming the item when stock runs out, and changes nothing", async () => {
    const token = await login();
    db.setStock("p-0001", 5);
    db.setStock("p-0002", 1);
    const { name } = await getProduct("p-0002");

    const result = expectApiError(
      await call("/orders", {
        method: "POST",
        token,
        body: {
          items: [
            { productId: "p-0001", quantity: 2 },
            { productId: "p-0002", quantity: 3 },
          ],
        },
      }),
      409,
      "OUT_OF_STOCK",
    );
    expect(result.error.message).toContain(name);
    expect(result.error.details).toEqual({ "p-0002": expect.stringContaining(name) as unknown });
    expect((await getProduct("p-0001")).stock).toBe(5); // all-or-nothing
  });

  it("forced 409 names the first cart item", async () => {
    const token = await login();
    const { name } = await getProduct("p-0003");
    controls.fail("orders:create", 409, { once: true });
    const result = expectApiError(
      await call("/orders", { method: "POST", token, body: order("p-0003", 1) }),
      409,
      "OUT_OF_STOCK",
    );
    expect(result.error.details).toHaveProperty("p-0003");
    expect(result.error.message).toContain(name);
  });

  it("replaying the same Idempotency-Key returns the same order without double-charging stock", async () => {
    const token = await login();
    db.setStock("p-0001", 10);
    const send = () =>
      call<CreateOrderResponse>("/orders", {
        method: "POST",
        token,
        body: order("p-0001", 4),
        headers: { "idempotency-key": "checkout-abc" },
      });

    const first = await send();
    const retry = await send();
    expect(retry.status).toBe(201);
    expect(retry.body.id).toBe(first.body.id);
    expect((await getProduct("p-0001")).stock).toBe(6);
  });
});

describe("GET /api/orders/:id", () => {
  it("returns { id, status } and advances status over time", async () => {
    const token = await login();
    db.setStock("p-0010", 50);
    const { body: created } = await call<CreateOrderResponse>("/orders", {
      method: "POST",
      token,
      body: { items: [{ productId: "p-0010", quantity: 1 }] },
    });

    const status = async () => (await call<Order>(`/orders/${created.id}`, { token })).body;
    expect(await status()).toEqual({ id: created.id, status: "queued" });
    clock.now += 6_000;
    expect((await status()).status).toBe("processing");
    clock.now += 10_000;
    expect((await status()).status).toBe("completed");
  });

  it("returns 401 without a session and 404 for an unknown order", async () => {
    expectApiError(await call("/orders/o-00001"), 401, "UNAUTHORIZED");
    expectApiError(await call("/orders/o-99999", { token: await login() }), 404, "ORDER_NOT_FOUND");
  });
});

// --- Controls & persistence -------------------------------------------------

describe("mock controls and persistence", () => {
  it("rejects forcing a status that isn't in the route's contract", () => {
    expect(() => controls.fail("products:get", 409)).toThrow(/can't return 409/);
    expect(() => controls.fail("no-such-route", 500)).toThrow(/Unknown route/);
  });

  it("can force 500 on every route so retry UIs can be tested everywhere", async () => {
    const cases: [string, CallOptions][] = [
      ["/products/p-0001", {}],
      ["/login", { method: "POST", body: {} }],
      ["/me", {}],
      ["/orders", { method: "POST", body: {} }],
      ["/orders/o-1", {}],
    ];
    for (const [path, init] of cases) {
      expectApiError(
        await call(path, { ...init, headers: { "x-mock-error": "500" } }),
        500,
        "INTERNAL_ERROR",
      );
    }
  });

  it("keeps sessions and stock across a reload (same storage, new db)", () => {
    const storage = createMemoryStorage();
    const first = createDb({ storage });
    const session = first.login(DEMO_USER.email, DEMO_USER.password);
    first.setStock("p-0001", 3);

    const reloaded = createDb({ storage });
    expect(reloaded.userForToken(session?.token ?? null)).toEqual(
      expect.objectContaining({ id: DEMO_USER.id }),
    );
    expect(reloaded.getProduct("p-0001")?.stock).toBe(3);
  });

  it("generates the same catalog every time (deterministic seed)", () => {
    const a = createDb().listProducts();
    const b = createDb().listProducts();
    expect(a).toEqual(b);
    expect(new Set(a.map((product) => product.id)).size).toBe(5000);
  });
});

// MSW request handlers implementing docs/api-contract.md.
//
// createHandlers() takes its dependencies (db, controls) as arguments, so the
// same handlers run in the browser (service worker) and in Node tests with
// different storage and zero latency.

import { delay, http, HttpResponse } from "msw";
import type {
  ApiError,
  ApiErrorCode,
  CreateOrderResponse,
  LoginResponse,
  Order,
  OrderItem,
  Product,
  ProductListResponse,
  User,
} from "../types/api.ts";
import {
  ERROR_CODES as CODES,
  MAX_ORDER_QUANTITY,
  type MockErrorStatus,
  type MockRoute,
} from "./contract.ts";
import { isAllowed, type MockControls } from "./controls.ts";
import type { MockDb } from "./db.ts";
import { parseProductQuery, queryProducts } from "./queryProducts.ts";

// "*/api/..." matches any origin, so it works for relative URLs in the
// browser and absolute URLs in Node tests alike.
const API = "*/api";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Build a response with the contract's ApiError body. */
export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, string>,
) {
  const body: ApiError = { error: { code, message, ...(details ? { details } : {}) } };
  return HttpResponse.json(body, { status });
}

type ForcedContext = { productId?: string | undefined; productName?: string | undefined };

/** Canned bodies for errors forced via controls, header or query param. */
function forcedError(route: MockRoute, status: MockErrorStatus, context: ForcedContext = {}) {
  switch (status) {
    case 400:
      return route === "login"
        ? apiError(400, CODES.VALIDATION_ERROR, "Please fix the highlighted fields.", {
            email: "Enter a valid email address.",
          })
        : apiError(400, CODES.VALIDATION_ERROR, "The order is invalid.", {
            items: "Your cart is empty.",
          });
    case 401:
      return route === "login"
        ? apiError(401, CODES.INVALID_CREDENTIALS, "Email or password is incorrect.")
        : apiError(401, CODES.UNAUTHORIZED, "Your session has expired. Please log in again.");
    case 404:
      return route === "orders:get"
        ? apiError(404, CODES.ORDER_NOT_FOUND, "Order not found.")
        : apiError(404, CODES.PRODUCT_NOT_FOUND, "Product not found.");
    case 409:
      return outOfStock([
        { id: context.productId ?? "p-0001", name: context.productName ?? "An item", stock: 0 },
      ]);
    case 500:
      return apiError(
        500,
        CODES.INTERNAL_ERROR,
        "Something went wrong on our side. Please try again.",
      );
  }
}

/** 409 body that names every item that ran out (D3-2: "a 409 names the item"). */
function outOfStock(
  products: readonly [
    Pick<Product, "id" | "name" | "stock">,
    ...Pick<Product, "id" | "name" | "stock">[],
  ],
) {
  const [first] = products;
  const message =
    products.length === 1
      ? `"${first.name}" only has ${first.stock} left.`
      : `${products.length} items in your cart don't have enough stock.`;
  const details = Object.fromEntries(
    products.map((product) => [product.id, `${product.name}: only ${product.stock} left`]),
  );
  return apiError(409, CODES.OUT_OF_STOCK, message, details);
}

/**
 * Per-request override for scripts, curl and tests:
 * `x-mock-error: 500` header or `?mockError=500` query param.
 */
function requestedError(request: Request): number | "network" | null {
  const raw =
    request.headers.get("x-mock-error") ?? new URL(request.url).searchParams.get("mockError");
  if (!raw) return null;
  return raw === "network" ? "network" : Number(raw);
}

/** Parse the body as `unknown`: callers must narrow it, never trust it. */
async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bearerToken(request: Request): string | null {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

/** First cart line's productId from an untrusted order body, if present. */
function firstProductId(body: unknown): string | undefined {
  if (!isObject(body) || !Array.isArray(body["items"])) return undefined;
  const first: unknown = body["items"][0];
  return isObject(first) && typeof first["productId"] === "string" ? first["productId"] : undefined;
}

export function createHandlers({ db, controls }: { db: MockDb; controls: MockControls }) {
  /**
   * Runs before every handler: simulate latency, then apply any forced error.
   * Returns a Response to short-circuit, or null to continue.
   */
  async function simulate(route: MockRoute, request: Request, context?: ForcedContext) {
    const search = new URL(request.url).searchParams.get("search") ?? "";
    const ms = controls.nextDelay({ route, search });
    if (ms > 0) await delay(ms);

    const status = requestedError(request) ?? controls.takeFailure(route);
    if (status === null) return null;
    if (!isAllowed(route, status)) {
      console.warn(`[mock] Ignoring forced ${String(status)} on "${route}": not in its contract.`);
      return null;
    }
    // "network": the connection drops with no response (fetch rejects), like being offline.
    return status === "network" ? HttpResponse.error() : forcedError(route, status, context);
  }

  const unauthorized = () => forcedError("me", 401);

  return [
    http.get(`${API}/products`, async ({ request }) => {
      const forced = await simulate("products:list", request);
      if (forced) return forced;

      const query = parseProductQuery(new URL(request.url).searchParams);
      return HttpResponse.json<ProductListResponse>(queryProducts(db.listProducts(), query));
    }),

    http.get<{ id: string }>(`${API}/products/:id`, async ({ request, params }) => {
      const forced = await simulate("products:get", request);
      if (forced) return forced;

      const product = db.getProduct(params.id);
      return product
        ? HttpResponse.json<Product>(product)
        : apiError(404, CODES.PRODUCT_NOT_FOUND, "Product not found.");
    }),

    http.post(`${API}/login`, async ({ request }) => {
      const forced = await simulate("login", request);
      if (forced) return forced;

      const body = await readJson(request);
      const email = isObject(body) && typeof body["email"] === "string" ? body["email"].trim() : "";
      const password =
        isObject(body) && typeof body["password"] === "string" ? body["password"] : "";

      const details: Record<string, string> = {};
      if (!email) details["email"] = "Email is required.";
      else if (!EMAIL_PATTERN.test(email)) details["email"] = "Enter a valid email address.";
      if (!password) details["password"] = "Password is required.";
      if (Object.keys(details).length > 0) {
        return apiError(400, CODES.VALIDATION_ERROR, "Please fix the highlighted fields.", details);
      }

      const session = db.login(email, password);
      return session
        ? HttpResponse.json<LoginResponse>(session)
        : apiError(401, CODES.INVALID_CREDENTIALS, "Email or password is incorrect.");
    }),

    http.get(`${API}/me`, async ({ request }) => {
      const forced = await simulate("me", request);
      if (forced) return forced;

      const user = db.userForToken(bearerToken(request));
      return user ? HttpResponse.json<User>(user) : unauthorized();
    }),

    http.post(`${API}/orders`, async ({ request }) => {
      // Read the body first (from a clone) so a forced 409 can name a real cart item.
      const body = await readJson(request.clone());
      const firstProduct = db.getProduct(firstProductId(body) ?? "");
      const forced = await simulate("orders:create", request, {
        productId: firstProduct?.id,
        productName: firstProduct?.name,
      });
      if (forced) return forced;

      const user = db.userForToken(bearerToken(request));
      if (!user) return unauthorized();

      const rawItems: unknown = isObject(body) ? body["items"] : undefined;
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return apiError(400, CODES.VALIDATION_ERROR, "The order is invalid.", {
          items: "Your cart is empty.",
        });
      }

      const details: Record<string, string> = {};
      const items: OrderItem[] = [];
      rawItems.forEach((raw: unknown, index) => {
        const productId = isObject(raw) ? raw["productId"] : undefined;
        const quantity = isObject(raw) ? raw["quantity"] : undefined;

        const validId = typeof productId === "string" && db.getProduct(productId) !== undefined;
        const validQuantity =
          typeof quantity === "number" &&
          Number.isInteger(quantity) &&
          quantity >= 1 &&
          quantity <= MAX_ORDER_QUANTITY;

        if (!validId) details[`items.${index}.productId`] = "This product doesn't exist.";
        if (!validQuantity) {
          details[`items.${index}.quantity`] =
            `Quantity must be a whole number from 1 to ${MAX_ORDER_QUANTITY}.`;
        }
        if (validId && validQuantity) items.push({ productId, quantity });
      });
      if (Object.keys(details).length > 0) {
        return apiError(400, CODES.VALIDATION_ERROR, "The order is invalid.", details);
      }

      const result = db.placeOrder({
        userId: user.id,
        items,
        idempotencyKey: request.headers.get("idempotency-key"),
      });
      if (!result.ok) {
        const [first, ...rest] = result.shortages;
        // placeOrder only returns ok:false with at least one shortage.
        return first ? outOfStock([first, ...rest]) : forcedError("orders:create", 500);
      }

      return HttpResponse.json<CreateOrderResponse>(result.order, { status: 201 });
    }),

    http.get<{ id: string }>(`${API}/orders/:id`, async ({ request, params }) => {
      const forced = await simulate("orders:get", request);
      if (forced) return forced;

      const user = db.userForToken(bearerToken(request));
      if (!user) return unauthorized();

      const order = db.getOrder(params.id, user.id);
      return order
        ? HttpResponse.json<Order>(order)
        : apiError(404, CODES.ORDER_NOT_FOUND, "Order not found.");
    }),
  ];
}

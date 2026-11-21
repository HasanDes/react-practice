// The checkout operation, separate from the UI so it can be reasoned about
// (and tested) on its own: send the order with an idempotency key, and
// turn every failure into a problem the page knows how to explain.

import { createOrder, getProduct, isApiRequestError } from "../../api/index.ts";
import type { CreateOrderResponse } from "../../types/api.ts";
import type { CartItem } from "../cart/cartSlice.ts";

export type OutOfStockItem = { productId: string; name: string; available: number };

export type CheckoutProblem =
  /** 409: some items no longer have enough stock. Names each one (D3-2). */
  | { kind: "out-of-stock"; items: OutOfStockItem[] }
  /**
   * 401. Normally the API client hook has already ended the session, and
   * RequireAuth has sent the user to sign in (and back to checkout after).
   */
  | { kind: "session-expired" }
  /** 400: the server rejected the cart contents. */
  | { kind: "invalid-cart" }
  /** Network, timeout or 5xx: safe to retry with the *same* idempotency key. */
  | { kind: "retryable"; reason: "offline" | "timeout" | "server" };

export type PlaceOrderResult =
  | { ok: true; order: CreateOrderResponse }
  | { ok: false; problem: CheckoutProblem; freshStock: { productId: string; stock: number }[] };

export async function placeOrder(
  items: readonly CartItem[],
  idempotencyKey: string,
): Promise<PlaceOrderResult> {
  try {
    const order = await createOrder(
      { items: items.map(({ productId, quantity }) => ({ productId, quantity })) },
      { idempotencyKey },
    );
    return { ok: true, order };
  } catch (error) {
    if (!isApiRequestError(error)) {
      return { ok: false, problem: { kind: "retryable", reason: "server" }, freshStock: [] };
    }
    if (error.kind === "network") return retryable("offline");
    if (error.kind === "timeout") return retryable("timeout");

    switch (error.status) {
      case 409:
        return outOfStock(items, Object.keys(error.details));
      case 401:
        return { ok: false, problem: { kind: "session-expired" }, freshStock: [] };
      case 400:
        return { ok: false, problem: { kind: "invalid-cart" }, freshStock: [] };
      default:
        return retryable("server");
    }
  }
}

function retryable(reason: "offline" | "timeout" | "server"): PlaceOrderResult {
  return { ok: false, problem: { kind: "retryable", reason }, freshStock: [] };
}

/**
 * The 409 says *which* products ran short (details are keyed by productId).
 * Fetch their current stock so the cart can be corrected and the message can
 * say exactly how many are left. Names come from our own cart, never from the
 * server's message text (D3-4: raw messages never reach the screen).
 */
async function outOfStock(
  items: readonly CartItem[],
  productIds: string[],
): Promise<PlaceOrderResult> {
  const lines = items.filter((item) => productIds.includes(item.productId));
  const fresh = await Promise.all(
    lines.map(async (line) => {
      try {
        const product = await getProduct(line.productId);
        return { productId: line.productId, stock: product.stock };
      } catch {
        return { productId: line.productId, stock: 0 }; // unknown: treat as unavailable
      }
    }),
  );
  return {
    ok: false,
    problem: {
      kind: "out-of-stock",
      items: lines.map((line) => ({
        productId: line.productId,
        name: line.name,
        available: fresh.find((entry) => entry.productId === line.productId)?.stock ?? 0,
      })),
    },
    freshStock: fresh,
  };
}

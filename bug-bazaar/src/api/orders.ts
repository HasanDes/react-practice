import type { CreateOrderRequest, CreateOrderResponse, Order } from "../types/api.ts";
import { request } from "./client.ts";
import { createOrderResponseSchema, orderSchema } from "./schemas.ts";

/**
 * POST /api/orders. Pass the same `idempotencyKey` when retrying one
 * checkout attempt: the server then returns the original order instead of
 * creating a second one (D3-2).
 */
export function createOrder(
  order: CreateOrderRequest,
  { idempotencyKey }: { idempotencyKey: string },
): Promise<CreateOrderResponse> {
  return request("/orders", {
    method: "POST",
    auth: true,
    body: order,
    headers: { "Idempotency-Key": idempotencyKey },
    schema: createOrderResponseSchema,
  });
}

/** GET /api/orders/:id */
export function getOrder(id: string, { signal }: { signal?: AbortSignal } = {}): Promise<Order> {
  return request(`/orders/${encodeURIComponent(id)}`, {
    auth: true,
    schema: orderSchema,
    ...(signal ? { signal } : {}),
  });
}

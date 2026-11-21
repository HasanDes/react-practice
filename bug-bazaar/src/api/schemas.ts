// Runtime schemas for every contract response.
//
// `response.json()` is untyped. Parsing here, in the one place data enters
// the app, turns it into the contract types or fails loudly with an
// "invalid-response" error, instead of crashing later in some component.
// `satisfies ZodMiniType<T>` ties each schema to the hand-written type in
// src/types/api.ts, so the two can't drift apart.

import * as z from "zod/mini";
import {
  CATEGORIES,
  type CreateOrderResponse,
  type LoginResponse,
  type Order,
  type Product,
  type ProductListResponse,
  type User,
} from "../types/api.ts";

export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.int(), // cents
  category: z.enum(CATEGORIES),
  stock: z.int(),
  rating: z.number(),
  imageUrl: z.string(),
}) satisfies z.ZodMiniType<Product>;

export const productListSchema = z.object({
  items: z.array(productSchema),
  total: z.int(),
}) satisfies z.ZodMiniType<ProductListResponse>;

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
}) satisfies z.ZodMiniType<User>;

export const loginResponseSchema = z.object({
  token: z.string(),
  user: userSchema,
}) satisfies z.ZodMiniType<LoginResponse>;

export const createOrderResponseSchema = z.object({
  id: z.string(),
  status: z.literal("queued"),
}) satisfies z.ZodMiniType<CreateOrderResponse>;

export const orderSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "processing", "completed"]),
}) satisfies z.ZodMiniType<Order>;

/**
 * Error bodies are parsed leniently: `code` is any string, so a code that a
 * newer backend adds still comes through instead of being dropped.
 */
export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.optional(z.record(z.string(), z.string())),
  }),
});

/** Live stock feed messages (D4-4). Unknown or malformed frames fail and are ignored. */
export const stockFeedMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot"),
    stock: z.record(z.string(), z.int().check(z.minimum(0))),
  }),
  z.object({
    type: z.literal("stock"),
    productId: z.string(),
    stock: z.int().check(z.minimum(0)),
  }),
  z.object({ type: z.literal("ping") }),
]);

// Cart persistence (D3-2: "the cart survives a reload").
//
// The cart is written to localStorage whenever it changes and read back at
// startup. Storage is untrusted (old versions, manual edits, other tabs), so
// what's read is validated with a schema and clamped before it becomes state.

import * as z from "zod/mini";
import type { CartState } from "./cartSlice.ts";

const STORAGE_KEY = "bazaar:cart:v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const storedCartSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      price: z.int(),
      imageUrl: z.string(),
      stock: z.int(),
      quantity: z.int(),
    }),
  ),
});

/** The saved cart, or undefined if there is none or it's unusable. */
export function loadCart(storage: StorageLike = window.localStorage): CartState | undefined {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = storedCartSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) return undefined;
    return {
      // Re-apply the reducer's rules: never above stock, never zero or negative.
      items: parsed.data.items
        .map((item) => ({ ...item, quantity: Math.min(item.quantity, item.stock) }))
        .filter((item) => item.quantity > 0 && item.price >= 0),
    };
  } catch {
    return undefined; // corrupt JSON or blocked storage: start with an empty cart
  }
}

export function saveCart(cart: CartState, storage: StorageLike = window.localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Quota exceeded or private mode: the cart still works for this session.
  }
}

type CartStore = {
  getState: () => { cart: CartState };
  subscribe: (listener: () => void) => () => void;
};

/**
 * Save the cart whenever it changes. Compares by reference: Redux state is
 * immutable, so a new reference means the cart changed and the same reference
 * means it didn't. Unrelated updates (e.g. the session) write nothing.
 * Returns the unsubscribe function.
 */
export function persistCart(store: CartStore, storage: StorageLike = window.localStorage) {
  let previous = store.getState().cart;
  return store.subscribe(() => {
    const { cart } = store.getState();
    if (cart === previous) return;
    previous = cart;
    saveCart(cart, storage);
  });
}

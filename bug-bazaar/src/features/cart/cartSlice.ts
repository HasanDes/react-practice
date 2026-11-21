// Cart state: the only way to change it is through the actions below
// ("defined updates"). Immer lets reducers read like mutations while
// producing new, frozen state; anything else that tries to mutate it throws.

import { createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Cents, Product } from "../../types/api.ts";

/** A snapshot of the product at the time it was added, plus the quantity. */
export type CartItem = {
  productId: string;
  name: string;
  price: Cents;
  imageUrl: string;
  /** Stock when last seen; quantities can never exceed it (D3-2 refreshes it). */
  stock: number;
  quantity: number;
};

export type CartState = {
  /** Ordered by when each product was first added. */
  items: CartItem[];
};

const initialState: CartState = { items: [] };

const clamp = (quantity: number, stock: number) => Math.max(0, Math.min(quantity, stock));

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    /** Add `quantity` of a product, merging with an existing line. Never exceeds stock. */
    itemAdded(state, action: PayloadAction<{ product: Product; quantity?: number }>) {
      const { product, quantity = 1 } = action.payload;
      const line = state.items.find((item) => item.productId === product.id);
      if (line) {
        line.stock = product.stock;
        line.price = product.price;
        line.quantity = clamp(line.quantity + quantity, product.stock);
      } else if (product.stock > 0) {
        state.items.push({
          productId: product.id,
          name: product.name,
          price: product.price,
          imageUrl: product.imageUrl,
          stock: product.stock,
          quantity: clamp(quantity, product.stock),
        });
      }
      state.items = state.items.filter((item) => item.quantity > 0);
    },

    /** Set a line's quantity (clamped to 0…stock). 0 removes the line. */
    quantityChanged(state, action: PayloadAction<{ productId: string; quantity: number }>) {
      const { productId, quantity } = action.payload;
      const line = state.items.find((item) => item.productId === productId);
      if (!line) return;
      line.quantity = clamp(Math.trunc(quantity), line.stock);
      state.items = state.items.filter((item) => item.quantity > 0);
    },

    itemRemoved(state, action: PayloadAction<{ productId: string }>) {
      state.items = state.items.filter((item) => item.productId !== action.payload.productId);
    },

    /**
     * Fresh stock from the server (e.g. after a 409 at checkout). Quantities
     * above the new stock are lowered; lines that are now sold out disappear.
     */
    stockRefreshed(state, action: PayloadAction<{ productId: string; stock: number }>) {
      const { productId, stock } = action.payload;
      const line = state.items.find((item) => item.productId === productId);
      if (!line) return;
      line.stock = Math.max(0, stock);
      line.quantity = clamp(line.quantity, line.stock);
      state.items = state.items.filter((item) => item.quantity > 0);
    },

    cartCleared() {
      return initialState;
    },
  },
});

export const { itemAdded, quantityChanged, itemRemoved, stockRefreshed, cartCleared } =
  cartSlice.actions;
export const cartReducer = cartSlice.reducer;

// ---- Selectors --------------------------------------------------------------
// Counts and totals are *derived* from the items, never stored, so they can't
// drift out of sync. createSelector memoizes them: they recompute only when
// the items array changes, and return the same value otherwise.

type WithCart = { cart: CartState };

export const selectCartItems = (state: WithCart) => state.cart.items;

/** Total units in the cart (3 ducks + 1 keyboard = 4). Drives the header badge. */
export const selectCartCount = createSelector([selectCartItems], (items) =>
  items.reduce((sum, item) => sum + item.quantity, 0),
);

/** Cart total in integer cents. Format with formatPrice() only at display time. */
export const selectCartTotal = createSelector([selectCartItems], (items) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0),
);

/** How many of one product are already in the cart (0 if none). */
export const selectQuantityInCart = (state: WithCart, productId: string) =>
  state.cart.items.find((item) => item.productId === productId)?.quantity ?? 0;

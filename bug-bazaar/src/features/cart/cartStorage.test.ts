import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../../mocks/db.ts";
import { makeStore } from "../../store/store.ts";
import { cartSignature, clearCheckoutKey, getCheckoutKey } from "../orders/checkoutKey.ts";
import { sessionStarted } from "../auth/sessionSlice.ts";
import { itemAdded, type CartState } from "./cartSlice.ts";
import { loadCart, persistCart, saveCart } from "./cartStorage.ts";

const line = {
  productId: "p-1",
  name: "Duck",
  price: 999,
  imageUrl: "/d.svg",
  stock: 5,
  quantity: 2,
};

describe("cart persistence", () => {
  it("round-trips the cart through storage", () => {
    const storage = createMemoryStorage();
    const cart: CartState = { items: [line] };
    saveCart(cart, storage);
    expect(loadCart(storage)).toEqual(cart);
  });

  it("returns undefined for missing, corrupt or wrongly shaped data", () => {
    const storage = createMemoryStorage();
    expect(loadCart(storage)).toBeUndefined();
    storage.setItem("bazaar:cart:v1", "{not json");
    expect(loadCart(storage)).toBeUndefined();
    storage.setItem("bazaar:cart:v1", JSON.stringify({ items: [{ productId: 1 }] }));
    expect(loadCart(storage)).toBeUndefined();
  });

  it("re-applies cart rules to stored data (never above stock, no empty lines)", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "bazaar:cart:v1",
      JSON.stringify({
        items: [
          { ...line, quantity: 50 },
          { ...line, productId: "p-2", quantity: 0 },
        ],
      }),
    );
    expect(loadCart(storage)).toEqual({ items: [{ ...line, quantity: 5 }] });
  });

  it("persistCart saves on cart changes only", () => {
    const writes: string[] = [];
    const storage = {
      getItem: () => null,
      setItem: (_key: string, value: string) => writes.push(value),
    };
    const store = makeStore();
    persistCart(store, storage);

    store.dispatch(sessionStarted({ token: "t", user: { id: "u", name: "U", email: "u@x.io" } }));
    expect(writes).toHaveLength(0); // unrelated update: nothing written

    store.dispatch(
      itemAdded({
        product: {
          id: "p-1",
          name: "Duck",
          price: 999,
          category: "ducks",
          stock: 5,
          rating: 4,
          imageUrl: "/d.svg",
        },
      }),
    );
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0] ?? "")).toEqual({ items: [{ ...line, quantity: 1 }] });
  });
});

describe("checkout idempotency keys", () => {
  it("the same cart keeps the same key (retries, reloads); a different cart gets a new one", () => {
    const storage = createMemoryStorage();
    const signature = cartSignature([
      { productId: "p-2", quantity: 1 },
      { productId: "p-1", quantity: 3 },
    ]);
    expect(signature).toBe("p-1x3,p-2x1"); // order-independent

    const first = getCheckoutKey(signature, storage);
    expect(getCheckoutKey(signature, storage)).toBe(first);
    expect(getCheckoutKey(cartSignature([{ productId: "p-1", quantity: 4 }]), storage)).not.toBe(
      first,
    );

    clearCheckoutKey(signature, storage); // after a successful order
    expect(getCheckoutKey(signature, storage)).not.toBe(first);
  });
});

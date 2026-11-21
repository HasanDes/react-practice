// Idempotency keys for checkout (D3-2: "a retried checkout doesn't create a
// duplicate order").
//
// One key per checkout *attempt*: the same cart contents keep the same key
// across retries, double-clicks and even a page reload in the same tab, so
// if the first request reached the server but its response was lost, the
// retry returns the original order instead of charging twice. A different
// cart is a different order, so it gets a new key. The key is cleared after
// a successful order.

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIX = "bazaar:checkout-key:";

/** Order-independent fingerprint of what's being bought: "p-0001x2,p-0042x1". */
export function cartSignature(items: readonly { productId: string; quantity: number }[]): string {
  return items
    .map((item) => `${item.productId}x${String(item.quantity)}`)
    .sort()
    .join(",");
}

export function getCheckoutKey(
  signature: string,
  storage: StorageLike = window.sessionStorage,
): string {
  const storageKey = PREFIX + signature;
  try {
    const existing = storage.getItem(storageKey);
    if (existing) return existing;
    const key = crypto.randomUUID();
    storage.setItem(storageKey, key);
    return key;
  } catch {
    // Storage blocked: still idempotent within this page via the caller's retries.
    return crypto.randomUUID();
  }
}

export function clearCheckoutKey(
  signature: string,
  storage: StorageLike = window.sessionStorage,
): void {
  try {
    storage.removeItem(PREFIX + signature);
  } catch {
    // ignore
  }
}

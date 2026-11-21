// Wiring the live stock feed (src/api/stockFeed.ts) into the app (D4-4).
//
// - startLiveStock(store): creates the feed, sends its messages to the store,
//   and keeps the cart honest: a cart line whose stock drops below its
//   quantity is lowered (or removed if sold out) with a notice saying so,
//   the same rule as a 409 at checkout (D3-2).
// - A watch registry decides what to subscribe to: components register the
//   products they show (useLiveStock, useWatchStock) and unregister when
//   they unmount. Nothing on screen → no subscription → no connection.

import { createContext, useContext, useEffect } from "react";
import { createStockFeed, type StockFeed, type StockFeedOptions } from "../../api/index.ts";
import { useAppSelector, type AppStore } from "../../store/store.ts";
import { stockRefreshed } from "../cart/cartSlice.ts";
import {
  cartNoticeAdded,
  feedStatusChanged,
  selectLiveStock,
  stockChanged,
  stockSnapshotReceived,
} from "./liveStockSlice.ts";

export type LiveStockRegistry = {
  /** Watch these products until the returned function is called. */
  watch: (productIds: readonly string[]) => () => void;
};

export const LiveStockContext = createContext<LiveStockRegistry | null>(null);

type StartOptions = {
  url: string;
  /** For tests: build the feed with fakes. */
  createFeed?: (options: StockFeedOptions) => StockFeed;
};

export function startLiveStock(
  store: AppStore,
  { url, createFeed = createStockFeed }: StartOptions,
) {
  /** Apply a stock number to the cart line for that product, if any. */
  function updateCart(productId: string, stock: number) {
    const line = store.getState().cart.items.find((item) => item.productId === productId);
    if (!line || line.stock === stock) return;
    store.dispatch(stockRefreshed({ productId, stock }));
    if (stock < line.quantity) {
      store.dispatch(cartNoticeAdded({ productId, name: line.name, available: stock }));
    }
  }

  const feed = createFeed({
    url,
    onSnapshot: (stock) => {
      store.dispatch(stockSnapshotReceived(stock));
      for (const [productId, value] of Object.entries(stock)) updateCart(productId, value);
    },
    onUpdate: (productId, stock) => {
      store.dispatch(stockChanged({ productId, stock }));
      updateCart(productId, stock);
    },
    onStatus: (status) => store.dispatch(feedStatusChanged(status)),
  });

  // Reference counts: two components showing the same product watch it once.
  const counts = new Map<string, number>();
  let flushScheduled = false;
  function flush() {
    flushScheduled = false;
    feed.setProductIds([...counts.keys()]);
  }
  function scheduleFlush() {
    // Batch the registrations of one render (e.g. 24 cards) into one update.
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(flush);
  }

  const registry: LiveStockRegistry = {
    watch(productIds) {
      for (const id of productIds) counts.set(id, (counts.get(id) ?? 0) + 1);
      scheduleFlush();
      return () => {
        for (const id of productIds) {
          const next = (counts.get(id) ?? 1) - 1;
          if (next <= 0) counts.delete(id);
          else counts.set(id, next);
        }
        scheduleFlush();
      };
    },
  };

  return { registry, feed, stop: () => feed.stop() };
}

/** Watch several products while mounted (e.g. the cart's lines). */
export function useWatchStock(productIds: readonly string[]): void {
  const registry = useContext(LiveStockContext);
  const key = [...productIds].sort().join(",");
  useEffect(() => registry?.watch(key ? key.split(",") : []), [registry, key]);
}

/**
 * A product's stock, live: the feed's latest number while it's on screen,
 * otherwise `fetched` (the REST value the caller already has).
 */
export function useLiveStock(productId: string, fetched: number): number {
  useWatchStock([productId]);
  return useAppSelector((state) => selectLiveStock(state, productId)) ?? fetched;
}

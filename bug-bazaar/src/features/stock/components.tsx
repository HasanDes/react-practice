// Live stock UI (D4-4).

import { useState } from "react";
import { useAppDispatch, useAppSelector } from "../../store/store.ts";
import StockStatus from "../products/components/StockStatus.tsx";
import { useLiveStock } from "./liveStock.tsx";
import { cartNoticeDismissed, selectCartNotices, selectFeedStatus } from "./liveStockSlice.ts";

type LiveStockStatusProps = {
  productId: string;
  /** The stock from the REST response; the feed's number replaces it when there is one. */
  stock: number;
  /**
   * Announce changes to screen readers (polite). On for the product details
   * page; off in the grid, where 24 cards changing would be noise.
   */
  announce?: boolean;
};

/**
 * The stock line, kept live. When the number changes it briefly highlights
 * (no animation with reduced motion). The highlight element is keyed by the
 * value so the CSS animation replays on every change; the live region around
 * it stays mounted, because screen readers only announce changes inside a
 * region that already exists.
 */
export function LiveStockStatus({ productId, stock, announce = false }: LiveStockStatusProps) {
  const live = useLiveStock(productId, stock);
  const [initial] = useState(live);
  const changed = live !== initial;
  return (
    <div className="stock-live" aria-live={announce ? "polite" : undefined}>
      <div
        key={changed ? live : "initial"}
        className={changed ? "stock-live__value--changed" : undefined}
      >
        <StockStatus stock={live} />
      </div>
    </div>
  );
}

/** What the feed did to the cart, in words (cart and checkout pages). */
export function StockNotices() {
  const notices = useAppSelector(selectCartNotices);
  const dispatch = useAppDispatch();
  return (
    // Always rendered, so screen readers announce notices as they're added.
    <div role="status" className="stock-notices">
      {notices.map((notice) => (
        <p key={notice.productId} className="stock-notice">
          <span>
            {notice.available === 0 ? (
              <>
                <strong>{notice.name}</strong> just sold out, so we removed it from your cart.
              </>
            ) : (
              <>
                <strong>{notice.name}</strong> only has {notice.available} left now, so we lowered
                the quantity in your cart.
              </>
            )}
          </span>
          <button
            type="button"
            className="stock-notice__dismiss"
            aria-label={`Dismiss the notice about ${notice.name}`}
            onClick={() => dispatch(cartNoticeDismissed(notice.productId))}
          >
            Dismiss
          </button>
        </p>
      ))}
    </div>
  );
}

/** Header note, only while the feed is trying to reconnect. */
export function LiveStockIndicator() {
  const status = useAppSelector(selectFeedStatus);
  return (
    <p role="status" className="live-indicator">
      {status === "reconnecting" ? "Live stock paused, reconnecting…" : ""}
    </p>
  );
}

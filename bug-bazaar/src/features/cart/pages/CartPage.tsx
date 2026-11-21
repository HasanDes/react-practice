import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/states.tsx";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.ts";
import { useAppDispatch, useAppSelector } from "../../../store/store.ts";
import { formatPrice } from "../../../utils/formatPrice.ts";
import {
  itemRemoved,
  quantityChanged,
  selectCartCount,
  selectCartItems,
  selectCartTotal,
} from "../cartSlice.ts";
import type { CartItem } from "../cartSlice.ts";
import QuantityStepper from "../components/QuantityStepper.tsx";
import { StockNotices } from "../../stock/components.tsx";
import { useWatchStock } from "../../stock/liveStock.tsx";

/** Edit quantities, remove lines, see the derived total, go to checkout. */
export default function CartPage() {
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectCartItems);
  // Live stock for every line while the cart is open (D4-4).
  useWatchStock(items.map((item) => item.productId));
  const count = useAppSelector(selectCartCount);
  const total = useAppSelector(selectCartTotal);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // What just changed, for screen readers (D4-1). Sighted users see the
  // number and total update; without this, a screen reader hears nothing.
  const [announcement, setAnnouncement] = useState("");
  useDocumentTitle("Cart");

  function changeQuantity(item: CartItem, requested: number) {
    const next = Math.min(Math.max(requested, 1), item.stock); // the reducer clamps the same way
    dispatch(quantityChanged({ productId: item.productId, quantity: requested }));
    const newTotal = total + item.price * (next - item.quantity);
    const limit = next >= item.stock ? ` That's all ${String(item.stock)} available.` : "";
    setAnnouncement(
      `${item.name}: quantity ${String(next)}.${limit} Cart total ${formatPrice(newTotal)}.`,
    );
  }

  function remove(item: CartItem) {
    dispatch(itemRemoved({ productId: item.productId }));
    const empty = items.length === 1 ? " Your cart is empty." : "";
    setAnnouncement(`${item.name} removed from your cart.${empty}`);
    // The Remove button is gone with its line: put focus somewhere sensible
    // instead of letting it fall back to <body>.
    headingRef.current?.focus();
  }

  return (
    <section aria-labelledby="cart-heading">
      <h1 id="cart-heading" ref={headingRef} tabIndex={-1} className="page-heading">
        Your cart
      </h1>
      <StockNotices />
      {/* Always rendered, so it exists before its text changes (reliable announcements). */}
      <p role="status" className="visually-hidden" data-testid="cart-announcement">
        {announcement}
      </p>
      {items.length === 0 ? (
        <EmptyState
          icon="🛒"
          title="Your cart is empty"
          description="Find something you like and add it to your cart."
          action={
            <Link to="/" className="button button--primary">
              Browse products
            </Link>
          }
        />
      ) : (
        <>
          <ul className="cart-list" aria-label="Items in your cart">
            {items.map((item) => (
              <li key={item.productId} className="cart-line">
                <img
                  src={item.imageUrl}
                  alt=""
                  width={80}
                  height={60}
                  className="cart-line__image"
                />
                <div className="cart-line__info">
                  <Link to={`/products/${item.productId}`} className="cart-line__name">
                    {item.name}
                  </Link>
                  <span className="cart-line__unit">{formatPrice(item.price)} each</span>
                  {item.quantity >= item.stock && (
                    <span className="cart-line__limit">
                      Only {item.stock} available. That&apos;s all of them.
                    </span>
                  )}
                </div>
                <QuantityStepper
                  productName={item.name}
                  quantity={item.quantity}
                  max={item.stock}
                  onChange={(quantity) => changeQuantity(item, quantity)}
                />
                <span className="cart-line__total">{formatPrice(item.price * item.quantity)}</span>
                <button
                  type="button"
                  className="cart-line__remove"
                  aria-label={`Remove ${item.name} from cart`}
                  onClick={() => remove(item)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <dl className="cart-summary">
            <dt>Items</dt>
            <dd data-testid="cart-count">{count}</dd>
            <dt>Total</dt>
            <dd data-testid="cart-total">{formatPrice(total)}</dd>
          </dl>
          <div className="cart-actions">
            <Link to="/" className="button">
              Continue shopping
            </Link>
            <Link to="/checkout" className="button button--primary">
              Go to checkout
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

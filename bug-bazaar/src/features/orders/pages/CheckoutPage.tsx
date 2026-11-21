import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "../../../components/states.tsx";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.ts";
import { useAppDispatch, useAppSelector } from "../../../store/store.ts";
import { formatPrice } from "../../../utils/formatPrice.ts";
import { selectIsAuthenticated } from "../../auth/sessionSlice.ts";
import {
  cartCleared,
  selectCartCount,
  selectCartItems,
  selectCartTotal,
  stockRefreshed,
} from "../../cart/cartSlice.ts";
import { cartSignature, clearCheckoutKey, getCheckoutKey } from "../checkoutKey.ts";
import { placeOrder, type CheckoutProblem } from "../placeOrder.ts";

/** One status at a time: "submitting with an error" can't be represented. */
type CheckoutStatus =
  { status: "idle" } | { status: "submitting" } | { status: "failed"; problem: CheckoutProblem };

export default function CheckoutPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const items = useAppSelector(selectCartItems);
  const count = useAppSelector(selectCartCount);
  const total = useAppSelector(selectCartTotal);
  const signedIn = useAppSelector(selectIsAuthenticated);
  const [checkout, setCheckout] = useState<CheckoutStatus>({ status: "idle" });
  useDocumentTitle("Checkout");

  if (items.length === 0) {
    return (
      <section>
        <h2 className="page-heading">Checkout</h2>
        <EmptyState
          icon="🛒"
          title="Your cart is empty"
          description="Add something to your cart before checking out."
          action={
            <Link to="/" className="button button--primary">
              Browse products
            </Link>
          }
        />
      </section>
    );
  }

  async function handlePlaceOrder() {
    // The button is disabled while submitting; this guard also covers a
    // second click that lands before React re-renders.
    if (checkout.status === "submitting") return;
    setCheckout({ status: "submitting" });

    // Same cart → same key, across retries and reloads, so a retry after a
    // lost response returns the original order instead of a second one.
    const signature = cartSignature(items);
    const result = await placeOrder(items, getCheckoutKey(signature));

    if (result.ok) {
      clearCheckoutKey(signature);
      dispatch(cartCleared());
      navigate(`/orders/${result.order.id}`, {
        replace: true, // Back shouldn't return to a checkout that's already done
        state: { placedTotal: total, placedCount: count },
      });
      return;
    }
    for (const fresh of result.freshStock) dispatch(stockRefreshed(fresh));
    setCheckout({ status: "failed", problem: result.problem });
  }

  const submitting = checkout.status === "submitting";

  return (
    <section aria-labelledby="checkout-heading" className="checkout">
      <h2 id="checkout-heading" className="page-heading">
        Checkout
      </h2>

      <ul className="checkout__lines">
        {items.map((item) => (
          <li key={item.productId}>
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>{formatPrice(item.price * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <p className="checkout__total">
        Total ({count} {count === 1 ? "item" : "items"}):{" "}
        <strong data-testid="checkout-total">{formatPrice(total)}</strong>
      </p>

      {checkout.status === "failed" && <ProblemMessage problem={checkout.problem} />}

      {signedIn ? (
        <div className="checkout__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void handlePlaceOrder()}
            disabled={submitting}
            aria-disabled={submitting}
          >
            {submitting
              ? "Placing your order…"
              : checkout.status === "failed" && checkout.problem.kind === "retryable"
                ? "Try again"
                : "Place order"}
          </button>
          <Link to="/cart" className="button">
            Back to cart
          </Link>
        </div>
      ) : (
        <div className="checkout__signin">
          <p>Sign in to place your order. Your cart will be waiting.</p>
          <Link to="/login?returnTo=%2Fcheckout" className="button button--primary">
            Sign in to check out
          </Link>
        </div>
      )}
    </section>
  );
}

function ProblemMessage({ problem }: { problem: CheckoutProblem }) {
  switch (problem.kind) {
    case "out-of-stock":
      return (
        <div role="alert" className="checkout__problem">
          <p className="checkout__problem-title">Some items ran out while you were shopping</p>
          <ul>
            {problem.items.map((item) => (
              <li key={item.productId}>
                {item.available === 0 ? (
                  <>
                    <strong>{item.name}</strong> just sold out and was removed from your cart.
                  </>
                ) : (
                  <>
                    <strong>{item.name}</strong> only has {item.available} left, so we lowered the
                    quantity in your cart.
                  </>
                )}
              </li>
            ))}
          </ul>
          <p>Check your order below, then place it again.</p>
        </div>
      );
    case "session-expired":
      return (
        <div role="alert" className="checkout__problem">
          <p className="checkout__problem-title">Your session has expired</p>
          <p>Sign in again to place your order. Your cart has been kept.</p>
        </div>
      );
    case "invalid-cart":
      return (
        <div role="alert" className="checkout__problem">
          <p className="checkout__problem-title">Something in your cart isn&apos;t available</p>
          <p>
            Please <Link to="/cart">review your cart</Link> and try again.
          </p>
        </div>
      );
    case "retryable":
      return (
        <div role="alert" className="checkout__problem">
          <p className="checkout__problem-title">
            {problem.reason === "offline"
              ? "You seem to be offline"
              : problem.reason === "timeout"
                ? "The order is taking too long"
                : "We couldn't place your order"}
          </p>
          <p>
            Please try again. If your first attempt went through, you won&apos;t be charged twice.
          </p>
        </div>
      );
  }
}

import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/states.tsx";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.ts";
import { useAppSelector } from "../../../store/store.ts";
import { formatPrice } from "../../../utils/formatPrice.ts";
import { selectCartCount, selectCartItems, selectCartTotal } from "../cartSlice.ts";

/**
 * Read-only cart summary (D3-1): items, line totals and the derived total.
 * D3-2 adds quantity editing, removal, persistence and checkout.
 */
export default function CartPage() {
  const items = useAppSelector(selectCartItems);
  const count = useAppSelector(selectCartCount);
  const total = useAppSelector(selectCartTotal);
  useDocumentTitle("Cart");

  return (
    <section aria-labelledby="cart-heading">
      <h2 id="cart-heading" className="page-heading">
        Your cart
      </h2>
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
          <ul className="cart-list">
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
                </div>
                <span className="cart-line__quantity">Qty {item.quantity}</span>
                <span className="cart-line__total">{formatPrice(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="cart-summary">
            <dt>Items</dt>
            <dd data-testid="cart-count">{count}</dd>
            <dt>Total</dt>
            <dd data-testid="cart-total">{formatPrice(total)}</dd>
          </dl>
        </>
      )}
    </section>
  );
}

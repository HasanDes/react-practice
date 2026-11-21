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
import QuantityStepper from "../components/QuantityStepper.tsx";

/** Edit quantities, remove lines, see the derived total, go to checkout. */
export default function CartPage() {
  const dispatch = useAppDispatch();
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
                  onChange={(quantity) =>
                    dispatch(quantityChanged({ productId: item.productId, quantity }))
                  }
                />
                <span className="cart-line__total">{formatPrice(item.price * item.quantity)}</span>
                <button
                  type="button"
                  className="cart-line__remove"
                  aria-label={`Remove ${item.name} from cart`}
                  onClick={() => dispatch(itemRemoved({ productId: item.productId }))}
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

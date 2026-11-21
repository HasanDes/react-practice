import { Link } from "react-router-dom";
import { useAppSelector } from "../../../store/store.ts";
import { selectCartCount } from "../cartSlice.ts";

/**
 * Header cart link. The badge number is *derived* (selectCartCount sums the
 * line quantities); nothing stores a separate count that could drift.
 */
export default function CartLink() {
  const count = useAppSelector(selectCartCount);
  const label = `Cart, ${String(count)} ${count === 1 ? "item" : "items"}`;

  return (
    <Link to="/cart" className="cart-link" aria-label={label}>
      <span aria-hidden="true">🛒</span>
      <span className="cart-link__text">Cart</span>
      <span className="cart-link__badge" aria-hidden="true" data-testid="cart-badge">
        {count}
      </span>
    </Link>
  );
}

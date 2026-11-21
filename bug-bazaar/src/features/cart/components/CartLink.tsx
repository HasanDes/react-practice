import { Link } from "react-router-dom";
import { CartIcon } from "../../../components/icons.tsx";
import { useAppSelector } from "../../../store/store.ts";
import { selectCartCount } from "../cartSlice.ts";

/**
 * Header cart link. The badge number is *derived* (selectCartCount sums the
 * line quantities); nothing stores a separate count that could drift.
 *
 * The accessible name comes from the link's content ("Cart, 3 items"), not an
 * aria-label that differs from what's on screen. It starts with the visible
 * word "Cart" and includes the visible number, so voice-control users can say
 * what they see (WCAG 2.5.3, Label in Name; flagged by Lighthouse in D4-1).
 */
export default function CartLink() {
  const count = useAppSelector(selectCartCount);
  const label = `Cart, ${String(count)} ${count === 1 ? "item" : "items"}`;

  return (
    <Link to="/cart" className="cart-link">
      {/* What's seen: [cart icon] Cart 3. What's read: "Cart, 3 items" (one text node, so
          every browser and test library computes the same name). */}
      <CartIcon />
      <span className="cart-link__text" aria-hidden="true">
        Cart
      </span>
      <span className="cart-link__badge" aria-hidden="true">
        {count}
      </span>
      <span className="visually-hidden">{label}</span>
    </Link>
  );
}

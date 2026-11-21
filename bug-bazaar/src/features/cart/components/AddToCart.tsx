import { useState } from "react";
import { useAppDispatch, useAppSelector } from "../../../store/store.ts";
import type { Product } from "../../../types/api.ts";
import { itemAdded, selectQuantityInCart } from "../cartSlice.ts";

type AddToCartProps = {
  product: Product;
};

export default function AddToCart({ product }: AddToCartProps) {
  const dispatch = useAppDispatch();
  const inCart = useAppSelector((state) => selectQuantityInCart(state, product.id));
  const [message, setMessage] = useState("");

  const soldOut = product.stock <= 0;
  const atLimit = !soldOut && inCart >= product.stock;

  function handleAdd() {
    dispatch(itemAdded({ product, quantity: 1 }));
    setMessage(`Added to cart. You have ${String(inCart + 1)} in your cart.`);
  }

  return (
    <div className="add-to-cart">
      <button
        type="button"
        className="button button--primary"
        onClick={handleAdd}
        disabled={soldOut || atLimit}
      >
        {soldOut ? "Sold out" : atLimit ? "All available stock is in your cart" : "Add to cart"}
      </button>
      {/* Polite live region: confirms the action without moving focus. */}
      <p className="add-to-cart__status" role="status">
        {message}
      </p>
    </div>
  );
}

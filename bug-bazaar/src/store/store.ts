import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import { sessionReducer } from "../features/auth/sessionSlice.ts";
import { cartReducer } from "../features/cart/cartSlice.ts";
import { liveStockReducer } from "../features/stock/liveStockSlice.ts";

const rootReducer = combineReducers({
  cart: cartReducer,
  session: sessionReducer,
  liveStock: liveStockReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/**
 * A factory, not a singleton: the app creates one store at startup and
 * every test gets a fresh one, so tests can't leak state into each other.
 * In development, RTK's default middleware checks that state is never
 * mutated outside reducers and stays serializable.
 */
export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    ...(preloadedState ? { preloadedState } : {}),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];

/** Typed hooks: components get RootState / AppDispatch types without annotations. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

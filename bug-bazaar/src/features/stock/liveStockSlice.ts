// Live stock state (D4-4): the latest stock the feed reported per product,
// the connection status, and notices about cart lines the feed changed.
//
// Components show `live ?? fetched`: the feed's number when there is one,
// otherwise the stock from the REST response they already have. That's
// correct whenever it's on screen: a product is subscribed while shown, the
// server pushes every change for subscribed products, and each (re)subscribe
// returns a fresh snapshot, so nothing missed while disconnected survives.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { StockFeedStatus } from "../../api/index.ts";

/** A cart line the feed lowered or removed, so the cart can say what happened. */
export type CartStockNotice = { productId: string; name: string; available: number };

export type LiveStockState = {
  stock: Record<string, number>;
  status: StockFeedStatus;
  cartNotices: CartStockNotice[];
};

const initialState: LiveStockState = { stock: {}, status: "idle", cartNotices: [] };

const liveStockSlice = createSlice({
  name: "liveStock",
  initialState,
  reducers: {
    stockSnapshotReceived(state, action: PayloadAction<Record<string, number>>) {
      Object.assign(state.stock, action.payload);
    },
    stockChanged(state, action: PayloadAction<{ productId: string; stock: number }>) {
      state.stock[action.payload.productId] = action.payload.stock;
    },
    feedStatusChanged(state, action: PayloadAction<StockFeedStatus>) {
      state.status = action.payload;
    },
    cartNoticeAdded(state, action: PayloadAction<CartStockNotice>) {
      // One notice per product: the latest replaces an older one.
      state.cartNotices = [
        ...state.cartNotices.filter((notice) => notice.productId !== action.payload.productId),
        action.payload,
      ];
    },
    cartNoticeDismissed(state, action: PayloadAction<string>) {
      state.cartNotices = state.cartNotices.filter((notice) => notice.productId !== action.payload);
    },
  },
});

export const {
  stockSnapshotReceived,
  stockChanged,
  feedStatusChanged,
  cartNoticeAdded,
  cartNoticeDismissed,
} = liveStockSlice.actions;
export const liveStockReducer = liveStockSlice.reducer;

type WithLiveStock = { liveStock: LiveStockState };

export const selectLiveStock = (state: WithLiveStock, productId: string): number | undefined =>
  state.liveStock.stock[productId];
export const selectFeedStatus = (state: WithLiveStock) => state.liveStock.status;
export const selectCartNotices = (state: WithLiveStock) => state.liveStock.cartNotices;

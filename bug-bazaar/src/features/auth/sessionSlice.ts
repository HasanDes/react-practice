// Session state as a discriminated union (same idea as RequestState, D1-3):
// a token without a user, or a user without a token, can't be represented.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { User } from "../../types/api.ts";

export type SessionState =
  | { status: "anonymous"; endedBecause: "logout" | "expired" | null }
  | { status: "authenticated"; token: string; user: User };

/**
 * Returns the full union type. (`const x: SessionState = {...}` would narrow
 * to the "anonymous" member, and createSlice would infer that as the only state.)
 */
function anonymous(endedBecause: "logout" | "expired" | null): SessionState {
  return { status: "anonymous", endedBecause };
}

const sessionSlice = createSlice({
  name: "session",
  initialState: anonymous(null),
  reducers: {
    /** After a successful POST /api/login. */
    sessionStarted(_state, action: PayloadAction<{ token: string; user: User }>) {
      return { status: "authenticated", ...action.payload };
    },
    /**
     * The user logged out, or the server rejected the token (401). The
     * reason lets the login page say "your session expired" (D3-3).
     */
    sessionEnded(_state, action: PayloadAction<{ reason: "logout" | "expired" }>) {
      return anonymous(action.payload.reason);
    },
  },
});

export const { sessionStarted, sessionEnded } = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;

type WithSession = { session: SessionState };

export const selectSession = (state: WithSession) => state.session;
export const selectIsAuthenticated = (state: WithSession) =>
  state.session.status === "authenticated";
export const selectToken = (state: WithSession) =>
  state.session.status === "authenticated" ? state.session.token : null;
export const selectUser = (state: WithSession) =>
  state.session.status === "authenticated" ? state.session.user : null;

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppSelector } from "../../../store/store.ts";
import { loginHref } from "../returnTo.ts";
import { selectIsAuthenticated } from "../sessionSlice.ts";

/**
 * Route guard for pages that need a signed-in user (account, checkout).
 * Signed out → the login page, which returns here afterwards. `replace`
 * keeps the protected URL out of history, so Back from the login page
 * doesn't bounce straight into this redirect again.
 *
 * Because it reads the session from the store, it also reacts to a 401
 * anywhere on the page: the session ends, this re-renders, and the user is
 * sent to sign in again with the page they were on as the return path.
 *
 * This is UX, not security: the server checks the token on every call.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const signedIn = useAppSelector(selectIsAuthenticated);
  const location = useLocation();
  if (!signedIn) return <Navigate to={loginHref(location)} replace />;
  return children;
}

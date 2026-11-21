// Where the session lives between reloads (D3-3; trade-offs in docs/auth.md).
//
// The token is kept in sessionStorage: it survives a reload in the same tab
// and is gone when the tab closes. Like the cart, what's read back is
// validated, and at startup the token is checked with GET /api/me. A 401
// there ends the session as "expired" through the normal 401 path.

import * as z from "zod/mini";
import { getMe, isApiRequestError } from "../../api/index.ts";
import { selectToken, sessionStarted, type SessionState } from "./sessionSlice.ts";

const STORAGE_KEY = "bazaar:session:v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const storedSessionSchema = z.object({
  token: z.string().check(z.minLength(1)),
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});

/** The saved session (authenticated), or undefined if there is none or it's unusable. */
export function loadSession(
  storage: StorageLike = window.sessionStorage,
): SessionState | undefined {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = storedSessionSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? { status: "authenticated", ...parsed.data } : undefined;
  } catch {
    return undefined; // corrupt JSON or blocked storage: start signed out
  }
}

type SessionStore = {
  getState: () => { session: SessionState };
  subscribe: (listener: () => void) => () => void;
};

/**
 * Save the session whenever it changes; remove it on logout or expiry, so a
 * reload after a 401 doesn't bring the dead token back. Compares by
 * reference, like persistCart. Returns the unsubscribe function.
 */
export function persistSession(store: SessionStore, storage: StorageLike = window.sessionStorage) {
  let previous = store.getState().session;
  return store.subscribe(() => {
    const { session } = store.getState();
    if (session === previous) return;
    previous = session;
    try {
      if (session.status === "authenticated") {
        storage.setItem(STORAGE_KEY, JSON.stringify({ token: session.token, user: session.user }));
      } else {
        storage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage blocked: the session still works until the tab reloads.
    }
  });
}

type VerifiableStore = SessionStore & {
  dispatch: (action: ReturnType<typeof sessionStarted>) => unknown;
};

/**
 * Check a restored token with the server. 401: the client's onUnauthorized
 * hook (connectApiToStore) ends the session as "expired". Success: refresh
 * the user's details. Offline or 5xx: keep the session; the next
 * authenticated call decides.
 */
export async function verifySession(store: VerifiableStore): Promise<void> {
  const token = selectToken(store.getState());
  if (token === null) return;
  try {
    const user = await getMe();
    // Only if nothing changed meanwhile (e.g. the user logged out and in again).
    if (selectToken(store.getState()) === token) store.dispatch(sessionStarted({ token, user }));
  } catch (error) {
    if (!isApiRequestError(error)) throw error;
  }
}

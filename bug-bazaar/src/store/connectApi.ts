import { configureApiClient } from "../api/index.ts";
import { selectToken, sessionEnded } from "../features/auth/sessionSlice.ts";
import type { AppStore } from "./store.ts";

/**
 * Plug the session into the data layer (D1-4's injection point): the client
 * reads the token from the store, and a 401 on an authenticated call ends the
 * session. The API layer never imports the store, so there's no import cycle.
 * Returns a function that undoes the wiring (used by tests).
 */
export function connectApiToStore(store: AppStore): () => void {
  return configureApiClient({
    getToken: () => selectToken(store.getState()),
    onUnauthorized: () => {
      store.dispatch(sessionEnded({ reason: "expired" }));
    },
  });
}

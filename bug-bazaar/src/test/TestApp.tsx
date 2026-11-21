import { Provider } from "react-redux";
import App from "../app/App.tsx";
import { LiveStockContext, type LiveStockRegistry } from "../features/stock/liveStock.tsx";
import { makeStore, type AppStore } from "../store/store.ts";

/**
 * The real App with its Redux store. Each render gets a fresh store unless
 * one is passed in, so tests never share cart or session state. Wrap it in a
 * MemoryRouter in the test (routing is part of what's being tested).
 * Live stock (D4-4) is off unless a registry is passed (startLiveStock).
 */
export default function TestApp({
  store,
  liveStock = null,
}: {
  store?: AppStore;
  liveStock?: LiveStockRegistry | null;
}) {
  return (
    <Provider store={store ?? makeStore()}>
      <LiveStockContext.Provider value={liveStock}>
        <App />
      </LiveStockContext.Provider>
    </Provider>
  );
}

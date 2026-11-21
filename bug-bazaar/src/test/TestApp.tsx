import { Provider } from "react-redux";
import App from "../app/App.tsx";
import { makeStore, type AppStore } from "../store/store.ts";

/**
 * The real App with its Redux store. Each render gets a fresh store unless
 * one is passed in, so tests never share cart or session state. Wrap it in a
 * MemoryRouter in the test (routing is part of what's being tested).
 */
export default function TestApp({ store }: { store?: AppStore }) {
  return (
    <Provider store={store ?? makeStore()}>
      <App />
    </Provider>
  );
}

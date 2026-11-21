// Global test setup (vite.config.ts → test.setupFiles).
// Adds DOM matchers (toBeInTheDocument, toHaveFocus, …) and unmounts React
// trees between tests. Component tests opt into jsdom with a
// `// @vitest-environment jsdom` comment; logic tests stay on fast Node.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { queryCache } from "../cache/queryCache.ts";

// jsdom has no ResizeObserver (the virtualized list uses it for its column
// count and position). A stub that never fires: tests keep the defaults.
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, "ResizeObserver", { value: ResizeObserverStub });
}

afterEach(async () => {
  // The cache is a module singleton: never let one test's data leak into the next.
  queryCache.clear();
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});

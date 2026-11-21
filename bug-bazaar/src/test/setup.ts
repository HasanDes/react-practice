// Global test setup (vite.config.ts → test.setupFiles).
// Adds DOM matchers (toBeInTheDocument, toHaveFocus, …) and unmounts React
// trees between tests. Component tests opt into jsdom with a
// `// @vitest-environment jsdom` comment; logic tests stay on fast Node.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { queryCache } from "../cache/queryCache.ts";

afterEach(async () => {
  // The cache is a module singleton: never let one test's data leak into the next.
  queryCache.clear();
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // The URL path the app is served from. "/" locally; the deploy workflow
  // sets VITE_BASE_PATH=/react-practice/ for GitHub Pages (D4-6).
  base: process.env["VITE_BASE_PATH"] ?? "/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    // npm run test:coverage (D4-5). App code only: not tests, mocks or dev tools.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/mocks/**",
        "src/dev/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
      ],
      reporter: ["text-summary", "text", "html"],
    },
  },
});

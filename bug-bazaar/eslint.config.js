// ESLint flat config.
// Catches correctness problems (types, hooks rules, a11y). Formatting is left
// entirely to Prettier: eslint-config-prettier goes last and turns off any
// stylistic rule that would fight it.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "dist-*", "coverage", "node_modules", "public/mockServiceWorker.js"] },

  js.configs.recommended,

  // TypeScript: type-aware rules use the real type information from tsconfig.
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // D1-3 "Done when": no `any`, no `@ts-ignore`. Errors, not warnings.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-nocheck": true, "ts-expect-error": true, "ts-check": false },
      ],
      // The no-unsafe-* rules (from strictTypeChecked) also stop `any` leaking in
      // implicitly, e.g. from JSON.parse or response.json().
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      // Allow `() => doThing()` callbacks; still flags void used as a value elsewhere.
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
      // Template literals with numbers are fine (`p-${id}`, `${count} items`).
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },

  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite(),
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: { globals: globals.browser },
  },

  // D1-4: one data layer. Only src/api/ talks to the network, and only the
  // bootstrap (main.tsx) may load the mock backend.
  {
    files: ["src/**/*.{ts,tsx}"],
    // Tests may set up the mock backend; production UI code may not.
    ignores: [
      "src/api/**",
      "src/mocks/**",
      "src/main.tsx",
      "src/**/*.test.{ts,tsx}",
      "src/test/**",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["fetch", "XMLHttpRequest", "WebSocket", "EventSource"].map((name) => ({
          name,
          message:
            "Network access belongs in src/api/. Import a function from src/api/index.ts instead.",
        })),
      ],
      "no-restricted-properties": [
        "error",
        ...["window", "globalThis", "self"].map((object) => ({
          object,
          property: "fetch",
          message: "Network access belongs in src/api/.",
        })),
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: ["axios", "ky", "msw"].map((name) => ({
            name,
            message: "HTTP clients and MSW are only used inside src/api/ and src/mocks/.",
          })),
          patterns: [
            {
              group: ["**/mocks/**"],
              message: "UI code must not import the mock backend. Use src/api/.",
            },
            {
              group: ["**/api/*", "!**/api/index.ts"],
              message: "Import from src/api/index.ts (the data layer's public entry point).",
            },
          ],
        },
      ],
    },
  },

  {
    rules: {
      eqeqeq: ["error", "always"],
      "no-console": ["warn", { allow: ["warn", "error", "info", "table"] }],
    },
  },

  // D3-4: raw error messages never reach the screen. UI code can't read an
  // error's `.message` at all; it classifies the error (src/errors/appError.ts)
  // and uses our own copy. Logging code lives outside these folders.
  {
    files: ["src/{app,components,features,hooks,dev}/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name='message']",
          message:
            "Raw error messages never reach the screen (D3-4). Use classifyError() from src/errors and our own copy.",
        },
      ],
    },
  },

  // Node-side tooling (plain JS, no type-aware linting).
  {
    files: ["*.config.js", "scripts/**/*.{js,mjs}"],
    languageOptions: { globals: globals.node },
    // Command-line scripts (e.g. the a11y audit) report by printing.
    rules: { "no-console": "off" },
  },

  prettier,
);

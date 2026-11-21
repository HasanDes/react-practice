// ESLint flat config.
// Catches correctness problems (hooks rules, unused vars, a11y). Formatting
// is left entirely to Prettier: eslint-config-prettier goes last and turns
// off any stylistic rule that would fight it.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["dist", "coverage", "node_modules", "public/mockServiceWorker.js"] },

  js.configs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  reactRefresh.configs.vite(),
  jsxA11y.flatConfigs.recommended,

  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Without eslint-plugin-react, ESLint can't see that JSX uses a component,
      // so allow capitalized names and leading underscores.
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
      "no-console": ["warn", { allow: ["warn", "error", "info", "table"] }],
    },
  },

  // Node-side config files.
  {
    files: ["*.config.js", "scripts/**/*.{js,mjs}"],
    languageOptions: { globals: globals.node },
  },

  prettier,
];

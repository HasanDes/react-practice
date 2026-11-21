# Decisions Log

One entry per task: **what I used**, **what else I considered**, and **why**. Newest tasks go at the bottom. Entries are short on purpose. The reasoning is what matters.

---

## D0: Rename and repo history

- **Used:** Moved `bug-bounty-starter/` → `bug-bazaar/` with `git mv` in the same repository, in two commits: (1) a pure move with the original README, then (2) the content rewrite.
- **Considered:** A plain folder rename. Windows had the folder locked by the editor, so I moved the files one by one with `git mv` instead. I also considered a single commit for move and rewrite.
- **Why:** Git tracks renames by similarity. Moving the README in one commit and rewriting it in the next keeps `git log --follow` working back to Week 1, as the spec requires ("keep the Week 1 repo history").

---

## D1-1: Setup

### Linting: ESLint 9 (flat config)

- **Used:** `eslint@9` with `@eslint/js` recommended, `eslint-plugin-react-hooks` (`recommended-latest`), `eslint-plugin-react-refresh` (Vite preset) and `eslint-plugin-jsx-a11y` (recommended).
- **Considered:** ESLint 10 (the latest), and Biome (one fast tool for lint and format).
- **Why:**
  - **ESLint 9, not 10:** `eslint-plugin-jsx-a11y@6.10` only declares support up to ESLint 9, and npm refused to resolve the tree. Forcing it with `--legacy-peer-deps` would hide a real incompatibility and make every teammate's install fragile. Accessibility is a scored topic (D4-1), so jsx-a11y matters more than being on the newest ESLint major.
  - **Not Biome:** It's fast, but it has no equivalent of the React Hooks _exhaustive-deps_ rule or full jsx-a11y coverage. Those two rule sets directly protect D2-4 (effect cleanup) and D4-1 (accessibility).
  - **react-hooks:** Catches missing effect dependencies and conditional hooks, the bugs most likely to break D2-4 and D2-6.
  - **jsx-a11y:** Catches missing `alt`, unlabeled inputs and non-interactive click handlers at write time, not at Lighthouse time.
  - **Custom rules:** `eqeqeq` (no `==` coercion surprises with ids and prices), `no-console` as a warning (stray logs; `warn`/`error` stay allowed for D4-7 logging).
- **Later:** D1-3 adds `typescript-eslint` to this same config.

### Formatting: Prettier 3

- **Used:** Prettier with a small config (`printWidth: 100`, double quotes, trailing commas, LF), plus `eslint-config-prettier` to switch off ESLint's stylistic rules.
- **Considered:** ESLint stylistic rules only (`@stylistic/eslint-plugin`).
- **Why:** Prettier is opinionated, so there's nothing to debate in review. Keeping formatting out of ESLint means a lint error is always a real problem, never whitespace. Trailing commas give one-line diffs when items are added to lists.

### Cross-platform consistency: EditorConfig, `.gitattributes`, `.nvmrc`, `engines`

- **Used:** `.editorconfig` (2-space indent, LF, final newline), `.gitattributes` (`eol=lf`), `.nvmrc` = `26`, `"engines": { "node": ">=20" }`.
- **Why:**
  - Git was warning "LF will be replaced by CRLF" on every file on Windows. `.gitattributes` makes line endings identical for everyone, so diffs show only real changes.
  - Node version: my default shell Node was **v12**, and `vite build` failed with `Unexpected reserved word` (top-level await). A teammate would hit the same wall and blow the 5-minute setup target. `.nvmrc` pins a known-good version (26 is the current Active LTS). `engines` states the true floor: Vite 5 and ESLint 9 both need Node ≥ 18, and 20 is the oldest still-supported LTS. The README troubleshooting table maps that exact error to its fix.

### Environment variables: `.env.example` + `.env.local`

- **Used:** A committed `.env.example` template. Real values go in git-ignored `.env.local`. Every variable has a default, so **no env file is needed to run**.
- **Considered:** Committing a `.env` file; having no env vars at all until needed.
- **Why:** "Clone and run in < 5 minutes" means zero required config. The template documents the variables that D1-2, D1-4 and D4-4 will read, so they're discoverable in one place. Vite only exposes `VITE_`-prefixed variables to the browser, so the template warns never to put secrets there.

### Folder structure: feature-based

- **Used:** `src/app` (shell and routes), `src/features/<feature>/{components,pages}`, `src/components` (shared UI), `src/mocks`, `src/styles`. Moved with `git mv` so file history follows.
- **Considered:** Type-based folders (`components/`, `pages/`, `hooks/` at the top level, like Week 1). I also considered a path alias (`@/…`) for imports.
- **Why:**
  - Type-based folders scale badly. By Day 3 `components/` would mix product cards, cart rows and login forms. Feature folders keep a change to "cart" inside `features/cart/`, which matches how tasks are split in the spec.
  - Promotion rule: a file moves to shared `components/` only when a second feature needs it. This avoids a junk-drawer shared folder.
  - **No path alias yet:** It needs config in Vite, the editor and (after D1-3) `tsconfig.json`. Imports are only 1–2 levels deep today. I'll revisit it in D1-3, when `tsconfig` exists anyway.

### One-command verification: `npm run check`

- **Used:** `check` = lint, then `format:check`, then build.
- **Why:** One command a teammate (and later CI in D4-6) can run before pushing. `test` joined it in D1-2; `typecheck` joins in D1-3.

> **Update (D1-2):** the Node floor rose to **22.12** because MSW 3 requires it (see D1-2 below).

---

## D1-2: HTTP and API contracts

### Mocking approach: MSW (Mock Service Worker)

- **Used:** MSW 3. A Service Worker intercepts real `fetch` calls in the browser. The same handlers run in Node (`msw/node`) for tests.
- **Considered:**
  - **json-server / small Express server:** real HTTP, but a second process to start. That's one more step in the 5-minute setup, and simulating 409 idempotency, auth or forced errors needs custom middleware anyway.
  - **Vite dev-server middleware:** real HTTP with no extra process, but it only exists under `vite dev`. It disappears in `vite preview`, production deploys (D4-6 bonus) and Node tests.
  - **In-app fake functions** (like Week 1's `fetchBugs()`): simplest, but there's no HTTP at all. No status codes, headers or JSON parsing, and nothing in the Network tab. The data layer (D1-4) would be built against a fake that behaves nothing like a server.
- **Why MSW:**
  - The app's code runs **exactly as in production**: real `fetch`, real `Response` objects, real status codes and headers. Turning the mock off (`VITE_USE_MOCK_API=false`) is the only change needed for a real backend.
  - **One definition, three uses:** browser dev, deployed demo, and Vitest contract tests. The tests prove the browser mock's behavior too.
  - Requests are visible in DevTools, which helps D2-6 (race conditions) and D3-4 (error handling) demos.
  - MSW also mocks **WebSockets** (`msw/ws`), a candidate for D4-4 live stock.
- **Trade-offs:** needs `public/mockServiceWorker.js` (generated, committed, excluded from lint/format), and the app waits for the worker to register before its first render (~tens of ms).

### Toolchain upgrade (Vite 5 → 8)

- **Problem:** the starter pinned Vite 5.4.8. MSW 3 and current Vitest both require Vite ≥ 6.
- **Considered:** pinning older versions of everything (MSW 2 + Vitest 3) to stay on Vite 5.
- **Decision:** upgrade Vite to 8 and `@vitejs/plugin-react` to 6. Pinning would leave the whole week on an outdated build tool, and each new library would hit the same wall again. It's dev-only tooling, and `npm run check` passed unchanged. It's in its own commit so it's easy to review or revert.
- **Also:** `react-router-dom` 6.26.2 → 6.30.6 patches high-severity open-redirect advisories (no API change). Two moderate advisories remain, fixed only in v7: SSR hydration (not used) and backslash open redirect in `<Link>`/`navigate` with **untrusted input**. → **D3-3 must validate the "return to" URL** (same-origin path starting with a single `/`) before navigating to it.

### Data: deterministic seed, persisted changes

- **Used:** a seeded PRNG (mulberry32) generates the same 5,000 products every time. Only _changes_ (stock after orders, sessions, orders, idempotency keys) are saved to `localStorage`.
- **Considered:** `faker` (a big dependency, and a different catalog every run unless seeded); a static 5,000-item JSON file (~1 MB in the repo, painful to tweak); no persistence.
- **Why:** stable ids mean bug reports and tests can say "p-0042" and mean the same item. Without persistence, every reload would invalidate the client's token (forcing a 401 and logout) and undo purchases, so the D3-2 "cart survives reload" and D3-5 "stock refresh after order" work couldn't be tested honestly.

### Making each error triggerable

- **Used:** three layers. (1) **Natural inputs** (wrong password → 401, unknown id → 404, quantity > stock → 409). (2) **`window.bazaarMock`** console controls, persistent or one-shot (`{ once: true }`). (3) A **per-request** `x-mock-error` header / `?mockError=` param for scripts and tests.
- **Considered:** a random failure rate (like Week 1's 25%). It's realistic, but you can't demo a specific state on demand, and it makes tests flaky.
- **Why:** QA and evaluators need to produce _each_ state deterministically (D2-3 "each state can be triggered on purpose"). Controls only accept statuses listed for that route (plus 500), so the mock can't drift from the contract.

### Contract extensions

- **`inStock=true`** and **`pageSize`** on `GET /api/products`. D2-2 needs an in-stock filter, and filtering client-side would break `total` and pagination. `pageSize` is capped at 100 because a real API wouldn't let clients pull 5,000 rows at once. D4-3 will page and virtualize instead.
- **`Idempotency-Key` header** on `POST /api/orders`: the server half of D3-2's "a retried checkout can't create a second order".
- **500 forceable on every route:** the contract lists it only for the list, but real servers can fail anywhere, and the retry UI must be tested on the details page too.
- All extensions are optional and backward-compatible: a client following only the original contract still works.

### Testing the contract: Vitest

- **Used:** Vitest with MSW's Node interceptor, so the tests exercise handlers through real `fetch`. 25 tests cover every endpoint's success shape and every listed error, plus idempotency, all-or-nothing stock, persistence and determinism.
- **Considered:** Jest (needs extra ESM/Vite transform config); a manual checklist.
- **Why:** Vitest reuses the Vite config and is the natural runner for D4-5. Writing contract tests _now_ is the proof for D1-2's "Done when".
- **Windows quirk:** `npm test` runs Vitest through `scripts/vitest.mjs`. A terminal opened at lowercase `d:\` (VS Code's default here) makes Vitest load two copies of itself ("failed to find the runner"). Normalizing the drive letter in a vite config hook ran too late. A tiny launcher that starts Vitest from an upper-cased cwd fixes it, and it's a no-op on macOS/Linux/CI.

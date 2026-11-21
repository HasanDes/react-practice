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

---

## D1-3: TypeScript

### Compiler: TypeScript 6.0 (not 7)

- **Used:** `typescript@~6.0` with `tsc -b` (project references: `tsconfig.app.json` for `src/`, `tsconfig.node.json` for `vite.config.ts`).
- **Considered:** TypeScript 7 (the native Go port, much faster).
- **Why:** `typescript-eslint` supports TypeScript < 6.1 only, and its **type-aware rules** are what enforce "no `any`" beyond explicit annotations (see below). MSW 3 needs ≥ 5.9. I'll move to 7 when `typescript-eslint` supports it. The codebase is small, so speed isn't a problem yet.
- **TS 6 gotcha:** `types` no longer auto-includes every `@types/*` package, so each tsconfig lists its ambient types explicitly (`vite/client`, `node`).

### Strictness: `strict` plus extra flags

- **Used:** `strict: true` plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals/Parameters`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `erasableSyntaxOnly`.
- **Why the extras:**
  - `noUncheckedIndexedAccess`: `array[i]` and `record[key]` are typed `T | undefined`. That's what makes `state.stock[id]` or `items[0]` honest. It caught real cases in the seed generator (`pick()` now requires a non-empty tuple type) and in the 409 builder (must have at least one item).
  - `noPropertyAccessFromIndexSignature`: forces `details["email"]` over `details.email` on dictionaries, so it's visible at the call site that the key might not exist.
  - `erasableSyntaxOnly` + `verbatimModuleSyntax`: no enums or namespaces (TS-only runtime syntax), and explicit `import type`. The code stays plain JS with types erased, which is what Vite/esbuild expects.
- **Considered:** `exactOptionalPropertyTypes`. Skipped: it creates a lot of friction with React and library types for little gain at this size.

### "No `any`, no `@ts-ignore`": enforced, not promised

- **Used:** `typescript-eslint` `strictTypeChecked` with `no-explicit-any` and `ban-ts-comment` (bans `@ts-ignore`, `@ts-nocheck` **and** `@ts-expect-error`) as errors. The type-aware `no-unsafe-*` rules also catch **implicit** `any` from `JSON.parse`, `response.json()` and similar.
- **Considered:** relying on `tsc` alone (`noImplicitAny` only covers _unannotated_ code; `JSON.parse()` still returns `any` silently), or a grep in CI.
- **Why:** verified with a probe file. ESLint flagged an explicit `any`, a `@ts-ignore`, and four separate `any` leaks from one `JSON.parse` call. The `@ts-ignore` really did hide a type error from `tsc`, which shows why it has to be banned.
- **Untrusted data pattern:** anything from outside (request bodies, `localStorage`, URL params, `<select>` values) is typed `unknown` and narrowed with type guards (`isCategory`, `isSortOption`, `isSeverity`, `isMockRoute`, `isObject`). The remaining `as` casts are limited to (a) data the app wrote itself (`localStorage` snapshots, after a shape check) and (b) test fixtures, where the cast states the expected response shape and `expect()` verifies it.

### Request status: a discriminated union

- **Used:** `RequestState<T, E> = { status: "idle" } | { status: "loading" } | { status: "success"; data: T } | { status: "error"; error: E }` in `src/types/request.ts`.
- **Considered:** separate `isLoading` / `error` / `data` fields (Week 1 had `status` + `error` + `bugs` as three `useState`s).
- **Why:** three independent fields allow 2³ combinations, most of them nonsense ("loading, with an error, and data"). With the union, `data` **exists only** when `status === "success"`, and TypeScript forces the check before reading it. The probe confirmed that `{ status: "loading", data: [...] }` and reading `state.data` unchecked are both compile errors.
- **Applied:** `App` holds one `RequestState<Bug[]>` instead of three states. `LoadGate` is generic and takes a **render prop** `children: (data: T) => ReactNode` that is only called in the success state, so a page _can't_ render before its data exists. Its `switch` covers every status, and `noImplicitReturns` fails the build if a new status is added but not handled.

### Contract types: one source of truth

- **Used:** `src/types/api.ts` holds `Product`, `ApiError` (with a typed `ApiErrorCode` union), and request/response types for every endpoint. `CATEGORIES`/`SORTS` are `as const` arrays, and the union types are derived from them, so the runtime list and the type can't diverge.
- **Why:** the mock (`src/mocks/`) and the app import the same types. If the contract changes, both sides fail to compile until they agree. D1-4's data layer will be typed against the same file.
- `Cents` is a plain alias, not a branded type. Branding would need a cast every time JSON enters the app. The name documents the unit, and `formatPrice` (D2-1) will be the single place cents become a string.

### A real bug the migration caught

TypeScript flagged `onUnhandledRequest` as an unknown option. **MSW 3 renamed it to `onUnhandledFrame`**, and the D1-2 JavaScript had silently ignored it:

- the contract tests' "error on any unmocked request" safety net was never active
- the browser used the default `"warn"` instead of `"bypass"`

Both are fixed now. A good example of types catching what tests didn't (logged in `docs/ai-notes.md`).

---

## D1-4: Data layer

### One client, one entry point: `src/api/`

- **Used:** a thin wrapper over `fetch` (`src/api/client.ts`) with typed endpoint functions (`products.ts`, `auth.ts`, `orders.ts`), exposed only through `src/api/index.ts`. Components call `getProducts()`, `login()`, `createOrder()` and so on, never a URL.
- **Considered:**
  - **axios:** interceptors and timeouts out of the box, but ~13 KB for features `fetch` + `AbortSignal` now cover natively.
  - **RTK Query / TanStack Query right away:** they solve caching (D3-5) and request state (D2-3), but they're a caching layer _on top of_ a transport, not a replacement for it. Adopting one now would blur D1-4 into D3.
- **Why:** one `request()` function is the single place for base URL, JSON, auth header, timeout, cancellation, error normalization and response validation. Changing any of these later (a real backend, a token refresh) touches one file.
- **Forward plan:** D3 (Redux Toolkit) will likely use RTK Query for caching. Its `baseQuery` will wrap this `request()`, so the "one place" stays one place.

### Enforced, not just a convention

- **Used:** ESLint rules for every file in `src/` outside `src/api/`, `src/mocks/` and the `main.tsx` bootstrap:
  - `no-restricted-globals` bans `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource`
  - `no-restricted-properties` bans `window.fetch` (and `globalThis`/`self`)
  - `no-restricted-imports` bans `axios`/`ky`/`msw`, any import from `mocks/`, and deep imports into `api/` other than `api/index.ts`
- **Verified** with a probe component: all six bypass attempts fail lint. `npm run check` (and CI in D4-6) therefore guarantee D1-4's "components never make network calls directly".
- `WebSocket` is banned too, so D4-4's live stock feed must also live in `src/api/`.

### Errors: one class, classified by `kind`

- **Used:** `ApiRequestError` with `kind: "http" | "network" | "timeout" | "aborted" | "invalid-response"`, plus `status`, `code` and `details` from the contract's `ApiError` body.
- **Why:** UI code needs to answer "what should I show?", and the answer depends on the _kind_ of failure:
  - `aborted` means the user moved on, so show nothing (D2-4, D2-6)
  - `network` / `timeout` / 500 mean show a retry option (D2-3)
  - 400 maps `details` onto form fields
  - 401 means the session is gone
  - 409 means name the out-of-stock item from `details` (D3-2)

  D3-4 will map these to user-facing copy. The class keeps the server's `message` only for logging.

- **Timeout vs abort:** the client combines the caller's signal with `AbortSignal.timeout()` (`AbortSignal.any`). When the request fails, it checks _which_ signal fired, so a user cancellation is never mistaken for a slow server.
- **401 handling is scoped:** only `auth: true` calls notify `onUnauthorized`. A 401 from `POST /login` means wrong credentials, not an expired session, and must not log anyone out. This is covered by a test.

### Validate at the boundary: Zod (`zod/mini`)

- **Used:** a schema per contract response (`src/api/schemas.ts`). `request()` requires one, so no unvalidated JSON can enter the app. Each schema is declared `satisfies ZodMiniType<T>` against the hand-written contract type, so the two can't drift.
- **Considered:** casting `response.json() as T` (zero cost, but a lie: a contract mismatch surfaces later as `undefined` deep in a component); hand-written type guards (verbose for nested shapes); full `zod` (~13 KB gzipped) versus `zod/mini` (~2 KB, tree-shakable functional API).
- **Why:** the contract is the thing every task builds on. If the server (or the mock) breaks it, the app fails _at the boundary_ with a clear `invalid-response` error naming the endpoint, instead of rendering `NaN` prices. Error bodies are parsed leniently (any string `code`), so a new server code still reaches the UI.

### Session wiring without a circular import

- **Used:** `configureApiClient({ getToken, onUnauthorized })`. The session layer (D3-1/D3-3) injects how to read the token and what to do on 401. The client doesn't import the store.
- **Why:** if the API imported the store and the store imported the API (thunks), the two would form an import cycle and be hard to test. Tests use the same hook to inject a fake token and spy on `onUnauthorized`. It returns a restore function for isolation.

### Week 1 board

The legacy `fetchBugs()` fake moved from `src/mocks/` into `src/api/bugs.ts` (`getBugs()`), so even the old board gets its data through the data layer. It's deleted when the product grid lands (D2-1).

---

## D2-1: Product list

### Money: integer cents, formatted in exactly one place

- **Used:** prices stay integer cents everywhere (API, state, future cart math). `formatPrice(cents)` in `src/utils/formatPrice.ts` is the only place they become text, using one shared `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`.
- **Considered:** `(cents / 100).toFixed(2)` with a `$` prefix (no thousands separator, not locale-aware); dividing into dollars when data arrives (floats then spread through the app: `0.1 + 0.2 = 0.30000000000000004`).
- **Why:** converting at the last moment means no float rounding can build up in totals. `Intl` handles separators and the currency symbol correctly (`123456` → `$1,234.56`, `5` → `$0.05`). The formatter is created once at module level, because constructing `Intl` objects per card would be wasteful. `formatPrice` **throws** on non-integers, because `19.99` means someone passed dollars, and failing loudly beats displaying `$0.20`.

### Keyboard: one Tab stop per card (stretched link), not an ARIA grid

- **Used:** a semantic `<ul>` of cards. Only the product name is a `<Link>`. Its `::after` pseudo-element covers the card, so the whole card is clickable (the "stretched link"). The focus ring is drawn around the whole card with `:has(.product-card__link:focus-visible)`.
- **Considered:**
  - **Wrapping the whole card in `<a>`:** the link's accessible name becomes everything inside ("Decaf Pods #1 $34.99 In stock (52) Rated 4.5 out of 5"), read out on every Tab.
  - **`role="grid"` with arrow-key navigation (roving tabindex):** the ARIA grid pattern is for interactive _tabular_ data such as spreadsheets. On a product list it changes how screen readers announce and navigate it, and users don't expect arrow keys there.
- **Why:** Tab and Shift+Tab move card to card. Enter opens the details page. Screen readers announce "list, 24 items" and a short link name. Price and stock are ordinary content that can be read in browse mode.
- **Focus management:**
  - Opening a product moves focus to its `<h2>` (`tabIndex={-1}`), so screen reader users hear where they landed.
  - Paging moves focus to the "Products" heading, so keyboard users aren't stranded at the bottom. `focus()` also scrolls it into view. I first added `scrollIntoView()` too, but it was redundant (and jsdom flagged it).
  - Programmatically focused headings get no focus ring, because a ring on non-interactive text looks clickable (caught in a screenshot review).
  - A "Skip to content" link is the first Tab stop.
- **Stock in words, not just color** ("In stock (52)", "Only 3 left", "Sold out"; WCAG 1.4.1). The image is a decorative category illustration next to the name, so `alt=""`.

### Structure: container and presentational components

- **Used:** `ProductsPage` and `ProductDetailPage` own data loading (via `src/api/`), request state and paging. `ProductGrid`, `ProductCard`, `StockStatus` and `Pagination` only render props. This is one of the D5-2 patterns.
- **Why:** the presentational parts are trivially reusable and testable, and D4-3 can memoize or virtualize the grid without touching data code.

### Details page: remount per product (`key={id}`)

- **Used:** the route renders `<ProductDetailPage key={id} id={id} />`. Each load uses an `AbortController` that aborts in the effect cleanup.
- **Why:** with a key, going from product A to B mounts a _fresh_ component. State resets to "loading" for free, and the old product can never flash. The alternative, resetting state inside the effect, is the pattern React's docs advise against (an extra render with stale data). The abort means a slow response for A can't land after B. D2-4 builds on this (Back to Top listener, rapid-switch tests).

### Pagination now, URL later

- **Used:** Previous/Next with "Page X of Y", 24 per page (local `useState`).
- **Why:** the contract is paginated (`page`, `total`). D2-2 moves page and filters into the URL (refresh/share/Back), and D4-3 revisits how 5,000 items scroll (virtualization or infinite loading). Nothing here blocks either.

### Skipped (on purpose)

- **`React.memo` on `ProductCard`:** I first added it, then removed it. With 24 cards per page and no frequent parent re-renders yet, there's nothing to save, and D4-3 requires each optimization to be justified by a measurement. It goes back in only if the profiler shows a need (likely once live stock updates arrive in D4-4).

### Testing: React Testing Library + jsdom

- **Used:** `@testing-library/react` + `user-event` in jsdom, with the **real** app, data layer and MSW handlers (`products.test.tsx`). The tests drive the UI the way a user does: `user.tab()`, `{Enter}`, queries by role and accessible name.
- **Why:** "the grid works with a keyboard" is now a regression test, not a claim. It asserts exact Tab order (skip link → title → card 1 → card 2), that Enter opens details, and that focus lands on the heading. Logic tests stay in the faster Node environment, and component tests opt into jsdom per file.
- **Boundary rule:** test files may import `src/mocks/`; production UI code still may not (ESLint).

### Week 1 board removed

The bugs feature, `LoadGate`'s bug-specific copy and `src/api/bugs.ts` are gone. `/` is now the store. `LoadGate` takes `loadingText` / `errorText`, so pages show friendly copy and never a raw error message (a first step toward D2-3 and D3-4).

---

## D2-2: Filters

### The URL is the single source of truth

- **Used:** search, category, in-stock, sort and page live **only** in the URL query (`useSearchParams`). The page parses them on every render (`parseFilters`), and every change writes a new URL (`toSearchParams`). There's no filter state in React, Redux or `localStorage`.
- **Considered:**
  - **`useState` + syncing to the URL in an effect:** two copies of the truth, and the classic bug is the sync loop or a one-render mismatch after Back.
  - **Redux / `localStorage`:** survives a refresh, but a copied link wouldn't reproduce the view, and Back wouldn't undo filters.
- **Why:** the three "Done when" criteria are all properties of the URL. A refresh reloads the same URL. A copied link _is_ the view. Back and Forward walk through URL history. With the URL as the only state, all three come for free and can't drift apart.
- **Canonical URLs:** defaults are omitted (the unfiltered list is just `/`), and params are always written in the same order. Equivalent views get identical URLs, which keeps links short and gives D3-5 stable cache keys.
- **Untrusted input:** anyone can edit a URL, so `parseFilters` validates every value with type guards. Unknown values (`?category=bogus&page=-3`) fall back to defaults instead of breaking the page.

### History: push for choices, debounce for typing

- **Used:**
  - Selects, the checkbox, paging and Clear each **push** one history entry.
  - Search keeps a local draft and commits to the URL 300 ms after typing stops (`useDebouncedCallback`), as **one** pushed entry. Enter commits immediately.
- **Considered:** pushing every keystroke (Back would undo one letter at a time); `replace` for search (Back would skip searches entirely); a Search button only (no live results, and D2-6 expects search-as-you-type).
- **Why:** each Back press should undo one _intention_. A test asserts that typing "beans" creates exactly one entry, and that one Back removes the whole search.
- **Changing a filter resets to page 1.** Page 7 of "all products" means nothing for "coffee". Paging itself keeps the filters.

### Keeping the search box honest after Back

- **Problem:** the input has a local draft, so when the URL changes from elsewhere (Back, Clear, a pasted link), the draft would show stale text. Worse, a still-pending debounced commit could fire _after_ Back and re-push the old search.
- **Solution:**
  - The draft is re-synced from the URL using React's "adjust state during render" pattern (compare with the last synced value, then set state). There's no effect, so no frame with the stale value.
  - Any external change to the URL's search **cancels** the pending commit.
  - The comparison uses the trimmed draft, so a commit doesn't wipe a trailing space the user is still typing.

### `useDebouncedCallback` (first custom hook; D2-5 builds on it)

- **Used:** a framework-free `createDebouncer` (the timer lives in a closure) wrapped by a small hook. The hook installs the latest callback in an effect, so it never calls stale props, and it cancels on unmount, so nothing runs after the page closes (D2-4). It exposes `call`, `cancel` and `flush`.
- **Lint pushback:** my first version kept the timer in `useRef` and built the functions inside `useMemo`. The React Compiler lint (`react-hooks/refs`) flagged that refs might be read during render. Moving the timer into a plain closure fixed it properly, without disabling the rule. It also made the core debouncer testable without React.

### Loading state follows the URL

- **Used:** the page derives one canonical `queryKey` string from the filters. When it changes (any source: a control, Back, a link), the state is reset to loading **during render**, and the fetch effect, keyed on `queryKey`, aborts the previous request.
- **Why:** previously, the paging handler set "loading" itself, but Back changes the URL without calling any handler. Deriving loading from the key covers every way the URL can change. The abort keeps a slow old response from overwriting newer results. D2-6 stress-tests that with out-of-order responses.

### UX details

- **Result count:** "1,069 products match your filters". It lives in a `role="status"` live region, so screen reader users hear the new count after each change, without focus moving.
- **Clear filters:** shown only when a filter is active, plus a second Clear button in the empty state ("No products match your filters."). An out-of-range page (a stale link to page 40) gets "That page doesn't exist" with a link to page 1, instead of a misleading "no products".
- **Back to products** on the details page returns to the exact filtered list. The list's query string travels in router `state` (narrowed from `unknown` with a guard). The details URL stays clean and shareable, and visiting it directly still gives a sensible "Back" to `/`.
- **Native controls:** `<form role="search">` with visible `<label>`s, a real `<select>`, a checkbox and `type="search"`. They're keyboard and screen reader accessible without ARIA. The keyboard test now asserts the full Tab order through every filter.

### Contract extension used

The in-stock filter uses the `inStock=true` extension added in D1-2. Filtering client-side would have broken `total` and pagination.

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

---

## D2-3: UI states

### One component per state, one gate for all pages

- **Used:** `src/components/states.tsx` provides `LoadingState`, `EmptyState` and `ErrorState`, all built on one internal `StateCard` (icon, title, description, actions). `LoadGate` maps a `RequestState` to exactly one of loading, error, empty or success, and both pages go through it.
- **Considered:** each page rendering its own `<p>Loading…</p>` and error box (what D2-1 had). It works, but pages drift apart: different wording, button labels, focus behavior.
- **Why:** "looks consistent across pages" is then a property of the code, not of discipline. A test renders the list and details error states and asserts the **same structure** (classes, icon, title, buttons).

### "Empty" is derived, not a fifth status

- **Used:** `LoadGate` takes `isEmpty(data)` + `empty`. `RequestState` stays `idle | loading | success | error`.
- **Why:** an empty result _is_ a successful response (`{ items: [], total: 0 }`). Storing "empty" separately would duplicate what the data already says. Deriving it keeps the D1-3 union honest.
- **Empty states always offer a way forward:** "Clear filters" for no matches, "Go to page 1" for an out-of-range page, "Back to products" for a missing product.

### 404 is "not found", not an error

- **Used:** the details page passes `renderError` and shows an `EmptyState` ("Product not found" + Back to products) for 404. Every other error falls through to `ErrorState`.
- **Why:** retrying can't make a missing product appear, so "Try again" would be a dead end. It's a neutral state, not a red error.

### Error copy by failure kind, never the raw message

- **Used:** `describeLoadError(error, subject)` in `src/utils/describeError.ts` (moved to `src/errors/` and rebuilt on `classifyError()` in D3-4) branches on the `ApiRequestError` kind and status from D1-4:

  | Kind                          | Title                      |
  | ----------------------------- | -------------------------- |
  | `network`                     | "You seem to be offline"   |
  | `timeout`                     | "This is taking too long"  |
  | 5xx                           | "Our server hit a problem" |
  | `invalid-response` and others | "Something went wrong"     |

  Each title is followed by "We couldn't load {subject}." and next-step advice.

- **Why:** the user can act on "check your connection", but not on "HTTP 500". The server's `message` is for logs (D4-7). A unit test asserts no kind leaks it. I first used "Something went wrong on our side" for 5xx, which nearly duplicated the mock's own message and made the "raw message never shown" test meaningless, so I reworded it.
- D3-4 extends this for 400 (form fields), 401 (sign out) and 409 (out of stock).

### Loading: skeletons, not spinners

- **Used:** grid and details skeletons in the same shapes as the real content (`aria-hidden`), plus a visually hidden `role="status"` label ("Loading products…"). The content region gets `aria-busy`. The shimmer animation turns off under `prefers-reduced-motion`.
- **Why:** the layout doesn't jump when data arrives (a CLS win for D4-2). Screen readers hear a short text instead of 8 empty boxes.
- **Skipped:** a delay before showing skeletons (to avoid a flash on fast loads). With the mock's 300–600 ms latency there's no flash to avoid. I'd add it if a real backend answers in under ~150 ms.

### Retry keeps focus in place

- **Used:** `LoadGate` wraps its content in a focusable region (`tabIndex={-1}`). "Try again" calls the retry and moves focus to that region.
- **Why:** the button disappears the moment loading starts. Without this, keyboard focus falls back to `<body>`, and screen reader users are sent to the top of the page. Focus then moves on naturally (on the details page, to the loaded product's heading).

### Triggering every state on purpose

| State        | How                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading      | QA panel "Loading (slow 4s)" or `bazaarMock.latency(4000)`                                                                                                             |
| Server error | QA panel "Server error (500)" or `bazaarMock.fail(route, 500)`                                                                                                         |
| Offline      | QA panel "Offline" or `bazaarMock.fail(route, "network")`: **new** mock mode that drops the connection (`HttpResponse.error()`), so `fetch` rejects like a real outage |
| Empty        | QA panel "Empty results" or `/?search=no-such-product`                                                                                                                 |
| Not found    | QA panel "Not found (404)" or `/products/p-9999`                                                                                                                       |
| Recover      | QA panel "Stop errors", then the page's **Try again**                                                                                                                  |

- **QA panel** (`src/dev/QaPanel.tsx`): a collapsible corner panel, shown only while the mock API is on and lazy-loaded into its own chunk (confirmed in the build output). It uses the global `window.bazaarMock` console API, so it doesn't import mock code, and the D1-4 lint boundary still holds.

### A hard bug: StrictMode used up the forced error

- **Symptom:** in the browser, "fail the next request" (`{ once: true }`) often did nothing, and the page loaded normally. The tests passed, because they don't render in StrictMode.
- **Cause:** React StrictMode (development only) mounts effects twice. The first request is aborted immediately, but it **still reaches the mock** and consumes the one-shot failure, so the real request succeeds. Which request "won" depended on random latency jitter, so it looked flaky.
- **First idea, disproved:** check `request.signal.aborted` in the mock and skip cancelled requests. I tested it in the browser: **the Service Worker doesn't forward aborts to the handler**, so the signal is never aborted there. I removed the check rather than leave code that only _looks_ like it works.
- **Fix:** the QA panel uses **persistent** failures plus an explicit "Stop errors" step. That's deterministic in every environment: trigger, see the error, stop, then Try again shows recovery (verified in Edge). One-shot failures remain for Node tests and console use, with the caveat documented in `docs/api-contract.md`.
- **Lesson:** tests in jsdom don't exercise StrictMode or a real Service Worker. The browser check caught what 86 passing tests didn't.

---

## D2-4: useEffect and cleanup

### Every effect on the details page has a matching cleanup

| Effect                      | Cleanup                                        | Why it matters                                                       |
| --------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| Fetch the product           | `AbortController.abort()`                      | A slow response for product A can't be written into product B's page |
| Fetch related products      | `abort()`                                      | Same, for the second request on the page                             |
| Document title              | Restore the previous title                     | The tab title never shows a page you've left                         |
| Back to Top scroll listener | `removeEventListener` + `cancelAnimationFrame` | No listener or pending frame survives the page                       |
| Focus the heading           | None (one-off, synchronous)                    | Nothing outlives the call                                            |

The table is also at the top of `ProductDetailPage.tsx`, so the code says the same thing.

### Two layers against "wrong product" bugs

- **`key={id}` on the page:** navigating from A to B unmounts A's component and mounts a fresh one for B. B's state _starts_ as "loading". There's no render where B's URL shows A's data.
- **Abort in the cleanup:** A's request is cancelled at the network level, so its `.then` never runs. The `ignore` flag from Week 1 would also prevent the state write, but it lets the request finish in the background. Aborting frees the connection and is visible in DevTools as "(canceled)".
- **Considered:** an `ignore` flag only (the request keeps running); a request-sequence counter (works, but more code than `AbortController`, which every `fetch` already supports through the D1-4 client).

### Back to Top

- **Used:** `useScrolledPast(threshold)` registers a **passive** scroll listener throttled with `requestAnimationFrame` (at most one check per frame), and only re-renders when the boolean flips. `BackToTop` renders nothing while hidden, so it's never an invisible Tab stop. Clicking scrolls up (instant if the user prefers reduced motion) and moves focus to `#main`, so keyboard users aren't left at the bottom.
- **Considered:** `IntersectionObserver` on a sentinel element at the top. It's arguably more efficient (no scroll events at all), but the task asks for a listener to clean up, and the rAF throttle makes the scroll cost negligible. I'd switch to IO if profiling (D4-2) showed scroll work.
- Also on the list page, where it's genuinely useful (long grid). It's the same component and the same cleanup.

### Proving it

- **"Never shows the wrong one":** tests give each product a different response delay (A slow, B fast) and switch before A answers. A `MutationObserver` records **every heading ever rendered**, and the assertion is that A's name never appeared, not just that the final heading is B. Each request's `AbortSignal` is captured to assert A really was cancelled. There's also a burst test (A → C → B) and a related-products abort test.
- **"Nothing keeps running":** spies on `addEventListener` / `removeEventListener` check that every scroll handler added by the details page is removed after navigating away. `requestAnimationFrame` is stubbed so a frame is guaranteed to be pending, and the test asserts it was cancelled with that exact id. Also covered: the in-flight request aborts on leaving, and the title is restored on unmount.
- **Mutation check:** I temporarily removed `key={id}` and the `abort()` cleanup. 3 of the 7 D2-4 tests failed (stale product shown, requests not cancelled), then passed again once restored. The tests guard the behavior; they don't pass vacuously.
- **Real browser** (Edge, StrictMode, Service Worker):
  - Scroll listeners counted with DevTools' `getEventListeners(window)` go 0 → 1 → 0 (404 page → details → left). StrictMode's double mount leaves no extra listener.
  - Switching through three related products within ~240 ms, with random 0.6–1.8 s responses, only ever rendered the final product.

---

## D2-5: Custom hooks

### The hooks, where they're used, and what they replaced

| Hook                                                                           | Used by                                                | Duplication removed / why it's a hook                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`useRequest(key, fetcher)`**                                                 | `ProductsPage`, `ProductDetailPage`, `RelatedProducts` | The fetch → `RequestState` → `AbortController` → ignore aborts → retry → reset-on-key-change block was copied three times. The three pages lost **85 lines** (gaining 22 lines of hook calls), and `new AbortController()` now appears once in the UI layer. |
| **`useDebouncedCallback(fn, ms)`** (built on framework-free `createDebouncer`) | `ProductFilters` search; any future debounced input    | Timer + latest-callback + cancel/flush + unmount cleanup is easy to get subtly wrong (stale closures, timers firing after unmount), so it's written and tested once.                                                                                         |
| **`useScrolledPast(px)`**                                                      | `BackToTop` (on list and details pages)                | Passive listener + rAF throttle + cleanup.                                                                                                                                                                                                                   |
| **`useDocumentTitle(title)`**                                                  | `ProductsPage`, `ProductDetailPage`                    | Set the title, restore on cleanup. Every page needs it.                                                                                                                                                                                                      |

All are fully typed (`useRequest<T>` infers `T` from the fetcher, so the pages got correct `RequestState<ProductListResponse>` / `RequestState<Product>` types with no annotations).

### `useRequest` design: a key, not a dependency array

- **Used:** `useRequest(key: string | null, fetcher: (signal) => Promise<T>)`. The **key** says _which_ request this is. When it changes, the old request is aborted and the state resets to loading **during render**, so there's no frame with the previous key's data. `null` means "don't fetch" (idle). The fetcher is held in a ref updated after each render, so it always uses the latest props, and its changing identity doesn't refetch.
- **Considered:**
  - **`useRequest(fetcher, deps[])`** like `useEffect`. Familiar, but the lint rule can't check custom dependency arrays without extra config, and a forgotten dependency fails silently.
  - **TanStack Query / SWR now:** they do this plus caching and deduplication. D3-5 (caching) is the right moment to adopt one (or RTK Query). The key-based API was chosen so that migration is mechanical: the same keys become query keys.
- **The contract:** the fetcher may only use values encoded in the key (`products` uses the canonical URL query string, details uses the id, related uses `related:{category}:{id}`). This is the same rule SWR and TanStack Query use.

### Proving the hooks

- **Direct `renderHook` tests** (`src/hooks/hooks.test.tsx`, 15 tests), with hand-controlled promises (`deferred()`) so tests decide when and in what order responses arrive:
  - **useRequest:** loading → success; null key never fetches; a new key aborts the old signal and resets in the same render; a late stale answer is ignored; errors; retry; aborts are ignored; unmount aborts; no stale fetcher closure.
  - **Debouncer** (fake timers): runs once with the last args; cancel; flush; stable identity; latest callback; unmount cancels.
  - **Title and scroll hooks:** set and restore; flip only at the threshold.
- **The refactor was behavior-preserving:** all 94 earlier tests passed unchanged after the three pages switched to `useRequest`, including D2-4's rapid-switching and abort tests.
- **Mutation check:** I removed `useRequest`'s abort and stale-response guard. **8 tests failed**, both the hook's own unit tests and the pages' integration tests, then all passed again once restored.

### Not extracted (on purpose)

- **`useLocalStorage`:** the obvious "sync state with storage" example from the brief, but nothing needs it yet. The cart (D3-1/D3-2) will persist through Redux, where a store-level subscriber is the right place. A hook with no caller would be speculative code.
- **`useFocusOnMount`** (focus the heading after navigation): used once in `ProductDetails`. I'll extract it if a second page needs it.

---

## D2-6: Race conditions

### The problem

Typing "duck" can send requests for `d`, `du`, `duc` and `duck`. Responses can come back in **any** order. If `du`'s answer lands after `duck`'s, the screen shows results for an old query under a box that says "duck". A debounce makes this rarer (fewer requests), but it can't prevent it: pausing for longer than the debounce still sends several requests.

### Simulating it: deterministic "race mode"

- **Used:** `bazaarMock.race(stepMs)` (QA panel: "Race mode") adds `stepMs × (6 − search length)` to product-list responses. **Shorter (older) searches answer slower**: with 400 ms steps, `d` takes 2 s and `duck` 0.8 s, so responses arrive in _reverse_ order.
- **Considered:** random jitter only (already there since D1-2). It's realistic but random: a demo or test might not hit the bad ordering at all.
- **Why:** the worst case, every time, so it can be demoed live and asserted in tests.

### The fix: three layers

1. **Debounce (D2-2):** typing fast sends one request for the final query. A test asserts exactly one request for "keyboard".
2. **Cancel on key change (`useRequest`, D2-5):** a new query aborts the previous request, so it never resolves into state. A check on `controller.signal.aborted` also covers a response that resolves in the same tick as the abort.
3. **Show staleness honestly (new):** while a typed search is waiting for its pause, the results dim (`.results--stale`, `aria-busy="true"`) and the live count says "Searching…". Old results are never presented as if they belonged to the new text. The count then names its query: **"1,228 products for “duck”"**.

- **Considered:**
  - **Sequence numbers:** ignore any response older than the latest request id. It works too, but leaves old requests running. Aborting frees the network and is visible in DevTools.
  - **`ignore` flag only:** same downside.
  - **Hiding results while typing:** jarring. Dimming keeps context.
- **Small related fix:** a search that ends up where it started (type "x", then Backspace) no longer pushes a duplicate history entry or refetches. `updateFilters` skips no-op URL changes.

### Proving it

- **The race test** (`searchRace.test.tsx`): race mode on, typing "duck" with pauses longer than the debounce, so every prefix is sent. A `MutationObserver` records every result summary shown. For each one ("N products for “X”"), N must equal the **true total for X**, computed from the mock data. This catches the real bug (stale _data_ under a new label), not just stale labels. The shown queries must only move forward (d → du → duc → duck), end on "duck", and stay there after every slower response has arrived. Older requests are asserted aborted.
- **Mutation check:** I removed the abort and stale guard from `useRequest`. The race test failed with "expected 1341 to be 1228": an older prefix's results appeared under "duck". Restored, it passed.
- **Real browser** (Edge, StrictMode, Service Worker, race step 400 ms): typing "duck" with 400 ms pauses showed only "Searching…" and then "1,228 products for “duck”". This holds even though the Service Worker still answers the cancelled requests (it doesn't forward aborts, as found in D2-3), because the client's aborted `fetch` discards them.

### What I'd explain in the walkthrough

- **Why not just debounce?** A debounce reduces requests but doesn't order responses. Any pause longer than the debounce sends another request.
- **Why abort rather than compare ids?** Both prevent stale writes. Aborting also stops the work and shows up in DevTools as "(canceled)". On a real backend with an HTTP/1.1 connection limit, it frees the connection for the request that matters.

---

## D3-1: Redux Toolkit

### What lives in the global store, and what doesn't

| State                         | Where                                              | Why                                                                                                    |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Cart lines                    | Redux `cart` slice                                 | Shared by the header badge, details page and cart page. Must survive navigation (and reload, in D3-2). |
| Session (token + user)        | Redux `session` slice                              | Read by the API client, the header and route guards (D3-3).                                            |
| Filters, sort, page           | URL (D2-2)                                         | Shareable and Back-able. Redux would break both.                                                       |
| Server data (products)        | `useRequest` (D2-5); a caching layer comes in D3-5 | It's a copy of the server's data, not app state.                                                       |
| Form drafts, "added" messages | Component state                                    | Nobody else needs them.                                                                                |

Global state is only what multiple distant parts of the app must share and change.

### Slices and "defined updates"

- **Cart:** the actions `itemAdded`, `quantityChanged`, `itemRemoved` and `cartCleared` are the _only_ ways to change it.
  - Business rules sit in the reducer, in one place: quantities are clamped to `0…stock`, adding merges with an existing line, quantity 0 removes the line, and sold-out products are ignored. The UI can't put the cart into an invalid state even by accident.
  - Lines store a **snapshot** (name, price, image, stock), so the cart page and badge work without refetching every product. D3-2 refreshes stock and price at checkout.
- **Session:** a discriminated union, `{ status: "anonymous", endedBecause } | { status: "authenticated", token, user }`. "A token but no user" can't be represented, the same idea as `RequestState` in D1-3. `endedBecause: "expired"` lets D3-3 tell the user _why_ they were signed out.
- **Enforced at runtime too:** Immer freezes the state it produces. A test shows that pushing to `state.cart.items` or assigning `line.quantity` **throws** `TypeError` outside a reducer. In development, RTK's default middleware also flags mutations and non-serializable values.
- **TypeScript gotcha:** writing `const initialState: SessionState = { status: "anonymous", … }` _narrows_ the constant to the anonymous member, and `createSlice` then infers that as the slice's only state. A tiny `anonymous()` factory with a `SessionState` return type keeps the full union without a cast.

### Derived values: count and total are never stored

- **Used:** `selectCartCount` (sum of quantities) and `selectCartTotal` (sum of `price × quantity`, in **cents**) built with `createSelector`. The header badge (`CartLink`) and the cart page read these. Nothing stores a count or total that could drift.
- **Memoized:** they recompute only when `cart.items` changes. A test uses `recomputations()` to show that an unrelated session update doesn't recompute the count.
- **Accessible badge:** the link's name is "Cart, 2 items" (the visual number is `aria-hidden`), and "Added to cart" is announced in a polite live region without moving focus.

### Wiring the store to the data layer

- **Used:** `connectApiToStore(store)` passes `configureApiClient` (the D1-4 injection point) a `getToken` that reads the session, and an `onUnauthorized` that dispatches `sessionEnded({ reason: "expired" })`. It's called once in `main.tsx`.
- **Why:** the API layer never imports the store, and the store doesn't import the API client, so there's no import cycle. A test runs real requests through MSW to show that the token is sent, and that a 401 on an authenticated call ends the session. (D3-3 builds the login/logout UI on top.)

### Store factory and tests

- **`makeStore()`, not a module singleton:** the app creates one store; every test (`TestApp`) gets a fresh one, so cart state can't leak between tests.
- **Typed hooks** (`useAppSelector`, `useAppDispatch` via `.withTypes()`): components get `RootState` / `AppDispatch` without annotations.

### Considered

- **Zustand / React context + `useReducer`:** less boilerplate, but the task asks for Redux Toolkit. RTK's selectors, frozen state and DevTools time-travel also make the "defined updates" guarantee concrete and inspectable.
- **RTK Query now:** it would replace `useRequest` with a cached data layer. That's D3-5's topic (caching), and `useRequest`'s keys were designed to map onto query keys.
- **Persisting the cart now:** "the cart survives a reload" is a D3-2 criterion, so it lands there.

---

## D3-2: Cart

### Quantities can't exceed stock: enforced in the reducer, helped by the UI

- **Used:** the cart reducer clamps every quantity to `1…stock` (D3-1). The cart page's stepper disables + at stock, shows "Only N available", and clamps typed values on Enter or blur. The number input keeps a local draft, so typing "1" on the way to "12" doesn't get fought mid-keystroke.
- **Why:** the store is the guarantee and the UI is the help. A bug in any component still can't put 99 ducks in a cart that only has 3 in stock.
- **Stock goes stale**, because other shoppers buy things too. So the server has the final word at checkout (409, below), and the cart's `stockRefreshed` action corrects lines with fresh numbers.

### The cart survives a reload: `localStorage` + validation

- **Used:** `persistCart(store)` subscribes to the store and writes `cart` to `localStorage` **only when the cart reference changes** (immutable state, so a new reference means the cart changed and an unrelated session update writes nothing). At startup, `loadCart()` reads it back, **validates it with a Zod schema**, re-applies the cart rules (never above stock, no empty lines) and passes it to `makeStore` as preloaded state.
- **Considered:** `redux-persist` (a dependency plus rehydration actions for one slice); `sessionStorage` (lost when the tab closes, which is not what "survives" means for a shopping cart).
- **Why validate:** storage is untrusted. Old app versions, manual edits and other tabs can leave anything there. Corrupt or wrongly shaped data results in an empty cart, not a crash.
- **Not done:** cross-tab sync (a `storage` event listener that replaces the cart). Two tabs can diverge until reload. A small, clear next step if needed.

### A 409 names the item that ran out, and fixes the cart

- **Used:** the 409 body's `details` are keyed by productId (D1-2 contract). `placeOrder()` refetches **only those products**, dispatches `stockRefreshed` (lowering quantities, removing sold-out lines), and shows each item by name: "**Decaf Pods #1** only has 1 left, so we lowered the quantity in your cart" / "… just sold out and was removed".
- **Names come from our own cart lines**, never from the server's message text (D3-4: raw messages never reach the screen). The user then reviews and places the order again.

### A retried checkout doesn't create a duplicate: idempotency keys

- **Used:** each checkout attempt sends an `Idempotency-Key` header. The key is stored in `sessionStorage` under a **signature of the cart contents** (`p-0001x2,p-0042x1`, order-independent):
  - The same cart reuses the same key across retries, double-clicks and **a reload mid-checkout**.
  - A different cart (for example, after a 409 lowered a quantity) is a different order, so it gets a new key.
  - The key is cleared after success.
- **Server side** (the mock, D1-2): a repeated key for the same user returns the **original** order without taking stock again.
- **Considered:** a key per page view in component state (lost on reload, so a reload-then-retry could double-charge); disabling the button only (it stops double-clicks, but not "the response got lost, so the user retries"); generating the order id on the client (works, but the contract has the server assign ids).
- **The double-click guard** is two layers: the button is disabled while submitting, and the handler returns early if a submit is already in flight (covering a second click that lands before React re-renders).
  - **Correction (D3-3):** that early return read component _state_, which is stale until React re-renders, so a same-task double click got through. It is now a ref. See D3-3.

### Checkout flow

- **State:** a discriminated union, `idle | submitting | failed(problem)`, so "submitting with an error message" can't be shown.
- **Problems by kind:**

  | Kind                              | What the user sees                                                                         |
  | --------------------------------- | ------------------------------------------------------------------------------------------ |
  | out-of-stock (409)                | The item names, with the cart corrected                                                    |
  | session-expired (401)             | The session is already cleared by the D3-1 wiring; the cart is kept, with a sign-in prompt |
  | invalid-cart (400)                | A link to review the cart                                                                  |
  | retryable (offline, timeout, 5xx) | **Try again** with the same key, plus "you won't be charged twice"                         |

- **Success:** clear the cart and key, then go to `/orders/:id` with `replace: true`, so Back doesn't return to a finished checkout.
- **Order confirmation** polls `GET /api/orders/:id` every 3 s until "completed". Status changes are announced in a polite live region. Cleanup aborts the in-flight request and clears the timer (D2-4: a test shows no polls after unmount).
- **Signed out:** checkout shows "Sign in to check out" linking to `/login?returnTo=/checkout`. The login page itself is D3-3.
  - **Changed in D3-3:** checkout is now behind `RequireAuth`, which redirects to the login page directly. A 401 at checkout redirects the same way.

### Proving it

- **Tests** (`checkout.test.tsx`, `cartStorage.test.ts`):
  - stepper limits, typed values clamped, remove
  - persistence round-trip, corrupt data, rules re-applied, writes only on cart changes
  - a new app instance from saved storage
  - success
  - **409 naming two items**, with the cart corrected and the order succeeding afterwards
  - **lost response**: the server commits, the browser never hears back, the user retries, and the result is the same order id, one order, stock taken once, and the same key on both requests
  - 401 keeps the cart
  - double-click sends one request
  - polling advances and stops on unmount
- **Mutation checks:**
  - **New key per attempt** (no idempotency): the lost-response test failed. Good.
  - **No double-submit guards:** at first, **the test still passed**. With an instant mock response, the order finished and the page navigated away _before_ the second click, so the test never exercised the in-flight window. I fixed the test by holding the first request in flight for 200 ms. With guards removed it now fails, and with guards restored it passes. A test that can't fail proves nothing.
- **Real browser:** the stepper stopped at stock 3 with the limit message, the total was correct ($128.95), the cart survived a **real reload**, and checkout showed the sign-in prompt while signed out.

---

## D3-3: Auth

Full write-up, including the token-storage trade-off: [auth.md](auth.md).

### Token storage: `sessionStorage`

- **Used:** `{ token, user }` in `sessionStorage`, validated with a Zod schema on load. It's checked with `GET /api/me` once the mock is up: a 401 ends the session as "expired", while offline or 5xx keeps it.
- **Considered:**
  - memory only (every reload signs out)
  - `localStorage` (same XSS exposure, much longer life, shared by all tabs)
  - an `httpOnly` cookie (best against token theft, but the shared contract uses a Bearer header, and it needs CSRF protection)
- **Why:** it survives a reload and dies with the tab. Neither storage protects against XSS. Not running attacker script does: React escaping, no `dangerouslySetInnerHTML`, a CSP in production.
- **Cost:** a new tab starts signed out (the cart is still there).

### Protecting pages: a `RequireAuth` wrapper

- **Used:** `/account` and `/checkout` are wrapped in `RequireAuth`. Signed out, it renders `<Navigate to="/login?returnTo=…" replace>`. `replace` keeps the protected URL out of history, so Back from login doesn't bounce into the redirect again.
- **Why a component that reads the store:** it also reacts to a 401 _anywhere_. The session ends, the guard re-renders, and the user is redirected with the current page as the return path. One mechanism covers "not signed in" and "session expired".
- **Considered:** a loader or `redirect()` (needs the data router, a bigger change than this task); a signed-out branch inside each page (what checkout had in D3-2; duplicated per page).
- **Not security:** the server checks the token on every call. The guard only decides what to show.

### "A 401 clears the session", including stale 401s

- **Used:** the D3-1 wiring, plus one fix. The client now passes the token a request _sent_ to `onUnauthorized`. The session only ends if that token is still current.
- **Why:** a slow request with an old token can come back with a 401 after the user signed in again. Without the check, it would sign them out of the new session.
- A 401 from `POST /api/login` never ends anything: it means wrong credentials, not an expired session.

### Return to where the user was: validated `returnTo`

- **Used:** `loginHref(location)` builds `/login?returnTo=<path+query+hash>`. After sign-in, `safeReturnTo()` accepts only a **local path** (one leading `/`, no `//`, no `\`, no control characters). It checks both the raw value and the normalized result. Anything else goes to `/`, and so does `/login` itself (no loop).
- **Why both checks:** normalizing can _create_ a dangerous path. `/.//evil.test` passes a raw check, but resolving `.` gives `//evil.test`, which is another site. Mutation testing exposed this. See "Proving it".
- **Single redirect path:** the login page renders `<Navigate to={returnTo}>` whenever the session is authenticated. A successful submit just dispatches `sessionStarted`, and the same line handles "already signed in".

### The login form

- **State:** `idle | submitting | failed(fieldErrors, message)`.
- **Errors, by kind and status, with our own copy:**
  - 400 marks the fields named in `details`.
  - 401 says "email and password don't match" and clears the password.
  - Offline, timeout and other failures each get their own message.
  - Raw server messages never reach the screen (ahead of D3-4).
- **Focus:** on failure, focus moves to the first invalid field, or to the form message. `flushSync` renders `aria-invalid` and the error text _before_ focus moves, so a screen reader reads them together (groundwork for D4-1).
- **Can't be double-submitted:** the button is disabled, and a ref guard is checked first. The ref matters: a second submit in the same task arrives before React re-renders, when both the `disabled` attribute and the handler's view of state are still "idle". The checkout button had the same bug from D3-2 and got the same fix.

### Account and logout

- `/account` loads the profile from `GET /api/me` (not the stored copy). An expired token is noticed right there.
- **Log out** navigates home, then ends the session with `reason: "logout"`. Ending the session first would let `RequireAuth` redirect to the login page instead.
- The token isn't revoked on the server (the contract has no logout endpoint; noted in auth.md). The cart is kept: it belongs to the device.

### QA

- `bazaarMock.expireSessions()` and a QA panel button, **Expire session (401)**, invalidate every token on the mock server. The next signed-in request gets a real 401, not a forced one.

### Proving it

- **Tests** (`auth.test.tsx`, `returnTo.test.ts`, updated `checkout.test.tsx`):
  - sign in and return to `returnTo`
  - an unsafe `returnTo` goes home
  - a protected page redirects to login and back
  - wrong password: message focused, password cleared, still signed out
  - empty fields marked invalid with no request
  - a server 400 shows our copy, never the server's text
  - double-click plus Enter sends one request
  - two submits in the same task send one request
  - an expired token leads to login with the notice, then back
  - a late 401 for an old token doesn't end a newer session
  - a login 401 doesn't end a session
  - logout
  - storage saved and removed; corrupt data ignored
  - the startup check: 401 ends the session, offline keeps it
  - checkout signed out leads to login and back with the cart; a 401 at checkout keeps the cart and returns after sign-in
  - a same-task double click at checkout sends one order
- **Mutation checks:** each guarantee was broken on purpose. These were caught:
  - login guards removed
  - stale-token check removed
  - 401 not ending the session
  - session not removed on sign-out
  - the old state-based guard put back on login and on checkout

  Two weren't caught at first:
  - **`returnTo`: removing a validation line survived.** Every unsafe input in the tests normalized to `/`, the same value as the fallback, so "rejected" and "cleaned up" looked identical. Testing with a distinct fallback (`/fallback`) and thinking about what normalization produces found a real bypass: `/.//evil.test` becomes `//evil.test`. Fixed with the output check. Removing either check now fails a test. The origin check couldn't be made to fail by any input (a local path can't change origin), so it was removed as dead code.
  - **Double-submit:** the user-event test passed with a state-based guard, because user-event yields between events and the disabled button did all the work. The browser check found it (below).

- **Real browser** (headless Edge against the production build):
  - `/account` signed out redirected to `/login?returnTo=%2Faccount`
  - wrong password showed the message, focused it, and cleared the password
  - **click, click, submit in one task with an 800 ms server sent 3 login requests** on the first run, and **1** after the ref fix; the button showed "Signing in…" and was disabled
  - signed in, back on `/account` with the name in the header
  - a real reload kept the session
  - `expireSessions()` plus a reload led to the login page with "Your session expired", and the stored session was gone
  - `returnTo=/.//evil.test` stayed on the same origin
  - logout went home, showed "Sign in", and the storage was cleared
  - no console errors

---

## D3-4: Backend errors

### One way: classify, then switch on the kind

- **Used:** `classifyError(error)` in `src/errors/appError.ts` turns **anything thrown** into one `AppError` kind. It's the only place that looks at HTTP statuses, `ApiRequestError.kind` or "is this even an API error". Every consumer switches on the kind:
  - `LoadGate` → `ErrorState`, for every page that loads data
  - the login form
  - `placeOrder` (checkout)
  - the 404 handling on product and order pages
- **Before:** four places did this differently. `describeLoadError` branched on status, the login page had its own status checks, `placeOrder` had its own switch, and two pages checked `error.status === 404` inline.
- **Considered:**
  - A global toast or interceptor that reacts to every error. One place, but it can't know the context: a 404 on a product is a page, while a 409 at checkout needs the cart's item names. So the classifier is central, and the _response_ stays where the context is.
  - Mapping server `code` strings (`OUT_OF_STOCK`, …). The status is enough for every decision this app makes. Codes would tie the UI to message-like strings.

### The policy

| Server says            | Kind                               | What the user gets                                                                                                                                                                               | Where                          |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 400                    | `invalid-input` (field names only) | **Form field errors**: each named field marked `aria-invalid`, our own wording, focus on the first. Checkout: "review your cart".                                                                | Login, checkout                |
| 401                    | `unauthenticated`                  | **Signed out** (the client hook, D3-3) and sent to sign in with a return path. The cart is kept. On _login_, a 401 means wrong credentials instead.                                              | Every authenticated call       |
| 404                    | `not-found`                        | **A Not Found page**: one `NotFoundState` card with a heading and a way out, the same for the catch-all route, a missing product and a missing order. **No Try again**: the thing doesn't exist. | `LoadGate notFound`, `*` route |
| 409                    | `out-of-stock` (product ids only)  | **An out-of-stock message** naming each item (from our cart), with the cart corrected (D3-2).                                                                                                    | Checkout                       |
| 5xx, bad response      | `server`                           | **A retry option**: "Our server hit a problem. It's not you." plus Try again.                                                                                                                    | Everywhere                     |
| no response            | `offline` / `timeout`              | "You seem to be offline" / "This is taking too long", plus Try again.                                                                                                                            | Everywhere                     |
| other 4xx, our own bug | `unexpected`                       | "Something went wrong", plus Try again.                                                                                                                                                          | Everywhere                     |
| we aborted it          | `cancelled`                        | Nothing (stale requests are ignored, D2-6).                                                                                                                                                      | —                              |

- **Try again only when repeating can help** (`isRetryable`): offline, timeout, server and unexpected. A retry button on a 404, a 400 or a 401 would just fail again.
- **Order confirmation is now protected** (`RequireAuth`). Before, a signed-out visitor got a 401 that was ignored (no session to end) and saw a generic error. Now they sign in and come back.

### Raw messages never reach the screen: by construction, by lint, by test

1. **By construction:** `AppError` carries no server text. From `details` it keeps only the **keys** (field names, product ids), used as lookups. The wording comes from our tables. A server message has no path to the UI through the classifier.
2. **By lint:** an ESLint rule in UI folders (`app`, `components`, `features`, `hooks`, `dev`) rejects any `.message` property access. Checked with a probe file. The login page's own field was renamed `formError` to keep the rule simple.
3. **By test:** `errorMatrix.test.tsx` runs the real app for **every route × every status the contract documents, plus a dropped connection** (23 cases, derived from `ROUTE_ERRORS`). A guard test fails if a new route or status is added without an expectation. The server body puts a sentinel string in `code`, `message` **and** every `details` value. Each case asserts the expected response (field errors, sign-in, Not Found, item named, Try again) **and** that the sentinel appears nowhere on the page.

### Proving it

- **Unit tests** for the classifier (every status and kind, details keep keys only, non-API errors), `isRetryable`, and the load copy, including "never contains the raw message".
- **Mutation checks**, each caught:

  | Mutation                             | Failing tests                                                           |
  | ------------------------------------ | ----------------------------------------------------------------------- |
  | `ErrorState` appends the raw message | 4 (the 500 cases with a body; a dropped connection has no body to leak) |
  | checkout prints the raw message      | 9                                                                       |
  | `LoadGate` ignores `notFound`        | 2                                                                       |
  | 409 treated as a server error        | 1                                                                       |
  | 404 classification removed           | 4                                                                       |
  | 5xx classification removed           | 7                                                                       |

- **Real browser** (headless Edge, production build, mock controls):
  - a list 500 showed "Our server hit a problem" with Try again; after stopping errors, Try again recovered
  - `/products/p-9999`, `/orders/o-99999` and `/no/such/page` each showed the Not Found card, with an `<h2>` heading, the right tab title and no Try again
  - a real stock shortage at checkout named the item ("Decaf Pods #1 only has 1 left, so we lowered the quantity")
  - a 500 at checkout offered Try again, and after the errors stopped the order went through
  - an expired session on `/account` sent the user to sign in with the notice
  - no console errors
- **Probe false positive:** the browser check's text scan flagged "only has" on the 409 screen. Our copy and the mock's raw message share those words. The raw message is `"Decaf Pods #1" only has 1 left.` (quoted). The screen shows ours. The matrix test avoids this ambiguity with a sentinel string no copy could contain.

---

## D3-5: Caching

### Approach: a small query cache inside `useRequest`

- **Used:** `src/cache/queryCache.ts`, an in-memory map of `key → { data, updatedAt }` with least-recently-used eviction at 100 entries. `useRequest(key, fetcher, { staleTime })` reads and writes it:

  | Cache state for the key                      | What the user sees                                           | Request?               |
  | -------------------------------------------- | ------------------------------------------------------------ | ---------------------- |
  | Nothing cached                               | Loading skeleton, then data                                  | Yes                    |
  | Cached, **fresh** (younger than `staleTime`) | The data, at once                                            | **No**                 |
  | Cached, **stale**                            | The data, at once, replaced quietly when the refetch returns | Yes, in the background |
  | Stale, and the background refetch fails      | The cached data stays (no error replaces a working page)     | —                      |

- **Opt-in:** without `staleTime`, `useRequest` behaves exactly as before: no reads, no writes.
- **Kept from D2:** the key-change reset (now to _that key's_ cached data, never the previous key's), abort on key change and unmount, and race safety. The existing tests passed unchanged.
- **Considered:**
  - **TanStack Query:** the standard answer, with request de-duplication, garbage collection, refetch on focus and devtools. It would replace `useRequest`, `RequestState` and the abort and race tests built on Day 2, for features this app doesn't need yet.
  - **RTK Query:** already installed with Redux Toolkit, so no new dependency. But it also brings its own loading and error model, plus a migration of every page.
  - **Why the small cache:** about 70 lines that slot into the existing hook, keep every earlier guarantee, and can be explained line by line. **If the app grew** (more endpoints, mutations, refetch on focus, sharing data across many components), I'd move to RTK Query. The keys and stale times here map directly onto it.
- **One deliberate difference from those libraries:** leaving a page **aborts** its in-flight request (D2-4), so a response that was cancelled never fills the cache. TanStack and RTK Query let it finish and cache it. Ours is simpler and never does work for a page nobody is looking at. The cost: a quick bounce away and back can fetch twice.
- **Memory only.** A reload starts empty. The catalog is public and cheap to fetch, and persisting it would mean persisting stale stock across sessions.

### When stale data is acceptable

The rule: **stale data is fine where being wrong is cheap and something downstream corrects it. It's never fine where the user acts on it with money or identity.**

| Data                                         | Cached? | Fresh for                         | Why that's acceptable (or not)                                                                                                                                                                                         |
| -------------------------------------------- | ------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product lists (`products:<query>`)           | ✅      | 30 s, then stale-while-revalidate | Names, prices and images rarely change. Stock may be a few units off, but the cart caps quantities at known stock, and **the server has the final word at checkout** (409 names the item and corrects the cart, D3-2). |
| Product details (`product:<id>`)             | ✅      | 30 s, then stale-while-revalidate | Same as lists. Also **seeded from the list** (the list already has every field), so list → details is instant.                                                                                                         |
| Related products (`related:<category>:<id>`) | ✅      | 5 min                             | Suggestions only. Nobody buys from this section without opening the product page.                                                                                                                                      |
| Signed-in user (`GET /api/me`)               | ❌      | —                                 | It doubles as the "is my token still valid?" check (D3-3). A cached answer would hide an expired session.                                                                                                              |
| Order status (`GET /api/orders/:id`)         | ❌      | —                                 | It changes on its own (queued → processing → completed). The page polls it.                                                                                                                                            |
| Placing an order (`POST /api/orders`)        | ❌      | —                                 | Writes always go to the server, made safe to retry with idempotency keys (D3-2).                                                                                                                                       |

**Why 30 seconds:** long enough that back-and-forth browsing (list → product → back → next product) costs no requests, and short enough that a page left open soon refreshes itself. Stale data is shown _while_ refreshing, so even an expired entry costs no loading skeleton. **D4-4** (live stock over WebSockets) will narrow the window further by updating cached stock as it changes.

### Refresh stock after an order is placed

- **Used:** after a successful order, `forgetProducts(boughtIds)` removes every cached entry that **shows** a bought product: its details, list pages containing it, and related lists containing it. A 409 does the same for the products that ran short (their stock was lower than the cache said). The next visit fetches real numbers.
- **Precise, not a wipe:** entries that don't show a bought product are kept, because their data is as good as before. A test checks both sides: the bought product is fetched again, and another product browsed earlier is still served from the cache.
- **Considered:**
  - Clearing the whole cache: simple, but every page refetches after any purchase.
  - Marking entries stale and keeping them on screen: the user would briefly see the **pre-purchase** stock of what they just bought, then watch it change. Removing those entries means a short loading state instead of a wrong number.
  - Lowering cached stock locally by the quantities bought: exact for our purchase, but wrong if others bought too. Fetching gets the truth.

### Proving it

- **Unit tests:**
  - the cache: timestamps, freshness boundary, eviction order including reads, `removeWhere`
  - catalog helpers: seeding; forgetting across details, related and list shapes, keeping unrelated entries
  - `useRequest` with a cache:
    - fresh data means no request and no loading frame
    - stale data is shown then replaced
    - a failed background refresh keeps the data
    - the result is stored
    - switching to a cached key shows that key's data
    - no `staleTime` means no cache
- **App tests** (`caching.test.tsx`):
  - back to the list: no loading state and no new list request
  - list → details: no details request
  - a product revisit is reused within 30 s; after 30 s (a faked clock) the old stock shows at once, then the new stock arrives
  - after an order, the bought product shows the real stock (5 → 3 left) with a new request, while another product is still cached
- **Mutation checks**, each caught:

  | Mutation                                   | Failing tests |
  | ------------------------------------------ | ------------- |
  | Always refetch                             | 4             |
  | Cached data not shown on mount             | 8             |
  | No refresh after an order                  | 1             |
  | An order wipes the whole cache             | 2             |
  | The list doesn't seed details              | 1             |
  | A failed background refresh shows an error | 1             |
  | Reads don't count for eviction             | 1             |

- **Real browser** (production build, 600 ms latency, in-app navigation only since the cache is in memory):
  - signing in and coming back to the list made 0 requests, with no skeleton
  - list → details made 0 details requests
  - back, then the same product again, made 0 requests with no skeleton
  - after buying one, "Continue shopping" fetched the list again; the product then showed **51** (was 52), seeded from that fresh list without a separate details request
  - related products were kept (the related list never contains the page's own product)
  - no console errors
- **A mistake in my own check:** the first browser run reported an extra related-products request on revisit. The cause was my script, not the app. The related section's loading skeleton also has the class `product-card`, so the script's "wait until related cards appear" passed immediately. It then left the page with the request still in flight, the abort-on-leave discarded it, and the revisit had to fetch. With the script waiting for real cards, the revisit made 0 requests. Same lesson as before: check what a wait condition actually matches.

---

## D4-1: Accessibility

### How it was measured

Three layers, because each catches what the others miss:

1. **Lighthouse** (`npm run a11y`, `scripts/a11y-audit.mjs`)
   - What it checks: the spec's metric, against the production build in headless Chrome or Edge.
   - Pages: home, cart (empty, and **with items** preloaded into storage, so the real cart page is audited), and login.
   - It prints every failing audit and **exits non-zero below 90**, so CI can use it (D4-6).
2. **axe-core in tests** (`src/a11y/a11y.test.tsx`)
   - What it checks: the same rule engine Lighthouse uses, run on **every page and state**: home, details, cart (empty and full), checkout, login with and without errors, account, not found, and an error state.
   - Runs on every `npm test`, so a regression fails CI.
   - Color contrast is off here because jsdom can't compute colors. Lighthouse checks it.
3. **A keyboard and accessibility-tree audit in real Edge**
   - What it checks: actual key presses through the DevTools protocol, then:
     - where focus lands after each action
     - target sizes at phone width
     - the **accessibility tree**: the names, descriptions, invalid states and live regions that screen readers read
   - Automated rules can't see "focus fell to `<body>` after Remove". This can.

### Before → after

|                               | Before               | After   |
| ----------------------------- | -------------------- | ------- |
| Lighthouse: home              | 100                  | **100** |
| Lighthouse: cart (empty)      | 100                  | **100** |
| Lighthouse: cart (with items) | **96** (target size) | **100** |
| Lighthouse: login             | 100                  | **100** |

The scores were already above 90. **The audit found what mattered:**

| Found                                                                                    | Why it matters                                                                               | Fix                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Back to the list: **focus fell to `<body>`**. The cart link: focus stayed in the header. | A screen reader says nothing about the new page, and keyboard users start over from the top. | `useFocusOnRouteChange`: when the **path** changes, focus the new page's `<h1>`. Not on query changes, so typing in search keeps focus. Not on first load. |
| No `<h1>` on any page                                                                    | Screen-reader users jump to the h1 to find the main content.                                 | Every page heading is an `<h1>`. Card titles are `<h2>`, or `<h3>` under Related's `<h2>`. Not Found is an `<h1>`.                                         |
| "+" pressed up to the stock limit: **focus fell to `<body>`**                            | A `disabled` button can't hold focus.                                                        | `aria-disabled` (still focusable, still announced as dimmed); the click handler ignores it at the limit.                                                   |
| Remove: **focus fell to `<body>`**                                                       | The button disappears with its line.                                                         | Focus moves to the cart heading.                                                                                                                           |
| Cart: **nothing announced**                                                              | Sighted users see the number and total change. Screen-reader users heard nothing.            | A polite live region: "Decaf Pods #1: quantity 3. That's all 3 available. Cart total $…" and "… removed from your cart."                                   |
| Cart at phone width: **−/+ buttons 14 px wide, product name 0 px**                       | Lighthouse's target-size failure (WCAG 2.5.8), and the layout didn't reflow (1.4.10).        | A mobile-first grid that stacks on narrow screens, with 44 px buttons that never shrink.                                                                   |
| Cart link: name "Cart, 0 items", visible text "Cart 0"                                   | WCAG 2.5.3, Label in Name: voice-control users say what they see.                            | The name comes from the link's content: the visible parts are hidden from assistive tech, and one visually hidden span says "Cart, 3 items".               |

### Form errors are announced

Already built in D3-3, and now tested as its own "Done when":

- **Field errors:**
  - each invalid field gets `aria-invalid` and `aria-describedby` pointing to its error text
  - `flushSync` renders those before focus moves
  - focus goes to the first invalid field, so a screen reader reads "Email, invalid entry, Enter your email address."
- **Form-level errors** (wrong password, offline, …): a `role="alert"` region that already exists in the page before its text changes, which makes announcements more reliable. Focus moves to it.
- **Checkout problems** (409, 500, …): `role="alert"`.
- **Checked in the real accessibility tree:**
  - after an empty submit, the Email textbox is focused, invalid, and described by "Enter your email address."
  - after a wrong password, the alert is focused and assertive, with the message as its text

### Considered

- **Announcing route changes in a live region** ("Navigated to Cart") instead of moving focus. Focusing the `<h1>` does both jobs (the page name is read, and keyboard users start at the content) with one mechanism.
- **Keeping `disabled` and moving focus elsewhere at the limit.** It's surprising to have focus jump while pressing a button. `aria-disabled` is the established pattern for controls that should stay reachable.
- **Focus after Remove:** the next line's Remove button (good for removing many in a row) or the heading (always exists, even when the cart becomes empty). I chose the heading, plus an announcement.
- **`jest-axe` or `vitest-axe` wrappers:** a few lines around `axe-core` do the same job without another dependency.

### Not done: a real screen reader

The probe reads the **accessibility tree**, the data NVDA, Narrator and VoiceOver consume. It doesn't run a screen reader. Speech output (exact phrasing, double announcements when an alert is also focused) still needs a manual pass. That's workflow D4 case 2 and Flow E, with NVDA or Narrator, for QA.

### Proving it

- **Tests** (17 in `a11y.test.tsx`):
  - axe on 10 page states
  - focus moves to the h1 when opening a product, going back and opening the cart
  - typing in search keeps focus
  - "+" announces the quantity, limit and total, and keeps focus
  - Remove announces and focuses the heading
  - login fields are invalid, described and focused
  - the login alert is focused
  - the checkout failure is an alert

  The checkout stepper test was updated: `aria-disabled`, focus kept, and an extra click ignored.

- **Mutation checks**, each caught:
  - no route focus
  - route focus also firing on query changes (stealing focus from search)
  - stepper back to `disabled`
  - no live region
  - Remove not moving focus
  - the field error unlinked from its input
  - an image without `alt`
  - an unlabeled search box
- **Real Edge, after the fixes** (real key presses):
  - focus lands on "H1 Decaf Pods #1", then "H1 Products", then "H1 Your cart"
  - stepper buttons are 44×44 at phone width
  - focus stays on "+" at the limit
  - the live region holds the announcement
  - Remove focuses "H1 Your cart"
  - the login errors are as described above

---

## D4-2: Performance

Full measurements: [performance.md](performance.md).

### Measure first, in a real browser

- **Used:** `scripts/perf-trace.mjs` (`npm run perf`): Chrome traces of a cold first visit to the product list, with 4× CPU throttling, cache off and mock latency 0. Builds are **interleaved** (before, after, before, …) and the median of 11 is taken. `scripts/perf-profile.mjs` gives CPU profiles and interaction latency for typing, paging and sorting.
- **Why interleaved:** back-to-back batches drifted by about 100 ms between sessions on the same machine. One batch had a polluted "after" that looked twice as slow. Alternating builds spreads that drift evenly.
- **Why not just Lighthouse:** it scored 100 before and after. Its LCP is the heading (painted before any card), and its simulated throttling barely models font and paint costs. It's a reference, not the tool.
- **Considered:** the React Profiler. With 24 items per page, React work per interaction is small (no long tasks, worst interaction 48 ms at 4× CPU). The time was in the browser's layout and paint, which a trace shows and the React Profiler doesn't.

### The two slowest spots, and the fixes

1. **Fallback-font glyphs on the critical path.**
   - **Cause:** the header emoji and the rating star made the browser load fallback fonts during layout.
   - **How it was confirmed:** removing them as an experiment roughly halved the first layout.
   - **Fix:** inline SVG icons (`src/components/icons.tsx`).
   - **Result:** cards visible **720 → 593 ms**, LCP **992 → 844 ms**, layout **366 → 240 ms**.
2. **The skeleton shimmer repainted on the main thread every frame.**
   - **Cause:** it animated `background-position`.
   - **Fix:** a `transform` animation on an overlay, which the compositor runs off the main thread.
   - **Result:** with a 1 s load, paints while loading fell **587 → 35** and paint time **240 → 14 ms**, leaving the main thread free while the list loads.

- **Considered for spot 2:** a single opacity pulse on the whole grid, which would be even cheaper, but the shimmer's sense of motion is the established loading cue. Simply switching the animation off (already done for reduced motion) was not an option for everyone.

### Tried and rejected

- **Render before the mock is ready:** the shell appeared 95 ms sooner, but LCP got 68 ms worse and the cards were no sooner, because rendering competed with mock start-up. Reverted. The details and when to revisit are in performance.md.

### A mistake in my own tooling

- The trace script's "runs" argument regex lost its backslash (`/^d+$/`), so every "9 runs" request quietly ran 5. I noticed while adding interleaving and fixed it. All numbers in performance.md come from runs after the fix.

---

## D4-3: Memoization and virtualization

Full measurements: [performance.md](performance.md#d4-3-memoization-and-virtualization).

### A real 5,000-item list: an opt-in "All" view

- **Decided with the user:** pagination stays the default. The D2 behavior (shareable page URLs, Back/Forward, tests) is untouched. A toggle adds `?view=all`: every matching product in one scrolling list.
- **Considered:** replacing pagination with infinite scroll (loses shareable positions, changes D2); keeping pagination only (then there's no 5,000-item list to make smooth).

### Virtualization: `@tanstack/react-virtual`, by rows, window scroller

- **Used:**
  - **Rendering:** only the rows near the viewport (overscan 2), with padding standing in for the rest, inside a real `<ul>` CSS grid.
  - **Layout:** columns follow the width, and the first card of each row is measured, so heights come from real layout.
  - **Data:** pages of 100 load as rows come into view (cached, aborted on leave).
  - **Back:** scroll position is restored through `initialOffset`.
- **Considered:**
  - Hand-rolling it: window-scroll virtualization with measured, wrapping rows is subtle; the library is headless and small, and it's in a lazy chunk.
  - `react-window`: fixed-size rows only in its simple API, and a grid component that needs absolute-positioned cells, which breaks the `<ul>`/`<li>` semantics.
  - CSS `content-visibility: auto`: no JavaScript, but all 5,000 cards would still be in the DOM and React would still render them all (the 3.8 s freeze is React and DOM creation, not painting).
- **Measured:** first card 5,060 → 657 ms, longest task 3,767 → 97 ms, DOM elements 30,682 → 498, scroll blocking time 17 s → 0.

### Memoization: one kept, one removed, one skipped

- **Kept: `React.memo(ProductCard)`.** The first measurement showed it doing nothing, because an object prop was created per render. With primitive props, card renders during a 7 s scroll fell 11,830 → 590, and the median frame went 33 → 17 ms.
- **Removed: `useCallback` on `useRequest`'s `retry`.** Every caller hands it to the unmemoized `LoadGate`, which wraps it in a new function anyway. Nothing compared its identity.
- **Skipped: `React.memo` on the filter bar**, and **virtualizing the 24-item pages:** both measured fast already (D4-2, no long tasks), so neither would earn its complexity.

### Also

- **The All view is a lazy chunk** (11.3 KB gzipped). The main bundle grew 1.4 KB instead of 11.5 KB.
- **Route focus on Back/Forward** focuses the heading without scrolling, so a page can restore its own position. New navigations still scroll to the top.
- **One real-timer race test** (D2-6) gets an explicit 15 s timeout. It takes about 3 s alone but crossed the 5 s default once under the full parallel suite. A flaky test would block merges once CI gates on tests (D4-6).

### Mistakes caught along the way

- **Mine (AI):** the object prop that silently disabled `React.memo`. It was caught by counting renders, not by reading. Logged in ai-notes.md.
- **Mine (AI):** two scroll-restore bugs (a passive-effect save after the page swap, and the virtualizer overriding `scrollTo`). Caught by the browser check, fixed, and re-verified.
- **In my browser script:** it triggered Back twice, which first looked like "filters drop the view" and "restore fails". I checked the script before changing app code.

---

## D4-4: WebSockets (live stock)

Protocol: [api-contract.md](api-contract.md#websocket-apistock-live-stock-d4-4).

### Transport: WebSocket, compared with SSE and polling

|                           | **WebSocket** ✅                                     | Server-sent events (SSE)                                       | Polling                                   |
| ------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| Direction                 | Both ways over one connection                        | Server → client only (client changes need separate HTTP calls) | Client asks on a timer                    |
| Latency                   | Immediate                                            | Immediate                                                      | Up to the interval                        |
| Cost when nothing changes | A ping every 10 s                                    | A comment line now and then                                    | A full request every interval, per client |
| Reconnect                 | Ours to build (backoff, resubscribe)                 | Built into `EventSource` (with `Last-Event-ID`)                | Nothing to reconnect                      |
| Infrastructure            | Needs proxies and load balancers that allow upgrades | Plain HTTP, but long-lived responses                           | Plain HTTP, cacheable                     |

- **Why WebSocket here:** the client needs to tell the server **what it's looking at** (the subscription changes as you scroll or open a product). WebSocket carries that on the same connection. SSE would need a separate "set my subscription" HTTP call tied to the stream, and polling 24–40 products every few seconds per visitor is mostly wasted requests.
- **When I'd pick the others:** **SSE** for a one-way feed everyone receives the same way (for example, site-wide announcements). Automatic reconnect and `Last-Event-ID` resume come built in. **Polling** when updates are rare, a few seconds' delay is fine, or the infrastructure can't hold connections open. It's the simplest to operate and to cache.
- **Mocked with MSW 3's `ws` API:** it replaces the browser's `WebSocket` in the page, so the app opens a real `WebSocket` to `/api/stock`, and tests use the same mock server in Node.

### Recovers after a disconnect

- **Exponential backoff with jitter** (1, 2, 4 … 30 s; each delay is 50–100% of the ceiling), so a server restart isn't hit by every client at the same moment. It resets after a successful connection.
- **Resubscribe after every reconnect.** The server answers with a **snapshot**, which makes changes missed while disconnected irrelevant: the snapshot is the truth. Simpler than numbering events and replaying the gap, and correct because the client only needs current values, not history.
- **Heartbeat:** the server pings every 10 s. 25 s of silence means a dead connection (sleeping laptop, Wi-Fi drop) even if the socket never reported closing. Close it and reconnect.
- **Back online:** the browser's `online` event triggers an immediate reconnect instead of waiting out the backoff.
- **Shown to the user:** "Live stock paused, reconnecting…" in the header, only while reconnecting.

### Stops when the page closes

- **Subscriptions follow what's on screen:** a reference-counted watch registry. Cards, the details page, the cart and checkout register what they show and unregister on unmount. **Nothing watched → disconnect** (the login and account pages have no socket).
- **Tab hidden → disconnect**; visible → reconnect, and the snapshot catches up. No updates are processed for a page nobody is looking at.
- **`pagehide` → disconnect.** An open WebSocket also keeps a page out of the browser's back/forward cache.
- **`stop()`** closes for good: no socket, no timers, no listeners (tested).

### Where live stock goes

- **A `liveStock` slice** holds the feed's latest number per product. Components show `live ?? fetched`. That's correct while a product is on screen: it's subscribed, every change is pushed, and every (re)subscribe sends a snapshot.
- **Considered:** writing feed updates into the query cache (D3-5) and component state. Every cached shape (lists, details, related) would need patching, and mounted pages would need a way to hear about it. The overlay is one place and one rule.
- **Cards:** only the card whose stock changed re-renders (its own selector, plus `React.memo` from D4-3).
- **Details page:** the stock line is a polite live region (the change is announced), and Add to cart's limit uses the live number.
- **Cart:** a line whose stock drops below its quantity is lowered, or removed if sold out, using D3-2's `stockRefreshed` rule, so "quantities never exceed stock" still holds. A notice names the item ("… only has 1 left now, so we lowered the quantity in your cart"), because a silent change would look like a bug. The server still has the final word at checkout (409).

### Proving it

- **Unit tests** (`stockFeed.test.ts`, with a fake WebSocket, fake timers and fake page events):
  - backoff values
  - connect only when watching, then subscribe
  - malformed frames ignored
  - debounced resubscribe
  - reconnect after 1 s then 2 s, resubscribe, and the snapshot
  - backoff reset after success
  - heartbeat timeout
  - back online
  - nothing watched, hidden tab, pagehide
  - `stop()` leaves no timers and no listeners
- **App tests** (`liveStock.test.tsx`, real app, store and feed against the MSW stock server):
  - the details page updates live (and is announced)
  - list cards update
  - the cart line is lowered with a notice
  - the server drops, stock changes while nobody's connected, the client reconnects and shows the missed value
  - leaving product pages closes the connection with no reconnect afterwards
  - unmounting leaves no connection
- **Mutation checks**, each caught:
  - never reconnecting
  - no resubscribe on reconnect
  - no heartbeat
  - backoff not growing
  - not disconnecting when nothing is watched
  - a hidden tab keeping the socket
  - `stop()` leaving listeners
  - capturing `WebSocket` at creation (the bug below)
  - the cart ignoring live stock
- **Real browser** (headless Edge, production build):
  - 9 → "Only 4 left" live, highlighted, with `aria-live="polite"`
  - a 2.5 s outage showed the header note; a change made during the outage was caught up after reconnecting ("Only 2 left"), and the note cleared
  - random sales highlighted cards on the list
  - the cart line went 3 → 1 with the notice
  - 0 connections on the login page
  - no console errors

### Bugs caught

- **The feed captured `WebSocket` too early** (AI mistake, in ai-notes.md). It was a default parameter evaluated when the feed was created in `main.tsx`, before the mock replaced the global. The feed kept dialing the real network and never reached the mock. Unit tests with an injected fake couldn't see it; the browser check did. It's now looked up at connect time, with a regression test.
- **Two status bugs** found by the unit tests: "back online" reported `connecting` (hiding the reconnecting note mid-recovery), and `pagehide` left the status as `live`. Both fixed.

---

## D4-5: Testing

Full write-up: [testing.md](testing.md).

### Approach: audit what exists, against the requirement

- **Starting point:** 286 tests already existed, written alongside each feature. D4-5 became an **audit**: does each required area (cart logic, hooks, login, filtering, checkout with a success and a 409) have meaningful tests? Are they about behavior? Can they fail? Are they stable enough to gate merges?
- **Principles kept:**
  - the real app, store and API client, with only the network mocked (MSW, the same mock backend as the browser)
  - no `vi.mock`
  - queries by role, label and text
  - user-event for interactions
  - assertions on outcomes
- **Considered:**
  - Mocking modules (for example, the API module) in component tests: faster to write, but the test then checks the mock, not the request, status, validation and abort handling that run in production.
  - Snapshot tests: they fail on any markup change, behavioral or not, and get updated without reading.
  - React Testing Library's `container.querySelector`: it couples tests to markup. Kept only where markup _is_ the subject.

### Found and fixed

- **Two race tests had been vacuous since D4-1.** A heading recorder used `h2.page-heading`, and page headings became `<h1>`, so "the old product never appeared, not even briefly" checked nothing. Fixed (select `main h1`), with a sanity assertion that the recorder saw the current product. Mutation-verified: the old version only caught a stale product that _stays_; the new one catches the flash it claims to.
- **Implementation details replaced:**
  - The cart count is read from the link's accessible name (`src/test/queries.ts`), and the badge's test id was removed.
  - "Not an error" is asserted as no alert role instead of a CSS class.
  - "Outdated results" is asserted through `aria-busy` instead of a class.
- **Gaps:**
  - a full purchase journey test
  - pagination, including a stale page link
  - the WebSocket URL builder
  - dismissing a live-stock notice

### Coverage and stability

- **Used:** `@vitest/coverage-v8` (`npm run test:coverage`), app code only. 96.8% → **97.7%** lines, 91.4% → **91.9%** branches.
- **No coverage threshold in CI:** the vacuous race tests executed every line they "covered". Coverage finds what's untested; mutation testing shows what's _checked_. A threshold would reward executing code, not checking it. A floor may still be worth adding later as a tripwire against big untested additions.
- **Stability before D4-6:** 5 consecutive full runs green (about 10.7 s each), and 2 runs with 2 workers (about 27.5 s, like a small CI machine).

---

## D4-6: Git / CI / CD

Full write-up: [ci.md](ci.md).

### GitHub Actions, at the repository root

- **Used:** `.github/workflows/ci.yml` on pull requests (and pushes) to `develop`/`master`, with two jobs:
  - **Lint, types, tests, build:** one step per gate, the same npm scripts as local development, and the coverage report uploaded.
  - **Accessibility:** `npm run a11y`, the Lighthouse gate from D4-1.
- **Why:** the code is already on GitHub, so this needs no extra service.
- **Considered:** a single `npm run check` step (one red step that doesn't say which gate failed); a matrix of Node versions (the app targets one runtime, pinned in `.nvmrc`); running the a11y gate only on `develop` (it's cheap enough to run on every PR, and accessibility regressions are easiest to fix before merging).
- **Hardening:**
  - a read-only token
  - `npm ci` against the lockfile
  - superseded runs cancelled
  - timeouts on every job
  - workflow files kept LF by `.gitattributes`

### "A failing test blocks the merge"

- **CI alone doesn't block anything:** a red check is a signal. **Branch protection** (a ruleset on `develop` requiring both jobs, with no admin bypass) makes it a gate. That setting lives in the repository, not the code, so `ci.md` gives the exact steps.
- **Proof:** the branch `ci-demo/failing-test` adds one deliberately wrong expectation. Its PR into `develop` must show the _Tests_ step red and the merge button disabled. It's closed, not merged, afterwards.
- **Couldn't be automated from here:** no GitHub CLI or API token on this machine, so the repository owner sets the ruleset and opens the demo PR.

### Deploy (bonus): `develop` → GitHub Pages

- **Used:** `deploy.yml` on pushes to `develop` (this repository's main line: the default branch and the merge target). It runs `npm run check`, builds for `/react-practice/`, copies `404.html` for deep links, and publishes with `actions/deploy-pages`.
- **Why Pages:** a static site needs nothing else. The app has no backend, and the mock API runs in the browser.
- **Considered:** Netlify or Vercel (SPA rewrites built in, but another account and service to grant access to).
- **To make that work, the app can now live in a subfolder:**
  - Vite's `base` comes from `VITE_BASE_PATH`
  - the router's `basename` follows `BASE_URL`
  - the mock's image URLs follow it
  - the Service Worker already did

  All of these are `/` locally, so development is unchanged.

- **Verified locally:** a clean worktree passed every CI step. The `/react-practice/` build worked in a real browser: images, routes, deep-link reload, mock API, live stock.

### Environment lessons

- **Stale preview servers:** a preview server left over from an earlier run held the port, so a check silently ran against the wrong build ("Page not found", a Service Worker at the root). Fixed by stopping leftovers and using a fresh port. Browser checks should use unique ports, and confirm the served build before trusting results.
- **Git Bash path rewriting:** it turned `/react-practice/` into a Windows path. Locally that needs `MSYS_NO_PATHCONV=1`; CI on Linux is unaffected (noted in ci.md).

---

## D4-7: Monitoring

Full write-up: [monitoring.md](monitoring.md).

### Error boundaries at two levels

- **Used:** one boundary around the page (inside `<main>`, so the header, account and cart links keep working), and a last-resort one around the whole app in `main.tsx`.
  - The page boundary resets when the path changes, so navigating away from a broken page shows the new page. It also resets on **Try again**.
  - The app-level one renders above the store and router, so its fallback uses neither. A reload is the way out.
- **Why:** a crash in one product card shouldn't take the cart link with it, and nothing should ever end in a blank page.
- **Considered:**
  - **The `react-error-boundary` library:** it does the same in about 60 lines of ours. Not worth a dependency.
  - **One boundary per route:** finer-grained, but every route renders inside the same `<main>`, so one boundary there covers them all with the same result.
  - **Boundaries per widget,** e.g. per product card: worth it only once a widget is known to be fragile. A broken card usually means the whole list's data is broken.
- **Fallback copy:** our own words and a reference id, never the error's message (the D3-4 rule). Focus moves to the fallback's heading, because the element that had focus is gone.

### A monitor with a swappable transport

- **Used:** `createMonitor({ transport })`. A report holds source, name, message, stacks, the page path, time and build mode. It's kept in a 50-entry buffer (`bazaarMonitoring.reports()`) and sent to the console.
- **Why not a real service yet:** the app has no backend, and a demo shouldn't ship users' errors to a third party. Swapping the transport is the only change needed.
- **Privacy:** the path only, without the query string, and no token, email or cart.
- **Robustness:** the same error object is reported once, and a transport that throws is ignored.

### Global handlers for what boundaries can't catch

- **Used:** window `error` and `unhandledrejection` listeners, installed first thing in `main.tsx`. These errors don't break rendering, so they're logged without changing the screen.
- **Considered:** showing the fallback for them too. Rejected: the page is still fine, and replacing it would turn a harmless failure into a visible one.
- **React 18 development duplicates:** one crash logged three times in development. React sends caught errors to `window.onerror` once per render attempt, each attempt with a new error object. The window handler now waits one task and drops errors the boundary just reported (same name and message, within one second). Production React doesn't do this. Both builds were checked in a browser.

### QA triggers

- **Used:** three QA panel buttons, plus `bazaarMonitoring.crashPage()`:
  - **Crash this page:** a component inside the page boundary throws while the crash test is armed. It stays armed until the boundary resets, because React re-renders once after an error and disarming earlier would let that retry succeed.
  - **Throw in a click handler.**
  - **Unhandled promise rejection.**
- **Exposure:** the crash trigger only exists while the mock API is on. The read-only `reports()` is always available.

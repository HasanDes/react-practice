# The Bug Bazaar 🦆⌨️☕

A small React + TypeScript (strict) store that sells developer gear: rubber ducks, mechanical keyboards, coffee and stickers. It evolves the Week 1 **Bug Bounty Board** into a full browse → cart → checkout experience over one week, against a mocked shared API.

- **Spec:** [docs/product-spec-doc.md](docs/product-spec-doc.md)
- **Dev → QA workflow:** [docs/workflow.md](docs/workflow.md)
- **Decisions log:** [docs/decisions.md](docs/decisions.md) (updated every task)

> **Current status: Day 2 complete (D2-1 to D2-6).** Product grid and details page, URL-based filters, consistent UI states, effects that clean up, typed custom hooks, and **race-safe search**: typing fast never shows results for an old query, even with deliberately out-of-order responses. Day 3 (cart, auth, Redux Toolkit) comes next.

---

## Quick start (≈ 3 minutes)

**Prerequisites:** [Node.js](https://nodejs.org/) **22.12 or newer** (26 LTS recommended, pinned in `.nvmrc`) and the npm that ships with it. Git.

```bash
git clone https://github.com/HasanDes/react-practice.git
cd react-practice
git checkout bug-bazar
cd bug-bazaar

node -v              # must print v22.12 or newer (see Troubleshooting if not)
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). No `.env` file and no backend are needed: the app starts its own mock API (see [Mock API](#mock-api)).

### Using a Node version manager

The project pins Node 26 in `.nvmrc`.

| Tool                                                      | Command                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| nvm (macOS/Linux), fnm                                    | `nvm use` / `fnm use` (reads `.nvmrc`)                     |
| [nvm-windows](https://github.com/coreybutler/nvm-windows) | `nvm install 26` then `nvm use 26` (doesn't read `.nvmrc`) |

### Troubleshooting

| Symptom                                                                                       | Cause / fix                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `SyntaxError: Unexpected reserved word` or `Unexpected token '.'` from `vite.js` on dev/build | Node is too old (e.g. v12). Switch to Node 22.12+ as above, then rerun.                                                                         |
| `npm warn install-scripts … esbuild` during install                                           | Harmless notice from npm 11. esbuild uses its prebuilt platform package. No action needed.                                                      |
| `Vitest failed to find the runner`                                                            | Run tests with `npm test`, not `npx vitest`. The npm script fixes a lowercase Windows drive letter (`d:` vs `D:`) that otherwise breaks Vitest. |
| App shows stale mock behavior after changes                                                   | DevTools → Application → Service Workers → _Unregister_, then reload. Or run `bazaarMock.reset()` in the console.                               |
| Port 5173 already in use                                                                      | Vite automatically picks the next free port. Use the URL it prints.                                                                             |

## Scripts

| Script                 | What it does                                                            | Status |
| ---------------------- | ----------------------------------------------------------------------- | ------ |
| `npm run dev`          | Start the Vite dev server with hot reload                               | ✅     |
| `npm run build`        | Type-check, then production build into `dist/`                          | ✅     |
| `npm run preview`      | Serve the production build locally                                      | ✅     |
| `npm run lint`         | ESLint: correctness, React Hooks rules, accessibility (jsx-a11y)        | ✅     |
| `npm run lint:fix`     | ESLint with auto-fix                                                    | ✅     |
| `npm run format`       | Prettier: rewrite all files to the house style                          | ✅     |
| `npm run format:check` | Prettier: fail if anything is unformatted (for CI)                      | ✅     |
| `npm run test`         | Run all tests once (Vitest + Testing Library): contract, data layer, UI | ✅     |
| `npm run test:watch`   | Vitest in watch mode                                                    | ✅     |
| `npm run check`        | lint + format:check + typecheck + test + build: run before every push   | ✅     |
| `npm run typecheck`    | `tsc -b`: strict type check of app, tests and config (no output files)  | ✅     |

## Environment variables

**None are required today.** The app runs with built-in defaults. To override, copy the template:

```bash
cp .env.example .env.local   # .env.local is git-ignored
```

| Variable               | Default  | Purpose                                                                   | Used from |
| ---------------------- | -------- | ------------------------------------------------------------------------- | --------- |
| `VITE_API_BASE_URL`    | `/api`   | Base URL the data layer calls (mock or real backend)                      | ✅ D1-4   |
| `VITE_USE_MOCK_API`    | `true`   | Serve the API from the in-browser mock. Set `false` to use a real backend | ✅ D1-2   |
| `VITE_MOCK_LATENCY_MS` | `300`    | Base mock latency, plus up to the same again as random jitter             | ✅ D1-2   |
| `VITE_STOCK_FEED_URL`  | _(mock)_ | Live stock feed endpoint                                                  | D4-4      |

> Only `VITE_`-prefixed variables reach the browser bundle, so never put secrets in them. Restart `npm run dev` after editing env files.

## Code style and editor setup

- **Prettier** owns formatting (`.prettierrc.json`: 100 columns, double quotes, trailing commas, LF).
- **TypeScript** in strict mode (`tsconfig.app.json`, `tsconfig.node.json`). `npm run typecheck` must pass.
- **ESLint** owns correctness (`eslint.config.js`), including type-aware `typescript-eslint` rules that ban `any` (explicit or leaked from `JSON.parse` and similar) and `@ts-ignore`. Formatting rules are disabled via `eslint-config-prettier`, so the two tools never conflict.
- **EditorConfig** (`.editorconfig`) and **`.gitattributes`** keep indentation and LF line endings the same on every OS.
- Recommended VS Code extensions: _ESLint_ (`dbaeumer.vscode-eslint`), _Prettier_ (`esbenp.prettier-vscode`), _EditorConfig_ (`EditorConfig.EditorConfig`). Turn on "Format on Save".

## Folder structure

Organized **by feature**. Code that belongs to one feature lives together, and only truly shared pieces sit at the top level.

```
bug-bazaar/
├── docs/                         # All written tasks (spec, workflow, decisions, …)
├── src/
│   ├── api/                      # Data layer: the ONLY code that touches the network
│   │   ├── index.ts              # Public entry point (UI imports from here only)
│   │   ├── client.ts             # request(): base URL, JSON, auth, timeout, errors, validation
│   │   ├── schemas.ts            # Zod schemas validating every response
│   │   ├── errors.ts             # ApiRequestError (kind: http/network/timeout/aborted/...)
│   │   ├── products.ts, auth.ts, orders.ts  # Typed endpoint functions
│   │   └── client.test.ts        # Data-layer tests
│   ├── app/                      # App shell: routes, layout, app-wide pages
│   │   ├── App.tsx
│   │   └── NotFoundPage.tsx
│   ├── components/               # Shared, feature-agnostic UI
│   │   ├── BackToTop.tsx         # Appears after scrolling; listener cleaned up on unmount
│   │   ├── LoadGate.tsx          # RequestState → loading / error / empty / success
│   │   └── states.tsx            # LoadingState (skeletons), EmptyState, ErrorState
│   ├── dev/QaPanel.tsx           # QA panel: trigger any UI state (mock only, lazy chunk)
│   ├── features/                 # One folder per feature: its pages + components
│   │   └── products/
│   │       ├── components/       # Presentational: ProductFilters, ProductGrid, ProductCard, StockStatus, Pagination
│   │       ├── pages/            # Containers: ProductsPage (/), ProductDetailPage (/products/:id, + related)
│   │       ├── filters.ts        # URL ⇄ filters (parse/serialize, the source of truth)
│   │       ├── navigation.ts     # "Back to products" returns to the filtered list
│   │       └── *.test.ts(x)      # Unit + integration tests (keyboard, prices, URL/history)
│   ├── mocks/                    # Mock backend (MSW). See docs/api-contract.md
│   │   ├── data/seed.ts          # Deterministic 5,000-product generator
│   │   ├── contract.ts           # Contract constants + allowed errors per route
│   │   ├── queryProducts.ts      # Search / filter / sort / paginate
│   │   ├── db.ts                 # Mock state (stock, sessions, orders), persisted
│   │   ├── controls.ts           # Latency + forced-error switches
│   │   ├── handlers.ts           # The HTTP endpoints
│   │   ├── handlers.test.ts      # Contract tests
│   │   └── browser.ts            # Starts the Service Worker, exposes bazaarMock
│   ├── styles/
│   │   └── global.css
│   ├── test/setup.ts             # Test setup (DOM matchers, cleanup)
│   ├── utils/
│   │   ├── describeError.ts      # Error kind → friendly copy (never raw messages)
│   │   ├── formatPrice.ts        # Cents → "$19.99" (the only place)
│   │   └── toError.ts
│   ├── vite-env.d.ts             # Typed import.meta.env
│   ├── types/
│   │   ├── api.ts                # Shared contract types (single source of truth)
│   │   └── request.ts            # RequestState discriminated union
│   ├── hooks/
│   │   ├── useDebouncedCallback.ts # Debounce with cancel/flush, cleans up on unmount
│   │   ├── useDocumentTitle.ts     # Per-page tab title, restored on cleanup
│   │   ├── useRequest.ts           # Keyed fetch: abort on key change/unmount, retry, RequestState
│   │   ├── useScrolledPast.ts      # Passive, rAF-throttled scroll listener
│   │   └── hooks.test.tsx          # renderHook tests for every hook
│   ├── main.tsx                  # Entry point: providers + router
├── public/
│   ├── images/products/          # Category images used by product imageUrl
│   └── mockServiceWorker.js      # Generated by MSW. Don't edit
├── scripts/vitest.mjs            # Test launcher (Windows drive-letter fix)
├── .editorconfig  .gitattributes  .nvmrc
├── .env.example                  # Env template (copy to .env.local)
├── .prettierrc.json  .prettierignore
├── eslint.config.js
├── tsconfig.json                 # References app + node configs
├── tsconfig.app.json  tsconfig.node.json
├── index.html
├── package.json
└── vite.config.ts
```

Folders added by later tasks _(planned)_:

| Folder                                | Purpose                                           | Task |
| ------------------------------------- | ------------------------------------------------- | ---- |
| `src/store/`                          | Redux Toolkit: cart and session slices, selectors | D3-1 |
| `src/features/cart`, `auth`, `orders` | Store features                                    | D3   |

**Rules of thumb**

1. A file used by one feature lives in that feature's folder (e.g. `StockStatus` in `features/products/`). Move it to `components/` only when a second feature needs it.
2. Components never talk to the network. They call functions from `src/api/index.ts`. ESLint fails on `fetch`, `XMLHttpRequest`, `WebSocket`, `axios` or mock imports anywhere else.
3. File names: `PascalCase.tsx` for components, `camelCase.ts` for everything else. Import with the extension (`./App.tsx`).
4. Shareable view state (filters, sort, page) lives in the URL, not in React state.
5. Money is integer cents everywhere. Only `formatPrice()` turns it into text.
6. Data from outside the app (JSON, URL params, storage, form values) is `unknown` until a type guard narrows it. No `as` casts on untrusted data.

## API contract

The app builds against the shared contract in the spec. Prices are integers in **cents**.

| Method | Endpoint                                      | Success                        | Errors        |
| ------ | --------------------------------------------- | ------------------------------ | ------------- |
| GET    | `/api/products?search=&category=&sort=&page=` | `200 { items, total }`         | 500           |
| GET    | `/api/products/:id`                           | `200 Product`                  | 404           |
| POST   | `/api/login`                                  | `200 { token, user }`          | 400, 401      |
| GET    | `/api/me`                                     | `200 user`                     | 401           |
| POST   | `/api/orders`                                 | `201 { id, status: "queued" }` | 400, 401, 409 |
| GET    | `/api/orders/:id`                             | `200 { id, status }`           | 401, 404      |

Full details (params, error codes, `ApiError` bodies, contract extensions) are in **[docs/api-contract.md](docs/api-contract.md)**.

## Mock API

There's no real backend. [MSW](https://mswjs.io/) intercepts `fetch` calls in the browser and answers according to the contract, so the Network tab shows real requests and status codes.

- **Demo login:** `dev@bugbazaar.test` / `rubberduck`
- **Data:** 5,000 deterministic products (`p-0001` … `p-5000`). Stock changes, sessions and orders persist across reloads.
- **QA panel:** a "QA: trigger states" button in the bottom-right corner puts the current page into loading, server error, offline, empty or not-found, then recovers. It's the quickest way to demo D2-3.
- **Or trigger any state** from the browser console:

```js
bazaarMock.help(); // routes, statuses, commands
bazaarMock.fail("products:list", 500); // force an error (persists until cleared)
bazaarMock.fail("products:get", "network"); // simulate a dropped connection (offline)
bazaarMock.fail("orders:create", 409, { once: true }); // fail only the next request
bazaarMock.clear(); // stop forcing errors
bazaarMock.latency(2000); // slow + out-of-order responses
bazaarMock.race(400); // older searches answer slower (D2-6); race(0) = off
bazaarMock.setStock("p-0001", 0); // sold out
bazaarMock.reset(); // wipe orders, sessions, stock changes
```

## Week plan and progress

| Day | Theme      | Tasks                                                                                                                                 | Pts | Status |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| 0   | Rename     | Rename to The Bug Bazaar, keep history                                                                                                | —   | ✅     |
| 1   | Foundation | D1-1 Setup ✅ · D1-2 API contract + mock ✅ · D1-3 TypeScript ✅ · D1-4 Data layer ✅                                                 | 15  | ✅     |
| 2   | Browse     | D2-1 Product list ✅ · D2-2 Filters ✅ · D2-3 UI states ✅ · D2-4 Effects cleanup ✅ · D2-5 Custom hooks ✅ · D2-6 Race conditions ✅ | 21  | ✅     |
| 3   | Buy        | D3-1 Redux Toolkit · D3-2 Cart · D3-3 Auth · D3-4 Backend errors · D3-5 Caching                                                       | 21  | ⬜     |
| 4   | Harden     | D4-1 A11y · D4-2 Performance · D4-3 Memo/virtualization · D4-4 Live stock · D4-5 Testing · D4-6 CI · D4-7 Monitoring                  | 22  | ⬜     |
| 5   | Explain    | D5-1…D5-9 Architecture, patterns, orders, glossary, reviews, AI notes, reflection, submission                                         | 21  | ⬜     |

Days 1 to 3 produce the working store and come first if time runs short.

## Contributing

Follow [docs/workflow.md](docs/workflow.md). In short:

1. One task at a time. Copy its **Done when** criteria into your checklist.
2. Commit messages start with the task ID, for example `D3-2: add cart page`. At least one commit per task.
3. Before pushing, run lint, typecheck, tests and build locally.
4. Record the approach in `docs/decisions.md` (used / considered / why).
5. Log notable AI help in `docs/ai-notes.md`.
6. Push by end of day. One PR into `develop` at the end of the week.

## Docs index

| Doc                                                  | Purpose                                            |
| ---------------------------------------------------- | -------------------------------------------------- |
| [docs/product-spec-doc.md](docs/product-spec-doc.md) | Full project spec                                  |
| [docs/workflow.md](docs/workflow.md)                 | Development → QA process                           |
| [docs/decisions.md](docs/decisions.md)               | Tool and approach choices per task                 |
| [docs/api-contract.md](docs/api-contract.md)         | API contract and mock error triggers (D1-2)        |
| `docs/auth.md`                                       | Token storage and trade-offs (D3-3)                |
| `docs/performance.md`                                | Before/after measurements (D4-2, D4-3)             |
| `docs/monitoring.md`                                 | Error logging and what to track (D4-7)             |
| `docs/ARCHITECTURE.md`                               | Structure, data flow, state, patterns (D5-1, D5-2) |
| `docs/orders.md`                                     | Queue-based order flow design (D5-3)               |
| `docs/glossary.md`                                   | Architecture vocabulary (D5-4)                     |
| [docs/ai-notes.md](docs/ai-notes.md)                 | AI usage log (D5-7)                                |
| `docs/reflection.md`                                 | Self-assessment (D5-8)                             |

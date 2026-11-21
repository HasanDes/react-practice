# The Bug Bazaar 🦆⌨️☕

A small React + TypeScript store that sells developer gear: rubber ducks, mechanical keyboards, coffee and stickers. It evolves the Week 1 **Bug Bounty Board** into a full browse → cart → checkout experience over one week, against a mocked shared API.

- **Spec:** [docs/product-spec-doc.md](docs/product-spec-doc.md)
- **Dev → QA workflow:** [docs/workflow.md](docs/workflow.md)
- **Decisions log:** `docs/decisions.md` (created in D1-1, then updated every task)

> **Current status: pre-Day 1.** The app has been renamed from *Bug Bounty Board* to *The Bug Bazaar*, and the folder moved from `bug-bounty-starter/` to `bug-bazaar/` with Week 1 git history kept. The code is still the Week 1 JavaScript board. The TypeScript migration, mock store API and tooling arrive in Day 1. Sections marked *(planned)* will be filled in as their tasks land.

---

## Quick start

**Prerequisites:** Node.js 18+ (LTS 20 recommended) and npm 9+.

```bash
git clone https://github.com/HasanDes/react-practice.git
cd react-practice
git checkout bug-bazar
cd bug-bazaar
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Scripts

| Script                 | What it does                               | Status        |
| ---------------------- | ------------------------------------------ | ------------- |
| `npm run dev`          | Start the Vite dev server with HMR         | ✅ available   |
| `npm run build`        | Production build into `dist/`              | ✅ available   |
| `npm run preview`      | Serve the production build locally         | ✅ available   |
| `npm run lint`         | ESLint across `src/`                       | *(planned, D1-1)* |
| `npm run format`       | Prettier write                             | *(planned, D1-1)* |
| `npm run format:check` | Prettier check (used by CI)                | *(planned, D1-1)* |
| `npm run typecheck`    | `tsc --noEmit` in strict mode              | *(planned, D1-3)* |
| `npm run test`         | Unit and component tests                   | *(planned, D4-5)* |

## Environment variables

None are required yet. Planned variables (copy `.env.example` → `.env.local` once it exists):

| Variable              | Default | Purpose |
| --------------------- | ------- | ------- |
| `VITE_API_BASE_URL`   | `/api`  | Base URL for the data layer (mock or real backend) |
| `VITE_USE_MOCK_API`   | `true`  | Run against the in-browser mock API (D1-2) |
| `VITE_MOCK_LATENCY_MS`| `300`   | Base artificial latency for the mock, used to demo loading states and race conditions |
| `VITE_STOCK_FEED_URL` | *(mock)* | Live stock feed endpoint (D4-4) |

> Only `VITE_`-prefixed variables reach the browser. Never put secrets in them.

## Folder structure

Current (Week 1 code):

```
bug-bazaar/
├── docs/
│   ├── product-spec-doc.md   # The Bug Bazaar spec (source of truth)
│   └── workflow.md           # Dev → QA process for every task
├── src/
│   ├── components/           # BugCard, BugForm, BugList, LoadGate
│   ├── pages/                # BoardPage, BugDetailPage, NotFoundPage
│   ├── App.jsx
│   ├── main.jsx
│   ├── mockApi.js            # Week 1 mock (to be replaced in D1-2)
│   └── styles.css
├── index.html
├── package.json
└── vite.config.js
```

Target layout *(planned, finalized in D1-1 and documented in `docs/ARCHITECTURE.md`)*:

```
src/
├── api/          # Single data layer: client, endpoints, error normalization (D1-4)
├── mocks/        # Mock API, 5,000-product seed, error triggers (D1-2)
├── types/        # Shared contract types: Product, ApiError, RequestState (D1-3)
├── store/        # Redux Toolkit: cart + session slices, selectors (D3-1)
├── hooks/        # Reusable typed hooks: useDebounce, useLocalStorage, … (D2-5)
├── features/     # products/, cart/, auth/, orders/ — pages + feature components
├── components/   # Shared presentational UI: StateView, Price, ErrorBoundary
└── utils/        # formatPrice (cents → display), query-param helpers
```

## API contract

The app builds against the shared contract in the spec. Prices are integers in **cents**.

| Method | Endpoint | Success | Errors |
| ------ | -------- | ------- | ------ |
| GET  | `/api/products?search=&category=&sort=&page=` | `200 { items, total }` | 500 |
| GET  | `/api/products/:id` | `200 Product` | 404 |
| POST | `/api/login` | `200 { token, user }` | 400, 401 |
| GET  | `/api/me` | `200 user` | 401 |
| POST | `/api/orders` | `201 { id, status: "queued" }` | 400, 401, 409 |
| GET  | `/api/orders/:id` | `200 { id, status }` | 401, 404 |

Full details, including how to trigger each error on purpose, will live in `docs/api-contract.md` (D1-2).

## Week plan and progress

| Day | Theme      | Tasks | Pts | Status |
| --- | ---------- | ----- | --- | ------ |
| 0   | Rename     | Rename to The Bug Bazaar, keep history | — | ✅ |
| 1   | Foundation | D1-1 Setup · D1-2 API contract + mock · D1-3 TypeScript · D1-4 Data layer | 15 | ⬜ |
| 2   | Browse     | D2-1 Product list · D2-2 Filters · D2-3 UI states · D2-4 Effects cleanup · D2-5 Custom hooks · D2-6 Race conditions | 21 | ⬜ |
| 3   | Buy        | D3-1 Redux Toolkit · D3-2 Cart · D3-3 Auth · D3-4 Backend errors · D3-5 Caching | 21 | ⬜ |
| 4   | Harden     | D4-1 A11y · D4-2 Performance · D4-3 Memo/virtualization · D4-4 Live stock · D4-5 Testing · D4-6 CI · D4-7 Monitoring | 22 | ⬜ |
| 5   | Explain    | D5-1…D5-9 Architecture, patterns, orders, glossary, reviews, AI notes, reflection, submission | 21 | ⬜ |

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

| Doc | Purpose |
| --- | ------- |
| [docs/product-spec-doc.md](docs/product-spec-doc.md) | Full project spec |
| [docs/workflow.md](docs/workflow.md) | Development → QA process |
| `docs/decisions.md` | Tool and approach choices per task |
| `docs/api-contract.md` | API contract and mock error triggers (D1-2) |
| `docs/auth.md` | Token storage and trade-offs (D3-3) |
| `docs/performance.md` | Before/after measurements (D4-2, D4-3) |
| `docs/monitoring.md` | Error logging and what to track (D4-7) |
| `docs/ARCHITECTURE.md` | Structure, data flow, state, patterns (D5-1, D5-2) |
| `docs/orders.md` | Queue-based order flow design (D5-3) |
| `docs/glossary.md` | Architecture vocabulary (D5-4) |
| `docs/ai-notes.md` | AI usage log (D5-7) |
| `docs/reflection.md` | Self-assessment (D5-8) |

# Development → QA Workflow

How every Bug Bazaar task goes from "picked up" to "verified and merged". The goal is that each task in [product-spec-doc.md](product-spec-doc.md) ends with working code, a passing check suite, a QA sign-off against its **Done when** criteria, and its own commit.

---

## 1. The lifecycle at a glance

```
 ┌────────────┐   ┌──────────┐   ┌────────────┐   ┌───────────┐   ┌──────────┐   ┌────────┐
 │ 1. Ready   │ → │ 2. Build │ → │ 3. Self-   │ → │ 4. Review │ → │ 5. QA    │ → │ 6. Done│
 │ (plan)     │   │ (code +  │   │ check      │   │ (PR /     │   │ (verify  │   │ (merge,│
 │            │   │  tests)  │   │ (local CI) │   │  diff)    │   │  "Done   │   │  push, │
 │            │   │          │   │            │   │           │   │  when")  │   │  log)  │
 └────────────┘   └──────────┘   └────────────┘   └───────────┘   └──────────┘   └────────┘
        ▲                                                │ fail          │ fail
        └────────────────────────────────────────────────┴───────────────┘
```

A task only moves right when the gate for its current stage passes. A failure at Review or QA sends it back to Build. It never gets patched in place on the main branch.

---

## 2. Branching and commits

| Item                   | Convention                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Integration branch     | `bug-bazar` (the week's work). One PR into `develop` at the end of the week (D5-9).                  |
| Task branch (optional) | `feature/D2-2-filters`. Use it for bigger tasks. Small tasks can go straight onto `bug-bazar`.       |
| Commit message         | `<TASK-ID>: <imperative summary>`, for example `D3-2: prevent duplicate orders with idempotency key` |
| Commits per task       | **At least one** (spec rule). Several are fine, and every one starts with the task ID.               |
| Push cadence           | **End of every day** at minimum, so evaluators can follow progress.                                  |
| Never commit           | `.env*` with real values, `node_modules/`, `dist/`, coverage output.                                 |

---

## 3. Stage by stage

### Stage 1: Ready (plan before coding)

A task is _Ready_ when you can answer these questions:

- [ ] Which **Done when** criteria apply? Copy them into the task branch or PR description as a checklist.
- [ ] Which **endpoints and error codes** does it touch? Check [api-contract.md](api-contract.md) once D1-2 exists.
- [ ] Which **approach** will you use, and what are the alternatives? Draft the `docs/decisions.md` entry _now_, not at the end.
- [ ] How will QA **trigger each state** (loading, empty, error, 400/401/404/409/500, slow responses)?

### Stage 2: Build

- Write the feature behind the data layer (D1-4). **Components never call `fetch` directly.**
- Keep types strict: no `any`, no `@ts-ignore` (D1-3).
- Write the tests **with** the feature, not afterwards. Test behavior (what the user sees and can do), not implementation details.
- Every new error path must reach the screen through the shared error handler (D3-4), never as a raw message.
- If AI helped noticeably, add an entry to `docs/ai-notes.md` while it's fresh (prompt, what you kept, what you changed).

### Stage 3: Self-check (run CI locally)

Run the same gates that CI runs (D4-6). All must pass before you open a PR or ask for review:

```bash
npm run lint        # ESLint, no errors
npm run format:check  # Prettier, no diffs
npm run typecheck   # tsc --noEmit (strict)
npm run test        # unit + component tests
npm run build       # production build succeeds
```

> These scripts are added in D1-1 (lint/format), D1-3 (typecheck) and D4-5 (test). Until a script exists, skip that gate and note it in the PR.

Then do a **2-minute manual smoke test** in the browser. Load the page, exercise the new feature once along the happy path, and once with an error.

### Stage 4: Review

Review your own diff (or a partner's) with this checklist. It mirrors what D5-6 scores:

| Area          | Ask                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Correctness   | Does it meet _every_ Done-when bullet? Are edge cases handled (0 stock, empty results, double-click)?                      |
| Contract      | Are request/response shapes exactly as documented? Are prices in cents and formatted only at display time?                 |
| State         | Is each piece of state in the right home (server cache, Redux, URL, local component)? Is anything duplicated or derivable? |
| Effects       | Is every effect cleaned up (abort controllers, listeners, timers, sockets)?                                                |
| Readability   | Clear names, small components, no dead code, comments explain _why_                                                        |
| Accessibility | Keyboard reachable, visible focus, labels, `aria-live` for async messages and errors                                       |
| Tests         | Do they fail if the feature breaks? Do they avoid testing internals?                                                       |
| Docs          | `decisions.md` updated? Task-specific doc written (auth.md, performance.md, and so on)?                                    |

### Stage 5: QA (verify against "Done when")

QA is done **on a fresh run of the app** (`npm run dev` after `npm install`). It follows the feature's test script in §4 and the flow scripts in §5. Every case is recorded as ✅ / ❌ in the PR description or the task checklist.

**Test types used**

| Type                    | Tool (planned)                                          | What it covers                                                                          |
| ----------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Unit                    | Vitest                                                  | Pure logic: price formatting, cart reducers and selectors, query-param parsing, hooks   |
| Component / integration | React Testing Library + mock API                        | User-visible behavior: filters update the grid, 409 shows the item name, login redirect |
| Manual exploratory      | Browser + DevTools                                      | Network throttling, offline, rapid typing, rapid product switching, keyboard-only use   |
| Accessibility           | Lighthouse + keyboard + screen reader (NVDA / Narrator) | D4-1 thresholds and announcements                                                       |
| Performance             | React Profiler + Performance panel                      | D4-2 / D4-3 before/after numbers                                                        |
| Regression              | Full CI suite on every PR                               | Nothing that passed before breaks                                                       |

**Triggering errors on purpose.** The mock API (D1-2) must expose a way to force each error, for example a query flag such as `?mockError=500`, a dev-only toggle panel, or reserved inputs such as password `wrong` → 401. QA uses those switches. Nobody waits for random failures.

### Stage 6: Done

- [ ] All Done-when bullets ✅ in QA
- [ ] Local gates green, then CI green on push
- [ ] Commit(s) prefixed with the task ID
- [ ] `docs/decisions.md` entry written (used / considered / why)
- [ ] AI notes logged if relevant
- [ ] Pushed by end of day

---

## 4. Feature QA scripts

Each script lists the minimum cases QA must run. ★ marks the case that proves a **Done when** criterion.

### D1: Foundation

| #   | Case                                                           | Expected                                                      |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| 1 ★ | Fresh clone → follow README only, then time it                 | App running in < 5 min                                        |
| 2 ★ | `GET /api/products` with each param combination                | `{ items, total }` with correct filtering, sorting and paging |
| 3 ★ | Force each listed error per endpoint (500, 404, 400, 401, 409) | Correct status plus an `ApiError` body shape                  |
| 4   | Count seeded products                                          | `total` = 5,000 with no filters                               |
| 5 ★ | `npm run typecheck`; grep for `any` and `@ts-ignore`           | Passes; zero matches                                          |
| 6 ★ | grep components for `fetch(` / `axios`                         | Zero matches. All calls go through the API layer              |

### D2: Browse

| #    | Case                                                  | Expected                                                   |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------- |
| 1 ★  | Product priced `1999`                                 | Displays `$19.99` (also check `0`, `5`, `100000`)          |
| 2 ★  | Tab through the grid, Enter on a card                 | Focus visible, details page opens                          |
| 3    | Details page                                          | Image (with alt text), name, price, stock shown            |
| 4 ★  | Set search + category + in-stock + sort → refresh     | Same view restored                                         |
| 5 ★  | Copy the URL into a new tab                           | Identical results                                          |
| 6 ★  | Change filters 3 times → Back ×3                      | Each previous view restored in order                       |
| 7    | Clear filters                                         | All products, count resets                                 |
| 8 ★  | Force loading / empty / 500 / 404 on list and details | Consistent state components; Retry recovers after 500      |
| 9 ★  | Click product A → B → C quickly with slow responses   | Only C is shown; no flash of A/B                           |
| 10 ★ | Open details, scroll, navigate away; check DevTools   | No scroll listener, timer or pending request remains       |
| 11   | Back to Top                                           | Appears after scrolling, returns to top, keyboard operable |
| 12 ★ | Mock delays out of order; type `duck` fast            | Results always match the final input                       |
| 13   | Hooks reused                                          | Each custom hook used in ≥ 2 places, with unit tests       |

### D3: Buy

| #    | Case                                                                   | Expected                                                      |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1 ★  | Add items and change quantities                                        | Header badge = sum of quantities (derived, not stored)        |
| 2 ★  | Increase quantity past stock                                           | Blocked at stock with a message                               |
| 3 ★  | Reload with items in cart                                              | Cart restored                                                 |
| 4 ★  | Checkout where one item is out of stock (409)                          | Message names that item; cart is not cleared                  |
| 5 ★  | Double-click Place Order; or fail the network after submit, then retry | Exactly **one** order created (same idempotency key)          |
| 6    | Successful checkout                                                    | Confirmation shows order ID and `queued` status; cart cleared |
| 7 ★  | Visit /account or /checkout logged out → log in                        | Redirected to login, then returned to the original page       |
| 8 ★  | Double-click Login                                                     | One request; button disabled while pending                    |
| 9 ★  | Force 401 on any authenticated call                                    | Session cleared, user sent to login                           |
| 10 ★ | 400 on login                                                           | Field-level messages next to the inputs                       |
| 11 ★ | Any forced error                                                       | Friendly copy only, never a raw `error.message` or stack      |
| 12 ★ | List → details → back to list (Network tab)                            | No refetch of already-cached data                             |
| 13 ★ | Place an order, then view that product                                 | Stock reflects the purchase                                   |

### D4: Harden

| #    | Case                                                                             | Expected                                                                                         |
| ---- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1 ★  | `npm run a11y` (Lighthouse on home, cart, login)                                 | Accessibility ≥ 90 each; the script fails below 90                                               |
| 2 ★  | Submit an invalid form with a screen reader on                                   | Errors announced                                                                                 |
| 3    | Full flow keyboard-only                                                          | Possible end to end, focus never lost                                                            |
| 4 ★  | Profile the list before and after each fix                                       | Numbers recorded in `performance.md`                                                             |
| 5 ★  | Scroll all 5,000 items with 4× CPU throttle                                      | Smooth, no long frames > 50 ms during scroll                                                     |
| 6 ★  | Stock change pushed by the mock feed (sales every 4 s, or `bazaarMock.setStock`) | UI updates without a refresh; details page announces it                                          |
| 7 ★  | QA panel: Drop live stock / Live stock outage; or go offline → restore           | Header shows "reconnecting"; reconnects with backoff and resyncs (changes made meanwhile appear) |
| 8 ★  | Leave the page                                                                   | Socket closed / polling stopped (DevTools shows nothing)                                         |
| 9 ★  | `npm run test`                                                                   | ≥ 15 meaningful tests pass, including a successful order **and** a 409                           |
| 10 ★ | Push a PR with a deliberately failing test                                       | CI red, merge blocked                                                                            |
| 11 ★ | Trigger a dev-only "throw" button                                                | Fallback screen shown, error logged, rest of app alive                                           |

### D5: Explain

| #   | Case                                           | Expected                                             |
| --- | ---------------------------------------------- | ---------------------------------------------------- |
| 1 ★ | Cross-check ARCHITECTURE.md against `src/`     | Folder tree and state locations match the code       |
| 2 ★ | All docs in the §7 checklist of the spec exist | Present and complete                                 |
| 3 ★ | `git log --oneline`                            | Every task ID appears in at least one commit message |
| 4 ★ | CI on the final PR                             | Green                                                |

---

## 5. End-to-end flow scripts (regression)

Run these **after each day's work** and before the final PR. They catch breakage between features.

**Flow A: Browse to buy (happy path)**

1. Open home → search "duck" → filter _ducks_ → in-stock only → sort by price.
2. Copy the URL, open it in a new tab, and confirm the same view.
3. Open a product → add 2 to the cart → badge shows 2.
4. Go to checkout → redirected to login → log in → returned to checkout.
5. Place the order → confirmation with an order ID → cart empty.
6. Back to the product → stock reduced by 2.

**Flow B: Out of stock (409)**

1. Add a low-stock item to the cart.
2. Force 409 (or let the live feed drop stock to 0).
3. Place the order → message names the item → cart intact → adjust → succeed.

**Flow C: Session expiry (401)**

1. Log in and add to the cart.
2. Force 401 on `/api/me` or `/api/orders`.
3. Session cleared → login page → log in → returned → cart still present.

**Flow D: Failure and recovery (500 / offline)**

1. Force 500 on the product list → error state → Retry → success.
2. Go offline in DevTools → live stock feed disconnects → go online → feed recovers.

**Flow E: Keyboard and screen reader only**

1. Complete Flow A without a mouse with NVDA/Narrator on. Every action and error is reachable and announced.

---

## 6. Definition of Done (the whole week)

- All tasks have Done-when criteria verified ✅ and at least one `Dx-y:` commit.
- CI (lint, typecheck, test, build) is green on the final PR.
- Flows A to E pass on a fresh clone.
- All required docs exist and match the code.
- You can explain every file: what it does, why it's built that way, and what breaks if it changes.

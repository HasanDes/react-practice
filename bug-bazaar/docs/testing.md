# Testing

This page covers how the Bug Bazaar is tested: what the tests check, how they're written so they test behavior rather than implementation, how we know they can fail, and what isn't covered. It also maps the D4-5 requirement onto the actual tests.

**291 tests in 28 files, all passing** at the D4-5 audit (308 in 31 files after D4-7 added the monitoring tests and D5-9 one checkout test; the figures below are from D4-5). They're stable across repeated runs (see "Stability"), and cover 97.7% of lines and 91.9% of branches in app code.

## Commands

| Command                 | What it does                                                             |
| ----------------------- | ------------------------------------------------------------------------ |
| `npm test`              | Every test once (Vitest), about 11 s locally                             |
| `npm run test:watch`    | Watch mode while developing                                              |
| `npm run test:coverage` | Tests plus a V8 coverage report (text summary, plus HTML in `coverage/`) |
| `npm run check`         | Lint, formatting, types, tests and build: what CI runs (D4-6)            |
| `npm run a11y`          | Lighthouse accessibility on home, cart and login (fails below 90)        |
| `npm run perf`          | Cold-load performance trace of the product list (`docs/performance.md`)  |

## How the tests are written

1. **Through the real app.** Integration tests render the real `App` with a real Redux store and the real API client. Only the network is replaced, by **MSW** running the same mock backend the browser uses (`src/mocks/`), so requests, status codes, JSON validation, aborts and WebSockets all go through the code that ships. There is **no `vi.mock`** in the codebase: no module is swapped for a fake.
2. **Like a user.** Elements are found by **role, label and visible text** (`getByRole("button", { name: "Place order" })`). Interactions use **user-event**, which presses keys, clicks and moves focus like a person would. There's no `fireEvent`. If a test can't find something the way a user or screen reader would, that's usually a real accessibility bug.
3. **Assertions are about outcomes:** what's on screen, what's announced, where focus is, the URL, what reached the server (orders placed, requests aborted). Internal state is read only where state _is_ the contract, such as the store's reducer tests (D3-1 "state only changes through defined updates") and session persistence.
4. **Unit tests where logic stands alone:** pure functions (filters ↔ URL, `classifyError`, `safeReturnTo`, the cache), and framework-free classes with injected time (`createDebouncer`, `createStockFeed` with a fake WebSocket, fake timers and fake page events).

## The D4-5 requirement, mapped

> Test the most important behavior: cart logic, custom hooks, login, filtering, and checkout, including both a successful order and a 409 error. **At least 15 meaningful tests.**

| Area                    | Where                                                                                                             | What's covered (examples)                                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cart logic** (≈ 30)   | `cart.test.tsx`, `store.test.ts`, `cartStorage.test.ts`, `checkout.test.tsx` (cart editing), `liveStock.test.tsx` | Quantities never exceed stock (adding, setting, typing, live stock drops); the badge is derived; sold-out can't be added; remove; total in cents; survives a reload; corrupt storage ignored                                         |
| **Custom hooks** (≈ 25) | `hooks.test.tsx`, `useRequestCache.test.tsx`, `a11y.test.tsx` (route focus)                                       | `useRequest`: stale answers ignored, aborts on key change and unmount, retry, cache fresh/stale; `useDebouncedCallback`: latest args, cancel and flush, cleanup; `useDocumentTitle`; `useScrolledPast`; `useFocusOnRouteChange`      |
| **Login** (≈ 35)        | `auth.test.tsx`, `returnTo.test.ts`                                                                               | Signs in and returns to `returnTo`; open redirects refused; wrong password; field errors; can't be double-submitted (even within one event-loop tick); a 401 ends the session; stale 401s ignored; logout; session survives a reload |
| **Filtering** (≈ 30)    | `productFilters.test.tsx`, `filters.test.ts`, `searchRace.test.tsx`, `pagination.test.tsx`, `allView.test.tsx`    | Every control writes the URL; a copied link reproduces the view; Back/Forward; refresh; clear; latest search always wins; paging including a stale page link; the "All" view                                                         |
| **Checkout** (≈ 15)     | `checkout.test.tsx`, `journeys/purchase.test.tsx`, `errorMatrix.test.tsx`                                         | **A successful order** (confirmation, cart cleared); **a 409** (each item named, cart corrected, the order succeeds afterwards); idempotent retry after a lost response; double submit; 401 keeps the cart; 400 and 500 responses    |

Beyond the list: an error matrix (every documented status × every route, with no raw server text on screen), accessibility (axe on 11 page states, focus, announcements), live stock (recovery and shutdown), caching, and the API contract itself (`handlers.test.ts`).

### The purchase journey

`src/journeys/purchase.test.tsx` walks the most important flow end to end, the way a shopper does: search → open the product → add to cart → raise the quantity in the cart → check out → asked to sign in → back at checkout with the cart intact → place the order → confirmation with an order number and an empty cart, and the stock really went down. Each step is tested in depth elsewhere; this test proves they work **together**. It uses only roles, labels and visible text. Mutation-checked: login not returning to checkout, and the cart not clearing, both fail it.

## How we know the tests can fail

A passing test only proves something if it fails when the code is wrong. Throughout the week, each key guarantee was **broken on purpose** (mutation testing), and the tests had to go red. About 60 deliberate mutations:

| Task   | Examples of mutations the tests caught                                                           |
| ------ | ------------------------------------------------------------------------------------------------ |
| D2     | Stale search results shown; effects not cleaned up                                               |
| D3-2/3 | A new idempotency key per attempt; double-submit guards removed; the open-redirect check removed |
| D3-4   | Raw messages shown; 404/409/5xx misclassified                                                    |
| D3-5   | The cache always refetching; nothing refreshed after an order                                    |
| D4-1   | Focus not moved; `disabled` instead of `aria-disabled`; an unlabeled field                       |
| D4-3   | Virtualization off; `aria-setsize` missing; pages not loading                                    |
| D4-4   | Never reconnecting; no heartbeat; `stop()` leaving listeners                                     |
| D4-5   | Race safety broken (below); the journey's sign-in and cart steps                                 |

**Mutation testing has repeatedly found tests that couldn't fail.** Each is logged in `ai-notes.md`:

- the double-submit test that passed without the guards (D3-2)
- the open-redirect tests that couldn't tell "rejected" from "cleaned up" (D3-3)
- the race tests that went blind in D4-1 (below)

## D4-5 audit findings

The audit checked each area against the requirement, then looked for tests of implementation details and tests that can't fail.

1. **Two race tests had been checking nothing since D4-1.**
   - **What they do:** "a slow response for the previous product never replaces the current one, **not even briefly**" records every page heading that ever renders.
   - **What broke:** the recorder looked for `h2.page-heading`, and D4-1 made page headings `<h1>`. It recorded nothing, so "the old product was never shown" was always true. Nothing failed when the markup changed.
   - **The fix:** select `main h1`, and assert the recorder **saw the current product**, so it can't go blind silently again.
   - **Verified:** with race safety broken on purpose, the old heading checks only caught a stale product that _stays_ on screen. A brief flash would have passed. The fixed tests fail as they should.
2. **Implementation details replaced with what users perceive:**
   - The cart count is read from the cart link's **accessible name** ("Cart, 3 items"), the same thing a screen reader announces, through `src/test/queries.ts`, instead of a `data-testid`. The test id was removed from the component.
   - "This empty state isn't an error" is asserted as _no `role="alert"`_, not as a CSS class.
   - "Results are outdated while a search is pending" is asserted through `aria-busy` (exposed to assistive technology), not the dimming class.
   - **Kept on purpose:** the test of "errors look the same on every page" compares the shared error card's classes, because visual consistency is the D2-3 requirement. Spies remain only where the behavior has no other observable effect: "the scroll listener is removed", "the pending animation frame is cancelled".
3. **Gaps found with coverage, now tested:**
   - Next and Previous paging.
   - A link to a page that no longer exists ("That page doesn't exist" → Go to page 1).
   - The WebSocket URL built from the API base (`ws`/`wss`, keeping the path).
   - Dismissing a live-stock notice.

## Coverage

`npm run test:coverage`, app code only (tests, the mock backend and dev tools excluded):

|           | Before the D4-5 audit | After     |
| --------- | --------------------- | --------- |
| Lines     | 96.8%                 | **97.7%** |
| Branches  | 91.4%                 | **91.9%** |
| Functions | 94.7%                 | **96.4%** |

Coverage shows what **no** test executes; it doesn't show that executed code is _checked_. The blind race tests above executed every line they covered. That's why mutation testing, not a coverage threshold, is the quality bar here. The remaining uncovered lines are mostly defensive branches (for example, non-`Error` values thrown, or a product that can't be fetched while handling a 409).

## Stability

The suite must be reliable before CI blocks merges on it (D4-6):

- **5 consecutive full runs:** 291/291 each time, about 10.7 s per run.
- **With 2 workers** (like a small CI machine): 291/291, twice, about 27.5 s.
- **One test needed an explicit timeout** (D4-3). The D2-6 out-of-order search test deliberately waits on real timers, and once crossed the 5 s default under the full parallel load.

## Not covered by automated tests

| What                                  | Why                                                          | Where it's checked instead                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Real layout, scrolling, painting      | jsdom has no layout engine                                   | Headless-browser checks during development (virtual list, scroll restore, focus, target sizes); `perf-trace.mjs` and `perf-scroll.mjs` |
| Speech output of a real screen reader | Can't run NVDA or VoiceOver in CI                            | The accessibility tree is checked; a manual NVDA/Narrator pass is in `workflow.md` (Flow E)                                            |
| Cross-browser behavior                | The suite runs in jsdom, and dev checks used Edge (Chromium) | A next step: Playwright tests across Chromium, Firefox and WebKit in CI                                                                |
| Visual regressions                    | No screenshot comparison                                     | Screenshots reviewed by hand during development                                                                                        |

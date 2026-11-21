# Submission (D5-9)

This page covers the pull request that submits the Bug Bazaar, the evidence for its three "Done when" checks, and the script for the 10-minute walkthrough. The walkthrough has three parts: the full shopping flow, then one hard bug, then one trade-off.

## Done when

| Check                            | Evidence                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CI passes**                    | The PR runs [ci.yml](../../.github/workflows/ci.yml): _Lint, types, tests, build_ and _Accessibility (Lighthouse ≥ 90)_. Every step passed locally in a clean worktree ([ci.md](ci.md)); the PR's own run is the proof.  |
| **The README is complete**       | [README.md](../README.md):<br>- quick start, scripts and environment variables<br>- folder structure and API contract summary<br>- mock and QA controls<br>- progress table and a link to every doc                      |
| **Each task has its own commit** | Every task from D0 to D5-8 has at least one commit starting with its ID, usually two: code, then docs. The two partner reviews are the exception: they happen in the partner's repository. Check with the command below. |

```bash
git log --oneline origin/develop..bug-bazar | grep -oE "^[0-9a-f]+ D[0-9](-[0-9])?" | awk '{print $2}' | sort -V | uniq -c
```

The only commit without a task ID is the Week 1 baseline, `340ee55 Bug Bounty Board App Commit.`, which the rename (D0) starts from.

## Opening the pull request

**First, finish the D4-6 steps:** the demo PR, the ruleset and the screenshot, all in [ci.md](ci.md). Then the required checks apply to this PR too.

1. **Open the pull request:**
   - from `bug-bazar` into `develop`
   - use the title and description from the [pull request description](#pull-request-description) below
2. **Wait for both checks to go green.** If one fails, the [CI troubleshooting table](ci.md#when-ci-is-red) says how to reproduce it locally.
3. **Request a review** from your review partner. Answer their comments in the PR (D5-6).

### Pull request description

**Title:** `The Bug Bazaar: Week 2 (D0–D5)`

```markdown
## What this is

The Week 1 Bug Bounty Board, grown into **The Bug Bazaar**: a React + TypeScript store with 5,000 products, a persistent cart, sign-in, checkout with safe retries, live stock over a WebSocket, and full error handling. It runs against a mock backend that implements the shared API contract (prices in cents).

## What reviewers should look at

- **Start here:** `bug-bazaar/docs/ARCHITECTURE.md`: folders, data flow, where state lives, and patterns.
- **Every decision, per task:** `bug-bazaar/docs/decisions.md`.
- **Tests:** 308, behavior-focused and mutation-checked. `bug-bazaar/docs/testing.md` maps them to the requirements.
- **AI use and its mistakes:** `bug-bazaar/docs/ai-notes.md`.

## How to try it

    cd bug-bazaar && npm ci && npm run dev

Sign in with `dev@bugbazaar.test` / `rubberduck`. The **QA panel** (bottom left) triggers every state: slow, 500, offline, empty, 404, an expired session, live-stock drops, and a crash.

## Checks

- [x] `npm run check` passes: lint, formatting, types, 308 tests, build
- [x] Lighthouse accessibility ≥ 90 on home, cart and login (100 locally)
- [x] Every task has its own commit, prefixed with its ID
- [ ] Partner reviews (D5-5, D5-6): in progress

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## The 10-minute walkthrough

**Before you start** (rehearsed end to end in headless Edge, including the 409 and the retry):

- Run `npm run dev`.
- Open the app in a private window (an empty cart, nobody signed in) with the DevTools console open.
- Run `bazaarMock.reset()` so the mock's stock and orders start fresh. It doesn't touch the browser's saved cart, which is why the window is private.
- Keep this page open on a second screen.

### 0:00–0:45: What it is

> "This is the Bug Bazaar: my Week 1 bug board turned into a store with 5,000 products. React and TypeScript in strict mode, Redux Toolkit for the cart and the session. The backend is a mock that runs in the browser and implements the shared API contract, so the app would run against a real server with one environment variable."

### 0:45–5:30: The full shopping flow

| Time | Do                                                                                                                                  | Say                                                                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:45 | Search "duck", pick the **Ducks** category, tick **In stock**, sort by price.                                                       | "Every filter is in the URL." **Reload**: same view. **Back**: the previous filter. "So a link reproduces exactly what I see."                                                                                                                                |
| 1:30 | Click **All**, scroll fast, open a product, press **Back**.                                                                         | "All 5,000 products, but only about 40 cards in the DOM. Back returns to the same row." (Details: performance.md, D4-3.)                                                                                                                                      |
| 2:10 | On the product page: **Add to cart** twice. Point at the stock number, and note the product's id in the URL (for example `p-0042`). | "Stock is live over a WebSocket. If someone else buys this, the number changes here without a refresh, and the cart can never hold more than is in stock."                                                                                                    |
| 2:40 | Open the **cart**, change a quantity with the stepper, **reload**.                                                                  | "The cart survives a reload. It's saved and validated in localStorage."                                                                                                                                                                                       |
| 3:00 | **Checkout**: you're sent to sign in. Sign in with `dev@bugbazaar.test` / `rubberduck`.                                             | "Checkout is protected. After signing in, I'm back at checkout, not the home page."                                                                                                                                                                           |
| 3:30 | In the console: `bazaarMock.liveStock.outage(15000); bazaarMock.setStock("p-0042", 1)` (your id), then **Place order** within 15 s. | "Someone bought all but one while my live feed was down. The server says 409, and the page names the item, lowers my cart to what's left, and lets me continue." (With the feed up, the cart would have been lowered live, before checkout: same rule, D4-4.) |
| 4:10 | `bazaarMock.fail("orders:create", 500, { once: true })`, **Place order**, then **Try again**.                                       | "A server error. Try again sends the _same_ idempotency key, so even if the first request had gone through, there would never be two orders. The 409 changed the cart, so this is a new purchase with a new key."                                             |
| 4:40 | The **confirmation page**: watch the steps fill in.                                                                                 | "The order starts as _queued_. The page checks every few seconds until it's ready to ship, which is the queue design in orders.md."                                                                                                                           |
| 5:00 | QA panel → **Crash this page**, then **Back to products**.                                                                          | "A bug in a page shows this instead of a blank screen, logged with a reference number. The header still works."                                                                                                                                               |

### 5:30–8:00: One hard bug: live stock that never connected (D4-4)

- **The symptom:** in the browser, the header said _"Live stock paused, reconnecting…"_ forever. Every unit test passed.
- **The first clue:**
  - The mock server reported **0 connections**: the client wasn't reaching it at all.
  - A WebSocket opened by hand in the console _did_ connect.
  - So the mock's interception worked, and the problem was _which_ WebSocket the client was using.
- **The root cause:**
  - The client took the WebSocket class as a default parameter, `WebSocketImpl = WebSocket`. A default parameter is evaluated when the feed is **created**.
  - `main.tsx` creates the feed at startup, _before_ the mock starts and replaces the global `WebSocket` with its interceptor.
  - So the feed kept the original browser WebSocket, dialed the real network, where no stock server exists, and retried forever.
- **Why the tests missed it:** every test passed a fake WebSocket in, so the default was never used.
- **The fix:**
  - Look the class up when connecting (`WebSocketImpl ?? globalThis.WebSocket`).
  - A regression test installs the WebSocket class _after_ creating the feed. That's the exact order that broke.
- **The lesson:** default parameters and module-level references freeze globals at the moment they're evaluated. And when every test injects a dependency, the default path is untested, so keep one test that uses it.

**Show it:**

- [src/api/stockFeed.ts](../src/api/stockFeed.ts), the line with `globalThis.WebSocket`.
- The QA panel's **Drop live stock**: the indicator goes to "reconnecting" and comes back.

### 8:00–9:30: One trade-off: server data is not in Redux

> "I use Redux, but products aren't in it."

- **What I chose:**
  - Product data goes through `useRequest` and a small query cache: about 180 lines, tested on their own.
  - Redux holds only what the app owns: the cart, the session and live stock.
- **What I gained:**
  - Race conditions, stale-while-revalidate and invalidation are each one tested function, instead of being spread across action types.
  - Redux DevTools shows what the user did, not 40 request lifecycles.
- **What it costs:**
  - Two places to look for data.
  - `forgetProducts`, the invalidation after an order, has to know each cached shape: a list, a product, related products.
- **When I'd change it:** with many more data shapes, or mutations that update several queries, I'd move to RTK Query or TanStack Query. The cache keys were designed to map onto theirs, so the move is mechanical.

More in [ARCHITECTURE.md → A choice to defend](ARCHITECTURE.md#a-choice-to-defend-server-data-is-not-in-redux).

### 9:30–10:00: Wrap up

> "Every pull request is checked: lint, types, 308 tests, the build and Lighthouse accessibility. A failing test blocks the merge. What I'd do next is in reflection.md: Playwright tests for the bugs only a browser shows, and a threat model for sign-in."

**If a question comes up:**

| Question                   | Answer from                                           |
| -------------------------- | ----------------------------------------------------- |
| How is the token stored?   | [auth.md](auth.md): sessionStorage, and the trade-off |
| Why a queue for orders?    | [orders.md](orders.md)                                |
| Any two architecture terms | [glossary.md](glossary.md)                            |
| How AI was used            | [ai-notes.md](ai-notes.md)                            |

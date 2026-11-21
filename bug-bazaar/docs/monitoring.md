# Monitoring

This page explains what happens when something unexpected goes wrong in the Bug Bazaar: what the user sees, what gets logged, and the three things worth tracking once real users arrive (D4-7).

"Unexpected" means a bug, not a failure the app already plans for. A 500, a timeout, a 409 or going offline are _expected_ failures: each has its own error state and copy (D3-4). This page covers the rest.

## What the user sees

### A page crashes while rendering

The page is replaced by a fallback; the rest of the app keeps working.

- **The message:** _"Something went wrong on this page. It wasn't anything you did, and your cart is safe. We've logged the problem. If you contact us, quote reference `4f9c2a1b`."_
- **Two ways out:** **Try again** renders the page again, and **Back to products**. Following any link in the header also clears the error, because the boundary resets when the path changes.
- **The header stays:** logo, account and cart are outside the boundary, so they keep working.
- **Accessibility:** focus moves to the fallback's heading, and the tab title changes to "Something went wrong".
- **No raw error text:** the error's own message is never shown (D3-4).

### Something outside a page crashes

This covers the header and the store or router providers. A last-resort boundary around the whole app shows _"The Bug Bazaar hit a problem"_, with **Reload the page** and **Go to the home page**. It uses nothing from the store or the router, because they may be what broke. Either way, a blank white page is never the outcome.

### An error outside rendering

This covers errors thrown in a click handler or a timer, and promise rejections nobody handled. These don't break what's on screen, so the page stays as it is, and the error is only logged. React's error boundaries can't catch these; window-level handlers do.

## What gets logged

**Every unexpected error becomes one report.** Each has:

| Field            | Example                                              | Why                                                                    |
| ---------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `id`             | `4f9c2a1b`                                           | Shown on the fallback, so a user's support message matches a log entry |
| `source`         | `render`, `uncaught`, `unhandled-rejection`          | Crashed a page, or failed quietly                                      |
| `name`/`message` | `TypeError` / `Cannot read properties of undefined…` | What broke                                                             |
| `stack`          | the JavaScript stack                                 | Where in the code                                                      |
| `componentStack` | `at ProductCard › at ProductGrid › at ProductsPage`  | Render errors only: which component threw                              |
| `route`          | `/products/p-0042`                                   | Which page. **The path only**: the query string can hold search terms  |
| `time`, `mode`   | ISO time, `production`                               | When, and whether it was a real user or local development              |

**Deliberately not logged:** the session token, the user's email, cart contents, form input, and query strings. A log full of personal data is a liability, and none of it helps fix a bug.

**Where reports go:**

- **A transport.** Today it's the browser console. In production it would be an error-tracking service (Sentry, Datadog, …), and it's swapped in one place (`createMonitor({ transport })` in [src/monitoring/monitor.ts](../src/monitoring/monitor.ts)). A transport that throws is ignored, so reporting never causes a second failure.
- **A 50-entry buffer**, for QA: `bazaarMonitoring.reports()` in the DevTools console.

**One error, one report:**

- The same error object is reported once, however many places see it.
- React 18's development build sends errors a boundary _already caught_ to `window.onerror` too, once per render attempt, and each attempt throws a new error object. So the window handler waits one task and drops an error the boundary just reported (same name and message, within a second). Without this, one crash in development produced three entries.

**Code:**

- [src/monitoring/](../src/monitoring/): the monitor, global handlers and console API.
- [src/components/ErrorBoundary.tsx](../src/components/ErrorBoundary.tsx): the boundary.
- [src/app/PageCrashed.tsx](../src/app/PageCrashed.tsx) and [AppCrashed.tsx](../src/app/AppCrashed.tsx): the two fallbacks.

## Trying it

With the mock API on (dev, preview and the deployed demo), open the **QA panel**:

| Button                             | Expected                                                           |
| ---------------------------------- | ------------------------------------------------------------------ |
| **Crash this page (render error)** | Fallback with a reference; header still works; one `render` report |
| **Throw in a click handler**       | Nothing changes on screen; one `uncaught` report                   |
| **Unhandled promise rejection**    | Nothing changes on screen; one `unhandled-rejection` report        |

Then run `bazaarMonitoring.reports()` in the console. `bazaarMonitoring.crashPage()` does the same as the first button.

**Verified:**

- **Automated tests:** [src/app/crash.test.tsx](../src/app/crash.test.tsx), [src/monitoring/\*.test.ts](../src/monitoring/).
- **In headless Edge, against both the production build and the dev server:**
  - The fallback appears, focused, with the header intact.
  - Exactly one report, with a component stack, and the reference on screen matches it.
  - Try again and header navigation both recover.
  - Click-handler and promise errors are logged without touching the page.

## Three things to track

Once this runs for real users, these are the three numbers worth a dashboard and an alert.

### 1. Crash-free sessions

- **What:** the share of visits with no `render` report, i.e. no fallback screen. Also the top crashing pages (`route`) and components (`componentStack`).
- **Why:** a fallback screen is the worst experience the app can give that still isn't blank. This is the most direct measure of "is the store broken for people?".
- **Alert:** below 99.5% of sessions, or any new error that appears right after a deploy. Group reports by `name` + `message` + top stack frame, so one bug counts as one issue, however many users hit it.

### 2. Checkout success rate, and why checkout fails

- **What:** of shoppers who press "Place order", how many reach the confirmation page. Failures split by kind: `out-of-stock` (409), `server`, `timeout`, `offline`, `unauthenticated`.
- **Why:** it's the step that makes money, and the one most sensitive to backend trouble. These failures are _handled_ (D3-4), so they never show up as crashes, and a spike in 409s or timeouts would otherwise go unseen. Idempotent retries (D3-2) also mean a timeout doesn't always mean a lost order: tracking whether the retry succeeded tells the two apart.
- **Alert:** success rate drops sharply against the same hour last week, or `server` + `timeout` failures go above 2% of attempts.

### 3. Real-user performance: Largest Contentful Paint and Interaction to Next Paint

- **What:**
  - **LCP:** how long until the product grid is visible.
  - **INP:** how quickly the page responds to a click or a keystroke, e.g. filtering and typing in search.
  - Both measured in users' browsers, as the 75th percentile, split by page and device type.
- **Why:** D4-2 and D4-3 made the list fast _on this machine_. Real users have slower phones and networks, and a regression (a heavier image, a re-render that sneaks back in) shows up here first. Live-stock reconnects belong in this report too: a rising reconnect rate means the WebSocket isn't holding up.
- **Alert:** LCP p75 over 2.5 s or INP p75 over 200 ms (Google's "good" thresholds) on any page, after a deploy.

## Not done (and what it would take)

- **A real error service:** a transport that sends reports (with `navigator.sendBeacon`, so it survives the page closing). It would go through `src/api/`, the only place allowed to make network calls.
- **Source maps:** production stacks are minified. They would be uploaded to the error service at deploy time, not served publicly.
- **Sampling and rate limits:** one broken component can throw on every render for every user. Real services cap duplicates. The buffer here is capped at 50, but nothing is sent anywhere yet.
- **Metrics 2 and 3:** they need an analytics pipeline and the `web-vitals` library, which is out of scope for a mock-backed demo. The fields they need (error kind, route) already exist.

# The Bug Bazaar: Product Spec

> Source: _The Bug Bazaar: One-Week Project_ (PDF brief). This file is the in-repo copy of the spec. Every task, commit and review refers back to it.

## 1. Overview

In one week, the Week 1 **Bug Bounty Board** becomes **The Bug Bazaar**, a small store that sells developer gear such as rubber ducks, mechanical keyboards, coffee and stickers. Each day has a theme, and together the missions cover every topic on the tracker.

**Before Day 1:** Rename the app to The Bug Bazaar and keep the Week 1 repo history. ✅ Done: the folder was renamed from `bug-bounty-starter/` to `bug-bazaar/` with `git mv`, so the history carries over.

| Day | Theme      | Focus                                                                    | Pts     |
| --- | ---------- | ------------------------------------------------------------------------ | ------- |
| 1   | Foundation | Setup, API contracts, TypeScript, data layer                             | 15      |
| 2   | Browse     | Product list, filters, UI states, effects, custom hooks, race conditions | 21      |
| 3   | Buy        | Redux Toolkit, cart, auth, backend errors, caching                       | 21      |
| 4   | Harden     | Accessibility, performance, WebSockets, testing, CI, monitoring          | 22      |
| 5   | Explain    | Architecture docs, reviews, AI notes, assessment, submission             | 21      |
|     |            | **Total**                                                                | **100** |

**Tech stack:** Free choice of libraries and tools. The only fixed requirements are **React**, **TypeScript**, and the **shared API contract** below.

---

## 2. Shared API contract

Every task builds against this contract, and it can be mocked any way you like. **Prices are stored in cents.**

```ts
type Product = {
  id: string;
  name: string;
  price: number; // cents
  category: "keyboards" | "ducks" | "coffee" | "stickers";
  stock: number;
  rating: number;
  imageUrl: string;
};

type ApiError = {
  error: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
};
```

| Method | Endpoint                                      | Success                                   | Errors                          |
| ------ | --------------------------------------------- | ----------------------------------------- | ------------------------------- |
| GET    | `/api/products?search=&category=&sort=&page=` | `200 { items: Product[], total: number }` | 500                             |
| GET    | `/api/products/:id`                           | `200 Product`                             | 404                             |
| POST   | `/api/login`                                  | `200 { token, user }`                     | 400, 401                        |
| GET    | `/api/me`                                     | `200 user`                                | 401                             |
| POST   | `/api/orders`                                 | `201 { id, status: "queued" }`            | 400, 401, 409 when out of stock |
| GET    | `/api/orders/:id`                             | `200 { id, status }`                      | 401, 404                        |

---

## 3. Guidelines

1. **You choose the approach.** Each task describes the outcome, not how to build it. Any tool or technique mentioned is only an example. For example, live stock could use WebSockets, server-sent events or polling. For every task:
   - Meet the **"Done when"** criteria.
   - Record the choice in `docs/decisions.md`: what you used, what else you considered, and why.
   - Know the core principles of the tracker topic, even if you didn't use it. For example, if you chose polling, be able to explain how WebSockets work and when you'd pick them.
   - Evaluators score **understanding and reasoning**, not the tools picked.
2. **AI use isn't restricted, but you must be able to explain your work.** In the walkthrough, evaluators may point at any part and ask what it does, why it's built that way, and what would break if it changed. AI-generated code you can't explain scores **half points at most**.

## 4. Rules

- At least **one commit per task**, starting with the task ID, for example `D3-2: add cart page`.
- **Push by the end of each day**, and open **one pull request** at the end of the week.
- Written tasks go in the `docs/` folder.
- Log notable AI uses in `docs/ai-notes.md` (see D5-7).
- Some tracker topics appear twice (TypeScript, UI states, Testing, Submission). One task covers each, and its score applies to every matching row.

## 5. Scoring

The week is worth **100 points**. Divide by 10 for the score out of 10.

- **Full points:** All acceptance criteria met, and the engineer can explain the choices.
- **Half points:** Works but misses one criterion, or the engineer can't explain it.
- **No points:** Missing or doesn't work.

**If time runs short:** Days 1 to 3 produce the working store, so finish them before polishing Day 4.

---

## 6. Tasks

### Day 1: Foundation (15 pts)

_Set up a typed project with a mock API that every later task builds on._

| ID   | Topic                  | Goal                                                                                                                                                                                      | Done when                                                                                       | Pts |
| ---- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --- |
| D1-1 | Setup                  | Make the project easy for a teammate to pick up: consistent formatting and linting, a clear folder structure, and a README covering scripts and environment variables.                    | A teammate can clone and run the app in **under 5 minutes** using only the README.              | 3   |
| D1-2 | HTTP and API contracts | Document the shared contract in `docs/api-contract.md`, then mock it so the app runs without a real backend. Seed **5,000 products**, and make each error possible to trigger on purpose. | Every endpoint returns the documented shapes and status codes, **including each listed error**. | 3   |
| D1-3 | TypeScript             | Migrate to TypeScript in **strict mode**. Type the shared contract and props, and model request status so impossible states can't be represented.                                         | Type checking passes with **no `any` and no `@ts-ignore`**.                                     | 5   |
| D1-4 | Data                   | Give the app one place that all requests go through.                                                                                                                                      | Components **never make network calls directly**.                                               | 4   |

### Day 2: Browse (21 pts)

_Build the browsing experience, from the product grid to fast, reliable search._

| ID   | Topic                 | Goal                                                                                                                                                                                                         | Done when                                                                                                      | Pts |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --- |
| D2-1 | Product list          | Show products in a grid with a details page. Each product shows its image, name, price and stock.                                                                                                            | Prices display correctly from cents, and the grid **works with a keyboard**.                                   | 4   |
| D2-2 | Filters               | Let users search, filter by category, show only in-stock items, and sort, with a result count and a way to clear filters.                                                                                    | Filters **survive a refresh**, a **copied link reproduces the same view**, and the **Back button works**.      | 4   |
| D2-3 | UI states             | Handle loading, empty, error and success states consistently on the list and details pages, with a way to retry after an error.                                                                              | Each state **can be triggered on purpose** and looks consistent across pages.                                  | 4   |
| D2-4 | useEffect and cleanup | Clean up side effects on the details page, including in-flight requests when the user switches products and any listeners or timers when the page closes. Add a **Back to Top** button as one such listener. | Switching products quickly **never shows the wrong one**, and **nothing keeps running** after the page closes. | 3   |
| D2-5 | Custom hooks          | Extract at least **two** pieces of reusable logic into typed custom hooks, such as debouncing input or syncing state with storage.                                                                           | Each hook is reusable and removes duplicated logic.                                                            | 3   |
| D2-6 | Race conditions       | Simulate slow, out-of-order responses, then make sure search always shows results for the latest query.                                                                                                      | Typing fast **never shows results for an old query**.                                                          | 3   |

### Day 3: Buy (21 pts)

_Complete the shopping flow, from adding to the cart to a placed order._

| ID   | Topic          | Goal                                                                                                                                                                                 | Done when                                                                                                                                                              | Pts |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| D3-1 | Redux Toolkit  | Manage cart and session data in shared global state, with derived values for the cart item count and total.                                                                          | The header badge uses a **derived value**, and state only changes through **defined updates**.                                                                         | 4   |
| D3-2 | Cart           | Let users add, remove and change quantities, then check out and see an order confirmation. Make sure retrying a checkout can't create a second order.                                | Quantities **can't exceed stock**, the cart **survives a reload**, a **409 names the item** that ran out, and a retried checkout **doesn't create a duplicate order**. | 7   |
| D3-3 | Auth           | Add login and logout, protect the account page and checkout, and return users to where they were after logging in.                                                                   | A **401 clears the session**, the login form **can't be double-submitted**, and `docs/auth.md` explains where the token is stored and the trade-off.                   | 4   |
| D3-4 | Backend errors | Turn every API error into a helpful response: form field errors for 400, signing out for 401, a Not Found page for 404, an out-of-stock message for 409, and a retry option for 500. | Errors are handled **in one consistent way**, and **raw error messages never reach the screen**.                                                                       | 3   |
| D3-5 | Caching        | Avoid refetching data the app already has, and refresh stock after an order is placed.                                                                                               | Revisiting a page **reuses existing data**, and the engineer can explain **when stale data is acceptable**.                                                            | 3   |

### Day 4: Harden (22 pts)

_Make the store accessible, fast, live, and tested._

| ID   | Topic                        | Goal                                                                                                                                           | Done when                                                                                                                                | Pts |
| ---- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --- |
| D4-1 | Accessibility                | Make the store usable with a keyboard and a screen reader.                                                                                     | Lighthouse accessibility **≥ 90** on the home, cart and login pages, and **form errors are announced**.                                  | 3   |
| D4-2 | Performance                  | Measure the product list, then fix the two slowest spots.                                                                                      | `docs/performance.md` shows **before and after** measurements for each fix.                                                              | 3   |
| D4-3 | Memoization / virtualization | Keep the 5,000-item list smooth, and avoid unnecessary re-renders.                                                                             | Scrolling stays smooth, and `performance.md` justifies each optimization, **including one removed or skipped** because it wasn't needed. | 3   |
| D4-4 | WebSockets                   | Show stock changes live, without a page refresh.                                                                                               | Stock updates live, the feed **recovers after a disconnect**, and it **stops when the page closes**.                                     | 3   |
| D4-5 | Testing                      | Test the most important behavior: cart logic, custom hooks, login, filtering, and checkout, including both a successful order and a 409 error. | **At least 15 meaningful tests** pass, testing behavior rather than implementation details.                                              | 5   |
| D4-6 | Git / CI / CD                | Automatically check every pull request with linting, type checking, tests and a build. Bonus: deploy `main` automatically.                     | A **failing test blocks the merge**.                                                                                                     | 3   |
| D4-7 | Monitoring                   | Catch unexpected errors so they show a fallback screen and get logged, then list three things you'd track in `docs/monitoring.md`.             | A thrown error **shows a fallback screen and is logged** instead of crashing the app.                                                    | 2   |

### Day 5: Explain (21 pts)

_Document the design, review a teammate's work, and present the store. Swap repos with a review partner first thing in the morning so both reviews can be done the same day._

| ID   | Topic                    | Task                                                                                                                                                                             | Done when                                                                                                                                                      | Pts |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| D5-1 | Architecture             | Write `docs/ARCHITECTURE.md` with the folder structure, a data flow diagram, and where each kind of state lives: server, client and URL.                                         | It **matches the code**, and the engineer can defend one choice.                                                                                               | 3   |
| D5-2 | Design patterns          | In `ARCHITECTURE.md`, show three patterns used in the store, such as container/presentational components, custom hooks, or an adapter.                                           | Each pattern lists **where it's used and why**.                                                                                                                | 2   |
| D5-3 | Queues / microservices   | Design the order flow in `docs/orders.md`: an order service places jobs on a queue for payment, inventory and email workers.                                                     | Includes a **diagram** and explains why a queue helps, what happens if email is down, and how the D3-2 approach prevents double charges.                       | 2   |
| D5-4 | Architecture vocabulary  | In `docs/glossary.md`, define latency, idempotency, horizontal scaling, CDN, cache invalidation and eventual consistency in your own words, each with an example from the store. | The engineer can explain **any two terms** the evaluator picks at random.                                                                                      | 2   |
| D5-5 | Architecture review      | Review your partner's `ARCHITECTURE.md`.                                                                                                                                         | The review names **two strengths, two risks, and one recommendation**.                                                                                         | 2   |
| D5-6 | Code review              | Review your partner's pull request, and respond to the comments on your own.                                                                                                     | **At least 5 useful comments** covering correctness, readability and accessibility, plus one piece of praise.                                                  | 2   |
| D5-7 | AI workflow and AI notes | Complete `docs/ai-notes.md`.                                                                                                                                                     | Logs **three AI uses** (prompt, what was kept, what was changed and why), **one AI mistake** and how it was caught, and **one thing you wouldn't hand to AI**. | 3   |
| D5-8 | Assessment               | Write `docs/reflection.md`.                                                                                                                                                      | Rates **each topic out of 10** and names **two gaps**, each with one specific next step.                                                                       | 2   |
| D5-9 | Submission               | Open the pull request and give a 10-minute walkthrough: demo the full shopping flow, then explain one hard bug and one trade-off.                                                | **CI passes**, the **README is complete**, and **each task has its own commit**.                                                                               | 3   |

---

## 7. Required documents checklist

| File                   | Task                               |
| ---------------------- | ---------------------------------- |
| `docs/decisions.md`    | Every task                         |
| `docs/api-contract.md` | D1-2                               |
| `docs/auth.md`         | D3-3                               |
| `docs/performance.md`  | D4-2, D4-3                         |
| `docs/monitoring.md`   | D4-7                               |
| `docs/ARCHITECTURE.md` | D5-1, D5-2                         |
| `docs/orders.md`       | D5-3                               |
| `docs/glossary.md`     | D5-4                               |
| `docs/ai-notes.md`     | D5-7 (logged all week)             |
| `docs/reflection.md`   | D5-8                               |
| `docs/workflow.md`     | Team process: dev → QA per feature |

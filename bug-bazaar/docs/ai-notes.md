# AI Notes

How AI was used to build the Bug Bazaar, what it got wrong, and where it shouldn't be used (D5-7). The first part is the write-up the task asks for:

- [how I worked with AI](#how-i-worked-with-ai)
- [three AI uses](#three-ai-uses)
- [one AI mistake and how it was caught](#the-ai-mistake-i-learned-most-from)
- [one thing I wouldn't hand to AI](#one-thing-i-wouldnt-hand-to-ai)

After that comes [the full log](#the-full-log-every-ai-mistake-this-week), every AI mistake recorded during the week as it happened.

---

## How I worked with AI

**The tool:** Claude Code, an AI coding agent, in VS Code. It reads the repository, runs commands, and edits files.

**One task per prompt.** The prompt was usually a single line, "push it and start D4-3". The AI then worked from three sources: the spec ([product-spec-doc.md](product-spec-doc.md)), the code, and the docs from earlier tasks.

**Its work was checked before I accepted it,** by gates the AI had to pass every time:

- **Static checks and tests:** `npm run check` (lint, formatting, types, tests, build).
- **A real browser** for anything that depends on the runtime: headless Edge driven over the DevTools protocol.
- **Measurements** for performance claims: Lighthouse, traces, render counts.
- **Mutation checks** for tests that matter: break the code on purpose and confirm the test fails.

**I kept the decisions that were mine:**

- **Product questions** were asked, not guessed. For example: paginate the 5,000 products, or offer a "Show all" view?
- **Every push** waited for my go-ahead.
- **Repository settings** I changed myself: branch protection, GitHub Pages.

**Mistakes were logged when they happened,** in [the full log](#the-full-log-every-ai-mistake-this-week), not reconstructed at the end of the week.

---

## Three AI uses

### 1. Login, logout and protected routes (D3-3)

- **Prompt:** "push it and start D3-3", with the spec row as the brief: _add login and logout, protect the account page and checkout, return users to where they were. Done when a 401 clears the session, the form can't be double-submitted, and `docs/auth.md` explains the token trade-off._
- **What the AI produced:**
  - a `session` slice, saved to `sessionStorage` and checked against `GET /me` at startup
  - a `RequireAuth` route guard
  - a `?returnTo=` redirect after signing in
  - a 401 handler wired into the API client
  - the login page
  - `auth.md`
- **Kept:** the overall design. The session in `sessionStorage`, not `localStorage`, with the trade-off written down. The guard. The 401 → `sessionEnded` wiring, including ignoring a late 401 for a token the user has already replaced.
- **Changed, and why:**
  - **The `returnTo` check was bypassable.** It validated the raw value but returned the normalized one, so `/.//evil.test` became `//evil.test`, a link to another site: an open redirect. Now the output is checked too. Mutation testing caught it: removing a validation line failed no test.
  - **The double-submit guard didn't guard.** It read React state, which is stale until the next render. The real-browser check fired three clicks in one task, and three login requests went out. Now it's a ref.
- **Takeaway:** the AI was good at the structure and the documentation. The security-relevant details were wrong in ways that looked right and passed the first tests.

### 2. Keeping the 5,000-product list smooth (D4-3)

- **Prompt:** "push it and start D4-3". Spec: _keep the 5,000-item list smooth, avoid unnecessary re-renders, and justify each optimization, including one removed or skipped._
- **What the AI did first:** it asked a product question instead of guessing. The list was already paginated at 24 per page, so there was no 5,000-item list to make smooth. Should pagination stay, or should there be a view that shows everything? **I chose: keep pagination as the default and add a "Show all" view.**
- **What it produced:**
  - a virtualized grid (`@tanstack/react-virtual`, the page as the scroller) loading 100 products per request
  - `React.memo` on `ProductCard`
  - a lazy-loaded chunk for the new view
  - scroll restoration when returning to the list
  - a scroll benchmark script
- **Kept:** virtualization by rows, the lazy chunk, the benchmark, and the write-up in [performance.md](performance.md).
- **Changed, and why:**
  - **The memo had no effect.** The grid passed a new `{ index, total }` object on every render. The benchmark's render count showed it: 12,140 renders before, 11,715 after. With the object split into two numbers: 590.
  - **Back didn't return to the same place,** for two different reasons, found in a real browser:
    - the position was saved too late, after the page had already scrolled to the top
    - the virtualizer overwrote the restore with its own initial scroll
  - **A `useCallback` was removed:** nothing compared its identity. That became the spec's "one removed" example, with the reason.
- **Takeaway:** asking the product question first was the most useful thing the AI did in this task. On the code side, every optimization had to be _measured_. Its first memo looked textbook-correct and did nothing.

### 3. CI that blocks a failing pull request (D4-6)

- **Prompt:** "push it and start D4-6". Spec: _check every pull request with linting, type checking, tests and a build; a failing test blocks the merge. Bonus: deploy automatically._
- **What the AI produced:**
  - `ci.yml`, with one step per gate and an accessibility job
  - `deploy.yml`, to GitHub Pages
  - the subfolder support the deploy needed: Vite `base`, the router `basename`, image URLs and a `404.html` copy for deep links
  - a demo branch with a deliberately failing test
  - [ci.md](ci.md)
- **Kept:** both workflows, the subfolder support, and the demo branch.
- **Changed, and why:**
  - **"A failing test blocks the merge" isn't something CI can do on its own.** A red check is only a signal; branch protection makes it a gate, and that's a repository setting. The AI could push branches but had no GitHub CLI or API token for repository settings, and an agent shouldn't change repository permissions anyway. So it wrote the exact steps and left them to me. That includes turning off admin bypass, or I could still merge a red PR myself.
  - **The deploy target:** the spec says `main`. In this repository the main line is `develop`, and `master` holds old exercises. The workflow deploys `develop`, and the docs say why.
  - **Local checks were misleading twice:**
    - A stale preview server from an earlier run answered on the same port, so a check ran against the wrong build.
    - Git Bash rewrote `/react-practice/` into a Windows path.

    Both were caught by checking _which_ build was being served before trusting a result. A clean-worktree run of every CI step confirmed the workflow itself.
- **Takeaway:** the AI could write the automation and prove it locally. The part that actually enforces the rule is a permission, and that stays with a person.

---

## The AI mistake I learned most from

**A refactor that silently blinded two tests (D4-1, caught in D4-5).**

- **What happened:** in D4-1 the AI changed every page heading from `<h2>` to `<h1>`, and fixed every test that went red. Two race-condition tests didn't go red. Their helper looked for `h2.page-heading`, which now matched nothing. Their assertion, "the previous product was never shown, not even briefly", was checking an always-empty list, so it passed whether the race was handled or not.
- **How it was caught:** the D4-5 test audit looked specifically for tests that query by tag or CSS class, because those can lose their target without failing. The helper turned up, and a mutation check confirmed it: breaking the race handling on purpose didn't fail the tests.
- **What changed:** the helper finds the page heading by meaning (`main h1`), and each test also asserts that it _did_ see the current product. Now an empty recording fails, and breaking the race handling turns both tests red.
- **Why this one:** nothing looked wrong. Every test was green, CI would have been green, and a review of the D4-1 diff wouldn't have shown it, because the broken line wasn't in the diff. It changes how I check refactors: after changing markup, search the tests for the _old_ markup. And any "X never happens" assertion needs a check that the test can actually see X.

---

## One thing I wouldn't hand to AI

**Deciding that security-sensitive code is safe.** That covers authentication, redirects, anything touching payment, and who is allowed to merge.

The AI writes this code well, and I'd keep using it to. But two of the mistakes this week were in exactly this area, and each one looked correct:

- the open redirect
- the double-submit guard that didn't guard

They passed the first round of tests, the code read cleanly, and the comments confidently described protections that weren't there.

AI can't be what _signs off_ on them, for two reasons:

- **It can't be accountable.** If a redirect check is wrong, users get phished. That judgment has to belong to someone who answers for it.
- **Its confidence carries no information.** The broken guard came with a comment saying exactly what it protected against.

**In practice:**

- AI writes the code and the tests.
- I attack it: mutation checks, real-browser probes, trying bypasses like `/.//`.
- A person approves the merge.
- Repository permissions (branch protection, admin bypass, deploy settings) are set by a person, never by an agent with credentials.

---

## The full log: every AI mistake this week

Recorded as each one was found, newest last.

---

### AI mistake: outdated library API (D1-2 → caught in D1-3)

- **What happened:** the D1-2 mock code (AI-written) started MSW with `onUnhandledRequest: "bypass"` in the browser and `"error"` in tests. That option name is from **MSW 2**. MSW 3, the version actually installed, renamed it to `onUnhandledFrame`.
- **Why nobody noticed:** plain JavaScript passes unknown option keys through silently. All 25 tests still passed, and the browser smoke test worked, because the defaults happened to be harmless.
- **How it was caught:** the D1-3 TypeScript migration. `tsc` reported `'onUnhandledRequest' does not exist in type 'StartOptions'`.
- **Impact:** the tests' safety net (fail on any request without a handler) had never been active, and the browser logged warnings instead of quietly bypassing Vite's asset requests.
- **Lesson:** AI suggestions reflect whatever version of a library was most common in its training data, not necessarily the installed one. Check new-major APIs against the installed package (`node_modules/<pkg>/README.md` or its types). Strict types are a cheap way to catch this whole class of mistake.

---

### AI mistake: assuming aborts reach the mock (D2-3)

- **What happened:** the QA panel's "fail the next request" didn't work in the browser. The AI correctly diagnosed React StrictMode's double request using up the one-shot failure. But its first fix (skip requests whose `request.signal.aborted` is true) **assumed** the abort would reach the MSW handler.
- **How it was caught:** not by tests (jsdom has no StrictMode and no Service Worker), but by driving real headless Edge and reading the screenshots. The error state never showed up. A targeted probe (abort a request, then check whether the forced failure was still armed) proved that the Service Worker doesn't forward aborts.
- **What changed:** the speculative check was removed, and the panel switched to persistent failures with an explicit "Stop errors" step, which is deterministic everywhere.
- **Lesson:** "the tests pass" isn't "it works". Check behavior that depends on the runtime (StrictMode, Service Workers, real browser history) in a real browser, and test assumptions with a probe instead of coding around them.

---

### AI mistake: a test that couldn't fail (D3-2)

- **What happened:** the AI wrote a "can't be double-submitted" test: double-click Place order, then assert one request. It passed.
- **How it was caught:** mutation testing. With both double-submit guards deliberately removed, the test **still passed**. The mock answered instantly, so the first order completed and the page navigated away before the second click landed. The test never reached the situation it claimed to check.
- **What changed:** the test now holds the first request in flight for 200 ms (an MSW handler that delays, then falls through to the real one). It asserts the button is disabled and reads "Placing your order…" during the request, and that only one request was sent. It fails without the guards and passes with them.
- **Lesson:** a green test isn't evidence until you've seen it go red for the right reason. For every key guarantee this week (race safety, effect cleanup, idempotency, double-submit), I break the code on purpose and confirm the test catches it.

---

### AI mistake: a double-submit guard that read stale state (D3-2 → caught in D3-3)

- **What happened:** for both checkout (D3-2) and login (D3-3), the AI added an early return, `if (status === "submitting") return`, with a comment claiming it stopped "a second click that lands before React re-renders". It doesn't. The handler's `status` comes from the last render, so until React re-renders, a second event still sees "idle".
- **Why the tests didn't catch it:** user-event waits between events, so React re-rendered and the **disabled button** blocked the second click. The early return never had to do anything, and a mutation that removed only the button's `disabled` would have been the right check.
- **How it was caught:** the real-browser check fired click, click and `requestSubmit()` in one task against an 800 ms server. **Three** login requests went out.
- **What changed:** both guards are now a ref, which changes immediately. New tests fire both events inside one `act()`, so there's no re-render in between. They fail with the old state-based guard and pass with the ref.
- **Lesson:** a comment describing what code protects against is a claim, not a proof. Test the exact situation the comment names, here "before React re-renders", and make sure the test's tooling doesn't quietly avoid that situation.

---

### AI mistake: an open-redirect check that normalization could bypass (D3-3)

- **What happened:** the AI's first `safeReturnTo` checked the **raw** `?returnTo` value (one leading `/`, no `//`, no `\`) and then returned the URL-normalized path. But normalization can create what the check forbids: `/.//evil.test` passes, and resolving `.` turns it into `//evil.test`, a link to another site.
- **How it was caught:** mutation testing. Removing a validation line **didn't fail any test**. Every unsafe input in the tests happened to normalize to `/`, the same as the fallback, so the tests couldn't tell "rejected" from "cleaned up". Asking why led to the bypass.
- **What changed:** the normalized result is checked too. The tests use a distinct fallback (`/fallback`) and include dot-segment inputs. A check that no input could trigger (the origin comparison) was removed as dead code.
- **Lesson:** validate what you **output**, not only what you received. And when a test's "rejected" value is also a plausible normal result, the test can pass for the wrong reason.

---

### AI mistake: a React.memo that couldn't work (D4-3)

- **What happened:** the AI memoized `ProductCard` for the virtualized list, but its own grid code passed `position={{ index, total }}`, a new object on every render. Memo's shallow comparison always failed, so every visible card still re-rendered on every scroll frame.
- **How it was caught:** measurement, not review. The scroll benchmark counted card renders: 12,140 without memo and 11,715 with it. The optimization had no effect.
- **What changed:** the props became two numbers (`positionIndex`, `setSize`). Card renders during the same scroll fell to 590 (−95%), and the median frame went from 33 to 17 ms.
- **Lesson:** `React.memo`, `useMemo` and `useCallback` only help if the values being compared can actually be equal from render to render. Don't assume a memoization works: count renders before and after. The same reasoning removed a `useCallback` whose identity nothing compared.

---

### AI mistake: two scroll-restore bugs only a browser could show (D4-3)

- **What happened:** "Back returns to the same place in the 5,000-item list" was written twice before it worked. (1) The position was saved in a normal effect's cleanup, which runs after React has swapped in the shorter product page, when the browser has already clamped `scrollY` to near 0. (2) A manual `scrollTo` on return was overwritten by the virtualizer, which scrolls the window to its own `initialOffset` when it attaches.
- **How it was caught:** the headless-browser check (Back from product #1996 landed at the top), then a frame-by-frame probe of `scrollY` and sessionStorage, then reading the library source for the attach-time scroll.
- **What changed:** save in a layout-effect cleanup (it runs before the list's DOM is removed), and restore through the virtualizer's `initialOffset` option. Verified: Back from #2001 returns to #1996.
- **Lesson:** jsdom has no layout or scrolling, so these bugs can't exist there. Behavior that depends on layout timing needs a real browser, and when a library owns scrolling, read how it behaves on mount before fighting it.

---

### AI mistake: a global captured too early (D4-4)

- **What happened:** the AI wrote the live stock client with `WebSocketImpl = WebSocket` as a default parameter, which is evaluated **when the feed is created**. `main.tsx` creates the feed at startup, _before_ the mock backend starts and replaces the global `WebSocket` with its interceptor. The feed kept the original constructor, dialed the real network (where no stock server exists), and retried forever. The page sat on "Live stock paused, reconnecting…".
- **Why the tests didn't catch it:** every unit test injected a fake WebSocket class, so the default was never used.
- **How it was caught:** the real-browser check showed 0 connections. A probe that opened a WebSocket by hand _did_ connect, which pointed at _when_ the constructor was taken, not _whether_ interception worked.
- **What changed:** the class is looked up when connecting (`WebSocketImpl ?? globalThis.WebSocket`), and a regression test installs the WebSocket class _after_ creating the feed.
- **Lesson:** default parameters and module-level references freeze globals at evaluation time. Anything that may be replaced later (mocks, monitoring wrappers, polyfills) should be read at the moment it's used. And when every test injects a dependency, the default path is untested: keep one test that exercises it.

---

### AI mistake: a refactor that silently blinded two tests (D4-1 → caught in D4-5)

- **What happened:** in D4-1 the AI changed every page heading from `<h2>` to `<h1>` and updated every test that _failed_ as a result. Two race-condition tests didn't fail. Their helper recorded headings with `document.querySelectorAll("h2.page-heading")`, which now matched nothing, so the assertion "the previous product was never shown, not even briefly" was checking an always-empty set.
- **Why it slipped through:** a refactor is usually checked by "the tests still pass", but a test that queries by tag and CSS class can lose its target **and still pass**. Nothing goes red when a negative assertion ("X never appeared") watches nothing.
- **How it was caught:** the D4-5 audit, which looked specifically for `querySelector`, classes and other markup-coupled queries in tests.
- **What changed:** the helper selects the page heading by meaning (`main h1`), and each test also asserts the recorder saw the _current_ product, so an empty recording fails. Mutation-checked against broken race safety, old version vs new.
- **Lesson:** negative assertions ("never", "not even briefly", "no request") need a positive control proving the observation works. And after any markup change, search tests for the old markup, not just for failures.

---

### AI mistake: deduplicating by error object, when React makes new ones (D4-7)

- **What happened:** the AI deduplicated error reports by error object, assuming that when React 18 (in development) also sends a boundary-caught error to `window.onerror`, it's the same object. It isn't. React retries a failed render, StrictMode renders twice, and each attempt throws a **new** error. One crash produced three reports: one `render`, two bogus `uncaught`.
- **How it was caught:** a test written to mimic a real bug, a component that throws a new `TypeError` on every render, instead of re-throwing one shared error. It failed with three reports where one was expected.
- **What changed:** the window handler waits one task, then also drops an error with the same name and message as a `render` report from the last second. Two tests cover it: drop the retries, and keep a different error. A real browser confirmed one report in both builds. In development React raised the error to `window` four times, and production React not at all.
- **Lesson:** test doubles should behave like the real failure. A test that throws one shared error object would have passed, and the bug would only have shown up as a noisy log in development.

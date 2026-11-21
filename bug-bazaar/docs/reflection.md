# Reflection

A self-assessment of the Bug Bazaar week (D5-8): a rating out of 10 for each topic, then the two gaps that matter most, each with one specific next step.

## How the ratings work

A rating is **how well I could do this again without help and defend it**, not whether the task got done. Every task got done.

**What raises a score:**

- I can explain the design and its trade-offs.
- The work is verified past "tests pass": in a real browser, by measurement, or with mutation checks.

**What lowers it:**

- A mistake in that area was found late, or was found by a check rather than by understanding.
- Part of the work is unverified, or exists only on paper.

Each rating names the evidence, so it can be challenged.

**Scale:**

- **9–10:** confident, verified, and I'd make the same choices again.
- **7–8:** solid, but with a mistake or an unverified edge.
- **5–6:** works, but I'd need help to do it again, or it's only designed.
- **≤ 4:** not there yet.

## Ratings

### Day 1: Foundation

| Topic                       | /10 | Evidence                                                                                                                                             |
| --------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1-1 Setup                  | 9   | Strict lint, format and type gates from day one; every later task ran through `npm run check`.                                                       |
| D1-2 HTTP and API contracts | 8   | The contract held all week without breaking changes. But the mock used an MSW 2 option name on MSW 3, which only TypeScript caught (ai-notes).       |
| D1-3 TypeScript             | 9   | No `any`, no `@ts-ignore`; discriminated unions made impossible states unwritable (`RequestState`, `SessionState`). It caught the MSW mistake above. |
| D1-4 Data                   | 9   | One data layer, enforced by ESLint. Swapping the mock for a real API is a config value. Validated responses, one error type.                         |

### Day 2: Browse

| Topic                      | /10 | Evidence                                                                                                                                                           |
| -------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D2-1 Product list          | 8   | Accessible list, skeletons that match the cards, one Tab stop per card. Visual regressions are only checked by eye.                                                |
| D2-2 Filters               | 9   | The URL is the single source of truth, with one canonical form that doubles as the cache key. Refresh, share and Back all work, and they're tested.                |
| D2-3 UI states             | 8   | The same four states everywhere, each triggerable from the QA panel. Lower because the first QA fix assumed aborts reach the Service Worker; they don't.           |
| D2-4 useEffect and cleanup | 8   | Aborts, timers and listeners are all cleaned up, with mutation checks to prove it. I'd still reach for a test before trusting my reading of an effect.             |
| D2-5 Custom hooks          | 9   | `useRequest` carried every page all week and absorbed caching in D3-5 without changes to its callers. Tested on its own.                                           |
| D2-6 Race conditions       | 8   | The design is right: key changes abort, and state resets in the same render. But two of its tests were silently blinded by a D4-1 refactor and only fixed in D4-5. |

### Day 3: Buy

| Topic               | /10 | Evidence                                                                                                                                                                                                      |
| ------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D3-1 Redux Toolkit  | 8   | Small slices with real rules, derived values in selectors, a store factory for tests. I could defend what is _not_ in Redux better than I could tune a large store.                                           |
| D3-2 Cart           | 8   | Stock limits in the reducer, persistence, idempotent checkout, 409 naming each item. Lower because of a test that couldn't fail, and a double-submit guard that read stale state.                             |
| D3-3 Auth           | 6   | Works and is documented, but the first version had two security bugs that looked correct: an open redirect (`/.//evil.test`) and a guard that didn't guard. Both were caught by checks, not by me. **Gap 2.** |
| D3-4 Backend errors | 9   | Every error is classified once and worded once; raw messages are banned by ESLint; an error-matrix test covers every route × status.                                                                          |
| D3-5 Caching        | 8   | Stale-while-revalidate, targeted invalidation, LRU limit, each justified. `forgetProducts` has to know each cached shape, which won't scale past a few.                                                       |

### Day 4: Harden

| Topic                             | /10 | Evidence                                                                                                                                                                                                                              |
| --------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D4-1 Accessibility                | 7   | Lighthouse 100 on the three pages; axe tests; focus management; announced form errors. But no pass with a real screen reader is recorded (it's a manual step in `workflow.md`), and Lighthouse can't hear speech.                     |
| D4-2 Performance                  | 8   | Measured before fixing, interleaved runs, before/after numbers (cards 20% sooner), one idea tried and rejected with data. Only on one fast machine; no real-user numbers.                                                             |
| D4-3 Memoization / virtualization | 7   | Smooth all view, render counts down 95%. But the first memo did nothing, and scroll restore needed two fixes that only a browser could reveal.                                                                                        |
| D4-4 WebSockets                   | 8   | Reconnect with backoff, heartbeat, resubscribe, stops on close, and each is proven. Lower because the client captured `WebSocket` before the mock patched it; real-browser testing caught that.                                       |
| D4-5 Testing                      | 7   | 308 behavior-focused tests, mutation-checked, an audit that found and fixed vacuous tests. But everything runs in jsdom: layout, scrolling and Service Worker bugs were caught by scratch scripts that aren't in the repo. **Gap 1.** |
| D4-6 Git / CI / CD                | 7   | Workflows are written and were run step by step in a clean worktree. Not yet seen on GitHub: CI runs on pull requests into `develop`, and the branch ruleset is a manual step that isn't done yet.                                    |
| D4-7 Monitoring                   | 7   | Two error boundaries, global handlers, one report per error (checked in both builds). Reports go to the console only; nothing is collected from real users yet.                                                                       |

### Day 5: Explain

| Topic                         | /10 | Evidence                                                                                                                                                |
| ----------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D5-1 Architecture             | 8   | Written from the code and checked claim by claim; it found and documented a rule the code didn't follow. I can defend keeping server data out of Redux. |
| D5-2 Design patterns          | 8   | Three patterns with where and why, plus where a pattern is deliberately not used.                                                                       |
| D5-3 Queues / microservices   | 6   | A careful design (outbox, idempotent workers, dead-letter queues), but it's only on paper: nothing in it has been built or run.                         |
| D5-4 Architecture vocabulary  | 8   | Each term is tied to this store, with what it's confused with. Includes a counter-example from the code (two tabs' carts don't converge).               |
| D5-5 Architecture review      | –   | Not rated yet: it needs the review partner's `ARCHITECTURE.md`.                                                                                         |
| D5-6 Code review              | –   | Not rated yet: it needs the partner's pull request.                                                                                                     |
| D5-7 AI workflow and AI notes | 8   | Mistakes logged as they happened (eleven by D5-9), three uses with what was kept and changed, a clear line on what not to hand to AI.                   |
| D5-8 Assessment               | –   | This page.                                                                                                                                              |
| D5-9 Submission               | –   | Not rated yet: the pull request and walkthrough come next.                                                                                              |

**The pattern in the lower scores:**

- **The 7s and the 6s are the same story:** something that passed the tests was wrong in a real browser, under a real attack, or in a real repository.
- **The 9s are the areas where a type, a lint rule or a pure function made the wrong thing impossible to write.**

That's where the two gaps come from.

## Two gaps, and the next step for each

### Gap 1: browser-level behavior is checked by hand, not by tests

- **The evidence:** four of the first ten logged AI mistakes (five bugs in all) involved runtime behavior that jsdom can't reproduce:
  - aborts and the Service Worker
  - the scroll-restore timing, twice
  - a global captured before the mock patched it
  - stale React state between two clicks in one task
- **How they were caught:** each by a throwaway script driving headless Edge, written for that task and kept outside the repository. None of those checks would catch the same bug next month, and none run in CI.
- **The next step:** add **Playwright** to the repository with three end-to-end tests, and run them in CI as a third required job:
  1. **The purchase journey:** search, add, check out, sign in, place the order.
  2. **The all view:** open product #1996, press Back, and land on the same row.
  3. **Live stock:** drop the connection from the QA panel and see it reconnect.

  Those three cover the bugs that only showed up in a browser. A natural follow-up is to run the same tests in Firefox and WebKit, the cross-browser gap in [testing.md](testing.md).

### Gap 2: I can't yet judge security-sensitive code on my own

- **The evidence:** both auth bugs (D3-3) read cleanly and passed the first tests:
  - an open redirect through URL normalization
  - a double-submit guard that couldn't work

  Both came with confident comments describing protections that weren't there, and both were found by mutation testing and a browser probe, not by reading the code. That's also the one thing I wouldn't hand to AI ([ai-notes.md](ai-notes.md)). It only holds if _I_ can do the judging.

- **The next step:** write a **threat model for the sign-in flow** in [auth.md](auth.md):
  - **The threats:** token theft through XSS (the token is in `sessionStorage`), open redirects, CSRF, double submits, and session fixation.
  - **For each one:** the attack in one line, what stops it in this code, and the test that proves it, or "not covered" and why.

  Writing the attack down before checking the defense is the habit that would have found both bugs on my own. It will also show where the app has no defense yet. A Content-Security-Policy, against XSS stealing the token, is the likely first find.

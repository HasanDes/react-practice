# AI Notes

Log of notable AI use during the Bug Bazaar week (required by D5-7: three AI uses with the prompt, what was kept, what was changed and why; one AI mistake and how it was caught; one thing I wouldn't hand to AI).

> Entries are added as the week goes. The final D5-7 write-up picks the three most instructive.

---

## AI mistake: outdated library API (D1-2 → caught in D1-3)

- **What happened:** the D1-2 mock code (AI-written) started MSW with `onUnhandledRequest: "bypass"` in the browser and `"error"` in tests. That option name is from **MSW 2**. MSW 3, the version actually installed, renamed it to `onUnhandledFrame`.
- **Why nobody noticed:** plain JavaScript passes unknown option keys through silently. All 25 tests still passed, and the browser smoke test worked, because the defaults happened to be harmless.
- **How it was caught:** the D1-3 TypeScript migration. `tsc` reported `'onUnhandledRequest' does not exist in type 'StartOptions'`.
- **Impact:** the tests' safety net (fail on any request without a handler) had never been active, and the browser logged warnings instead of quietly bypassing Vite's asset requests.
- **Lesson:** AI suggestions reflect whatever version of a library was most common in its training data, not necessarily the installed one. Check new-major APIs against the installed package (`node_modules/<pkg>/README.md` or its types). Strict types are a cheap way to catch this whole class of mistake.

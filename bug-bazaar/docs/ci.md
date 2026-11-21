# CI/CD

This page explains how every pull request is checked automatically, how a failing check blocks the merge, and how the main line deploys itself. The workflows live at the repository root, in `.github/workflows/`, because the app is in the `bug-bazaar/` subfolder.

## On every pull request: `ci.yml`

It runs on pull requests into `develop` or `master`, on pushes to them, and on demand ("Run workflow").

| Job (the name a required check uses) | Steps                                                                                                                  | Fails when                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Lint, types, tests, build**        | `npm ci` → `npm run lint` → `npm run format:check` → `npm run typecheck` → `npm run test:coverage` → `vite build`      | any lint error, unformatted file, type error, failing test, or broken build |
| **Accessibility (Lighthouse ≥ 90)**  | `npm ci` → `npm run a11y` (builds, serves the build, runs Lighthouse on home, cart and login with the runner's Chrome) | any of the three pages scores below 90                                      |

- **One step per gate:** a red run says _which_ gate failed, not just "check failed".
- **`npm ci`, not `npm install`:** installs exactly what `package-lock.json` says, and fails if the lockfile and `package.json` disagree.
- **Node version from `bug-bazaar/.nvmrc`:** the same version as local development. npm downloads are cached between runs.
- **The coverage report** is uploaded as a run artifact (Actions → the run → Artifacts → `coverage`), even when tests fail.
- **Safety:** the workflow token is read-only (`contents: read`), a new push to the same PR cancels the run it replaces, and each job has a 15-minute timeout.

## A failing test blocks the merge: branch protection

CI reports pass or fail. **Branch protection** is what turns a red check into a blocked merge. It's a repository setting, so it's set once in GitHub's UI (owner or admin):

1. **Settings → Branches → Add branch ruleset** (or "Add classic branch protection rule"). Target branch: **`develop`**. Do the same for `master` if it's used.
2. Turn on **Require a pull request before merging.**
3. Turn on **Require status checks to pass**, and add both checks:
   - `Lint, types, tests, build`
   - `Accessibility (Lighthouse ≥ 90)`

   (Checks can only be picked after the workflow has run once in the repository; pushing the branch and opening a PR does that.)

4. Optional: **Require branches to be up to date before merging.** Checks then run against the latest `develop`, not a stale base.
5. Make sure the rules **apply to administrators too** (no bypass list, or untick "Allow administrators to bypass"). Otherwise the repository owner could still merge a red PR.

### Proving it: the failing-test pull request

The branch `ci-demo/failing-test` is `bug-bazar` plus one commit with a deliberately wrong expectation (`formatPrice(1999)` expected to be `$19.98`):

1. Open a pull request from **`ci-demo/failing-test` into `develop`**.
2. CI runs. **Lint, types, tests, build** turns red at the _Tests_ step: 1 failed, 291 passed. Accessibility stays green.
3. With the rules above, the merge button is disabled: _"Required statuses must pass before merging."_
4. Take a screenshot for the record, then **close the PR without merging**, and delete the branch.

For contrast, the real pull request (`bug-bazar` → `develop`, D5) runs the same checks green and can be merged.

## Deploy the main line automatically (bonus): `deploy.yml`

- **When:** on every push to **`develop`**. In this repository `develop` is the main line: it's the default branch and where pull requests merge. `master` holds older, unrelated exercises.
- **Gate:** it runs `npm run check` first, the same gates as CI, so nothing is deployed that wouldn't pass a pull request.
- **Build:** it builds for GitHub Pages, which serves the site from `/<repository>/`. `VITE_BASE_PATH=/react-practice/` makes the asset paths, the router's `basename`, the mock's image URLs and the Service Worker's location follow that path.
- **Deep links:** it copies `index.html` to `404.html`. Pages has no single-page-app fallback, so this is what lets a link like `/react-practice/products/p-0001` open the app.
- **Publish:** with `actions/deploy-pages`, at `https://<owner>.github.io/react-practice/`.

**One-time setup:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.

**There's no real backend**, so the deployed site runs the mock API in the browser (Service Worker), exactly like `npm run preview`. The QA panel and `bazaarMock` console controls are available there too, which is useful for demos and QA.

**Verified locally:** the `/react-practice/` build, served by `vite preview` and checked in a real browser:

- **Assets:** images load from `/react-practice/images/…`.
- **Routing:** links stay under the subpath, and a reload of a nested route opens the product.
- **Backend:** the mock API and live stock connect.

## Reproducing CI locally

Everything CI runs is an npm script, so a red CI step can be reproduced locally:

```bash
cd bug-bazaar
npm ci
npm run lint && npm run format:check && npm run typecheck && npm run test:coverage && npx vite build
npm run a11y
```

For the highest fidelity, run it in a fresh clone (a git worktree works). That catches files that exist only on your machine. This was done for D4-6: a clean worktree with `npm ci` passed every step.

**Windows note:** Git Bash rewrites values that look like paths, so `VITE_BASE_PATH=/react-practice/` becomes `C:/Program Files/Git/react-practice/`. Prefix the command with `MSYS_NO_PATHCONV=1`. CI runs on Linux and isn't affected.

## When CI is red

| Red step      | Fix locally with                                                    |
| ------------- | ------------------------------------------------------------------- |
| Lint          | `npm run lint:fix`, then fix what remains                           |
| Formatting    | `npm run format`                                                    |
| Type check    | `npm run typecheck`                                                 |
| Tests         | `npm test`, or `npm run test:watch` while fixing                    |
| Build         | `npm run build`                                                     |
| Accessibility | `npm run a11y` prints every failing audit and the elements involved |

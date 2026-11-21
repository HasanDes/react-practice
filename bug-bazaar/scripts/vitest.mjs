// Launches Vitest from a working directory with an upper-case drive letter.
//
// Why: on Windows, a terminal opened at "d:\..." (VS Code often does this)
// makes Vitest load two copies of itself, and every test file fails with
// "Vitest failed to find the runner". Normalizing the cwd before Vitest
// starts avoids it. On macOS/Linux (and CI) this is a plain pass-through.
import { spawnSync } from "node:child_process";
import path from "node:path";

const cwd =
  process.platform === "win32"
    ? process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase())
    : process.cwd();

const bin = path.join(cwd, "node_modules", "vitest", "vitest.mjs");
const { status } = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  cwd,
  stdio: "inherit",
});
process.exit(status ?? 1);

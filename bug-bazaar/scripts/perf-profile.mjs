// D4-2: measure the product list in a real browser. Used for the before/after
// numbers in docs/performance.md.
//
//   npx vite build --minify false --outDir dist-profile   (readable function names)
//   node scripts/perf-profile.mjs [runs=3] [--dir dist-profile]
//
// Starts `vite preview`, launches headless Chrome/Edge with 4x CPU throttling
// and the mock's latency at 0 (so the numbers are our compute, not a fake
// network wait), then runs each scenario `runs` times and prints medians:
//   - time until the result is on screen
//   - long tasks (> 50 ms main-thread blocks) and total blocking time
//   - the slowest interaction (Event Timing, the basis of INP)
//   - the top functions by self time from a CPU profile of the last run

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import * as chromeLauncher from "chrome-launcher";

const args = process.argv.slice(2);
const RUNS = Number(args.find((arg) => /^\d+$/.test(arg)) ?? 3);
const DIR = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : "dist-profile";
const PORT = 4175;
const BASE = `http://localhost:${PORT}`;
const CPU_SLOWDOWN = 4;

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
if (!process.env.CHROME_PATH && process.platform === "win32" && existsSync(EDGE)) {
  process.env.CHROME_PATH = EDGE;
}

// Collected in the page from the very first script.
const OBSERVERS = `
  window.__perf = { longTasks: [], events: [] };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__perf.longTasks.push({ start: e.startTime, duration: e.duration });
  }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (e.interactionId) window.__perf.events.push({ name: e.name, duration: e.duration });
  }).observe({ type: "event", durationThreshold: 16, buffered: true });
`;

async function connect(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result
      ?.result?.value;
  const until = async (expression, timeout = 20_000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return true;
      await sleep(10);
    }
    throw new Error(`timed out waiting for ${expression}`);
  };
  return { ws, send, evaluate, until };
}

/** Self time per function from a CPU profile, top N. */
function topFunctions(profile, n = 12) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i]);
    const { functionName, url } = node.callFrame;
    if (["(idle)", "(program)", "(garbage collector)"].includes(functionName)) continue;
    const file = url.split("/").pop()?.split("?")[0] || "(native)";
    const key = `${functionName || "(anonymous)"} @ ${file}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  return {
    totalMs: Math.round(total),
    top: [...self.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, ms]) => `${ms.toFixed(1).padStart(7)} ms  ${key}`),
  };
}

const CARDS_READY =
  "document.querySelectorAll('.product-card:not(.skeleton-card) a').length >= 24 && !document.querySelector('.results--pending, [aria-busy=true]')";

const SCENARIOS = [
  {
    name: "Cold load of / (navigation → 24 cards on screen)",
    setup: async () => {},
    run: async ({ send, until }) => {
      const start = Date.now();
      await send("Page.navigate", { url: `${BASE}/` });
      await until(CARDS_READY);
      return Date.now() - start;
    },
  },
  {
    name: 'Type "decaf pods" (100 ms between keys → results for it on screen)',
    setup: async ({ send, until }) => {
      await send("Page.navigate", { url: `${BASE}/` });
      await until(CARDS_READY);
      await until(
        "(() => { const s = document.querySelector('input[type=search]'); s.focus(); return document.activeElement === s; })()",
      );
    },
    run: async ({ send, until }) => {
      const start = Date.now();
      for (const char of "decaf pods") {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: char, text: char });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: char });
        await sleep(100);
      }
      await until(
        `new URLSearchParams(location.search).get('search') === 'decaf pods' && ${CARDS_READY.replace(">= 24", ">= 1")}`,
      );
      return Date.now() - start;
    },
  },
  {
    name: "Next page (click → page 2 cards on screen)",
    setup: async ({ send, until }) => {
      await send("Page.navigate", { url: `${BASE}/` });
      await until(CARDS_READY);
    },
    run: async ({ evaluate, until }) => {
      const first = await evaluate("document.querySelector('.product-card a').textContent");
      const start = Date.now();
      await evaluate(
        "[...document.querySelectorAll('nav[aria-label=Pagination] a, nav[aria-label=Pagination] button')].find((e) => /next/i.test(e.textContent + (e.getAttribute('aria-label') ?? ''))).click()",
      );
      await until(
        `document.querySelector('.product-card a')?.textContent !== ${JSON.stringify(first)} && ${CARDS_READY}`,
      );
      return Date.now() - start;
    },
  },
  {
    name: "Sort by price (change → sorted cards on screen)",
    setup: async ({ send, until }) => {
      await send("Page.navigate", { url: `${BASE}/` });
      await until(CARDS_READY);
    },
    run: async ({ evaluate, until }) => {
      const start = Date.now();
      await evaluate(
        "(() => { const s = [...document.querySelectorAll('select')].find((e) => [...e.options].some((o) => o.value === 'price-asc')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'price-asc'); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()",
      );
      await until(
        `new URLSearchParams(location.search).get('sort') === 'price-asc' && ${CARDS_READY}`,
      );
      return Date.now() - start;
    },
  },
];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const preview = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--port",
    String(PORT),
    "--strictPort",
    "--outDir",
    DIR,
  ],
  { stdio: "ignore" },
);
try {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(BASE);
      break;
    } catch {
      await sleep(200);
    }
  }
  console.log(
    `Build: ${DIR} · CPU ${CPU_SLOWDOWN}x slower · mock latency 0 · median of ${RUNS} runs\n`,
  );

  for (const scenario of SCENARIOS) {
    const results = [];
    let profileSummary;
    for (let run = 0; run < RUNS; run++) {
      const chrome = await chromeLauncher.launch({
        chromeFlags: ["--headless=new", "--disable-gpu", "--window-size=1280,900"],
      });
      const page = await connect(chrome.port);
      try {
        await page.send("Page.enable");
        await page.send("Runtime.enable");
        await page.send("Page.addScriptToEvaluateOnNewDocument", { source: OBSERVERS });
        // First visit installs the mock Service Worker and sets latency 0 (persisted).
        await page.send("Page.navigate", { url: `${BASE}/` });
        await page.until("!!window.bazaarMock");
        await page.evaluate(
          "bazaarMock.reset(); bazaarMock.latency(0, 0); localStorage.removeItem('bazaar:cart:v1'); true",
        );
        await page.send("Page.navigate", { url: `${BASE}/` });
        await page.until(CARDS_READY);

        await page.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
        await scenario.setup(page);
        await page.evaluate(
          "window.__perf.longTasks.length = 0; window.__perf.events.length = 0; true",
        );
        const isLast = run === RUNS - 1;
        if (isLast) {
          await page.send("Profiler.enable");
          await page.send("Profiler.setSamplingInterval", { interval: 200 });
          await page.send("Profiler.start");
        }
        const ms = await scenario.run(page);
        await sleep(300); // let trailing tasks land
        if (isLast)
          profileSummary = topFunctions((await page.send("Profiler.stop")).result.profile);
        const perf = await page.evaluate("window.__perf");
        const longTasks = perf?.longTasks ?? [];
        results.push({
          ms,
          longTasks: longTasks.length,
          tbt: Math.round(longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0)),
          worstTask: Math.round(Math.max(0, ...longTasks.map((t) => t.duration))),
          worstInteraction: Math.round(Math.max(0, ...(perf?.events ?? []).map((e) => e.duration))),
        });
      } finally {
        page.ws.close();
        await chrome.kill();
      }
    }
    const pick = (key) => median(results.map((r) => r[key]));
    console.log(`■ ${scenario.name}`);
    console.log(
      `  time ${pick("ms")} ms · long tasks ${pick("longTasks")} · blocking ${pick("tbt")} ms · worst task ${pick("worstTask")} ms · worst interaction ${pick("worstInteraction")} ms`,
    );
    console.log(`  CPU profile (last run, ${profileSummary.totalMs} ms of JS):`);
    for (const line of profileSummary.top) console.log(`    ${line}`);
    console.log("");
  }
} finally {
  preview.kill();
}

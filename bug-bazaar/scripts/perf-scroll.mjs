// D4-3: is scrolling the all-products view (/?view=all, 5,000 items) smooth?
//
//   node scripts/perf-scroll.mjs [runs=5] --dirs dist-a,dist-b
//
// For each build (interleaved, fresh browser per run, 4x CPU, mock latency 0):
//   1. open /?view=all and time the first real product card
//   2. a real scroll gesture through the compositor (40,000 px at 6,000 px/s,
//      about 7 s, roughly 400 products), while recording every frame
// Reports frame times (p50/p95/max, frames over 50 ms), long tasks, DOM size,
// and card renders if the build counts them (window.__cardRenders, only in
// instrumented measurement builds).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import * as chromeLauncher from "chrome-launcher";

const cli = process.argv.slice(2);
const flag = (name) => (cli.includes(name) ? cli[cli.indexOf(name) + 1] : undefined);
const RUNS = Number(cli.find((arg) => /^\d+$/.test(arg)) ?? 5);
const DIRS = (flag("--dirs") ?? "dist").split(",");
const FIRST_PORT = 4180;
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
if (!process.env.CHROME_PATH && process.platform === "win32" && existsSync(EDGE)) {
  process.env.CHROME_PATH = EDGE;
}

const SETUP = `
  if (!localStorage.getItem('bazaar:mock-controls:v1')) {
    localStorage.setItem('bazaar:mock-controls:v1', JSON.stringify({ latencyMs: 0, jitterMs: 0 }));
  }
  window.__perf = { longTasks: [] };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__perf.longTasks.push({ start: e.startTime, duration: e.duration });
  }).observe({ type: 'longtask', buffered: true });
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
  const until = async (expression, timeout = 60_000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return true;
      await sleep(20);
    }
    throw new Error(`timed out waiting for ${expression}`);
  };
  return { ws, send, evaluate, until };
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};
const median = (values) => percentile(values, 50);

async function measure(base) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--disable-gpu", "--window-size=1280,900"],
  });
  const page = await connect(chrome.port);
  try {
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: SETUP });
    // Install the mock Service Worker first (not part of what's measured).
    await page.send("Page.navigate", { url: `${base}/` });
    await page.until("!!window.bazaarMock");
    await page.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    const start = Date.now();
    await page.send("Page.navigate", { url: `${base}/?view=all` });
    await page.until(
      "!!document.querySelector('.product-grid--virtual .product-card:not(.skeleton-card) a')",
    );
    const firstCards = Date.now() - start;
    await sleep(1500); // let the initial render settle (the unvirtualized build has a lot to do)
    const initialLongTasks = await page.evaluate(
      "window.__perf.longTasks.reduce((m, t) => Math.max(m, t.duration), 0)",
    );

    await page.evaluate(`
      window.__perf.longTasks.length = 0;
      window.__cardRenders = 0;
      window.__frames = [];
      window.__maxItems = 0;
      window.__recording = true;
      (function frame(now) {
        window.__frames.push(now);
        window.__maxItems = Math.max(window.__maxItems, document.querySelectorAll('.product-grid--virtual li').length);
        if (window.__recording) requestAnimationFrame(frame);
      })(performance.now());
      true`);
    await page.send("Input.synthesizeScrollGesture", {
      x: 640,
      y: 500,
      yDistance: -40_000,
      speed: 6000,
      gestureSourceType: "mouse",
    });
    await sleep(300);
    const result = await page.evaluate(`(() => {
      window.__recording = false;
      const f = window.__frames;
      const intervals = f.slice(1).map((t, i) => t - f[i]);
      return {
        intervals,
        longTasks: window.__perf.longTasks.length,
        blocking: window.__perf.longTasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0),
        maxItems: window.__maxItems,
        domNodes: document.getElementsByTagName('*').length,
        cardRenders: window.__cardRenders ?? null,
        scrolled: Math.round(window.scrollY),
      };
    })()`);
    return { firstCards, initialLongTasks, ...result };
  } finally {
    page.ws.close();
    await chrome.kill();
  }
}

const previews = DIRS.map((dir, i) =>
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--port",
      String(FIRST_PORT + i),
      "--strictPort",
      "--outDir",
      dir,
    ],
    { stdio: "ignore" },
  ),
);
try {
  for (let i = 0; i < DIRS.length; i++) {
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        await fetch(`http://localhost:${FIRST_PORT + i}`);
        break;
      } catch {
        await sleep(200);
      }
    }
  }
  const runs = DIRS.map(() => []);
  for (let run = 0; run < RUNS; run++) {
    for (let i = 0; i < DIRS.length; i++)
      runs[i].push(await measure(`http://localhost:${FIRST_PORT + i}`));
  }

  console.log(
    `/?view=all (5,000 products) · CPU 4x slower · mock latency 0 · median of ${RUNS} (interleaved)\n`,
  );
  const rows = [
    ["First product card visible (ms)", (r) => r.firstCards],
    ["Longest task while opening (ms)", (r) => r.initialLongTasks],
    ["Scroll: frame time p50 (ms)", (r) => percentile(r.intervals, 50)],
    ["Scroll: frame time p95 (ms)", (r) => percentile(r.intervals, 95)],
    ["Scroll: worst frame (ms)", (r) => Math.max(...r.intervals)],
    ["Scroll: frames over 50 ms", (r) => r.intervals.filter((t) => t > 50).length],
    [
      "Scroll: frames over 33 ms (%)",
      (r) => (100 * r.intervals.filter((t) => t > 33.4).length) / r.intervals.length,
    ],
    ["Scroll: long tasks", (r) => r.longTasks],
    ["Scroll: blocking time (ms)", (r) => r.blocking],
    ["Cards in the DOM (max)", (r) => r.maxItems],
    ["DOM elements after scroll", (r) => r.domNodes],
    ["Card renders during scroll", (r) => r.cardRenders ?? NaN],
    ["Scrolled to (px)", (r) => r.scrolled],
  ];
  console.log(`| Metric | ${DIRS.join(" | ")} |`);
  console.log(`| --- | ${DIRS.map(() => "---").join(" | ")} |`);
  for (const [label, pick] of rows) {
    const cells = runs.map((r) => {
      const value = median(r.map(pick));
      return Number.isNaN(value) ? "n/a" : String(Math.round(value * 10) / 10);
    });
    console.log(`| ${label} | ${cells.join(" | ")} |`);
  }
} finally {
  for (const preview of previews) preview.kill();
}

// D4-2: a truly cold first visit to / (fresh browser profile, empty cache,
// no Service Worker yet), traced, with 4x CPU throttling. Prints when things
// happen and where main-thread time goes. Median of N runs.
//
//   npm run build && node scripts/perf-trace.mjs [runs=5] [--latency ms] [--dirs a,b,c]
//
// --latency sets the mock's response time (default 0: our compute only). A
//   realistic value keeps the loading skeleton on screen longer, which is
//   where its animation cost shows.
// --dirs compares several builds (default: dist). Runs are interleaved
//   (a, b, c, a, b, c, …) so machine-load drift hits every build equally;
//   back-to-back batches drifted by ~100 ms between sessions.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import * as chromeLauncher from "chrome-launcher";

const cli = process.argv.slice(2);
const flag = (name) => (cli.includes(name) ? cli[cli.indexOf(name) + 1] : undefined);
const RUNS = Number(cli.find((arg) => /^\d+$/.test(arg)) ?? 5);
const LATENCY = Number(flag("--latency") ?? 0);
const DIRS = (flag("--dirs") ?? "dist").split(",");
const FIRST_PORT = 4177;
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
if (!process.env.CHROME_PATH && process.platform === "win32" && existsSync(EDGE)) {
  process.env.CHROME_PATH = EDGE;
}

// Timestamps (ms since navigation start) of the moments that matter.
const MARKS = `
  // Fixed mock latency (default 0: the numbers are our compute, not a simulated network wait).
  if (!localStorage.getItem('bazaar:mock-controls:v1')) {
    localStorage.setItem('bazaar:mock-controls:v1', JSON.stringify({ latencyMs: ${LATENCY}, jitterMs: 0 }));
  }
  window.__marks = {};
  const mark = (name) => { if (!(name in window.__marks)) window.__marks[name] = performance.now(); };
  new MutationObserver(() => {
    if (document.querySelector('.site-header')) mark('shell');
    if (document.querySelector('.skeleton-card')) mark('skeleton');
    if (document.querySelector('.product-card:not(.skeleton-card) a')) mark('cards');
  }).observe(document, { childList: true, subtree: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__marks.lcp = e.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  let cls = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) { cls += e.value; window.__marks.cls = cls; }
  }).observe({ type: 'layout-shift', buffered: true });
`;

async function connect(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  let id = 0;
  const pending = new Map();
  const events = [];
  let traceDone;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === "Tracing.dataCollected") events.push(...message.params.value);
    if (message.method === "Tracing.tracingComplete") traceDone?.();
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;
  const stopTrace = async () => {
    const done = new Promise((resolve) => {
      traceDone = resolve;
    });
    await send("Tracing.end");
    await done;
    return events;
  };
  return { ws, send, evaluate, stopTrace };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * Main-thread time by kind, from trace events on the renderer main thread.
 * Also the paint work *while the skeleton is on screen* (between the
 * skeleton and cards marks): that's where a shimmer animation costs.
 */
function breakdown(events, marks) {
  const main = events.find((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain");
  const onMain = events.filter(
    (e) => main && e.pid === main.pid && e.tid === main.tid && e.ph === "X",
  );
  const t0 = Math.min(...onMain.filter((e) => e.ts > 0).map((e) => e.ts));
  const inSkeleton = (e) => {
    const at = (e.ts - t0) / 1000;
    return (
      marks?.skeleton !== undefined &&
      marks?.cards !== undefined &&
      at > marks.skeleton + 20 &&
      at < marks.cards - 20
    );
  };
  const skeletonPaints = onMain.filter((e) => e.name === "Paint" && inSkeleton(e));
  const sum = (names) =>
    onMain
      .filter((e) => names.includes(e.name))
      .reduce((total, e) => total + (e.dur ?? 0) / 1000, 0);
  const count = (names) => onMain.filter((e) => names.includes(e.name)).length;
  return {
    script: sum([
      "EvaluateScript",
      "v8.compile",
      "FunctionCall",
      "TimerFire",
      "EventDispatch",
      "v8.evaluateModule",
      "RunMicrotasks",
    ]),
    style: sum(["UpdateLayoutTree", "RecalculateStyles"]),
    styleCount: count(["UpdateLayoutTree", "RecalculateStyles"]),
    layout: sum(["Layout"]),
    layoutCount: count(["Layout"]),
    paint: sum(["Paint", "PaintImage", "RasterTask", "CompositeLayers", "UpdateLayer"]),
    paintCount: count(["Paint"]),
    skeletonPaintCount: skeletonPaints.length,
    skeletonPaintMs: skeletonPaints.reduce((total, e) => total + (e.dur ?? 0) / 1000, 0),
    skeletonMs:
      marks?.cards !== undefined && marks?.skeleton !== undefined
        ? marks.cards - marks.skeleton
        : NaN,
  };
}

/** One cold, traced visit to `base`. */
async function measure(base) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--disable-gpu", "--window-size=1280,900"],
  });
  const page = await connect(chrome.port);
  try {
    await page.send("Page.enable");
    await page.send("Network.enable");
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: MARKS });
    await page.send("Tracing.start", {
      transferMode: "ReportEvents",
      traceConfig: {
        includedCategories: [
          "devtools.timeline",
          "disabled-by-default-devtools.timeline",
          "v8.execute",
          "blink.user_timing",
        ],
      },
    });
    await page.send("Page.navigate", { url: `${base}/` });
    // 4 s: well past the cards appearing, so steady-state work (e.g. animations) is included.
    await sleep(4000);
    const marks = await page.evaluate("window.__marks");
    const work = breakdown(await page.stopTrace(), marks);
    return { ...marks, ...work };
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
  const rows = DIRS.map(() => []);
  for (let run = 0; run < RUNS; run++) {
    for (let i = 0; i < DIRS.length; i++)
      rows[i].push(await measure(`http://localhost:${FIRST_PORT + i}`));
  }

  console.log(
    `Cold first visit to / · CPU 4x slower · cache disabled · mock latency ${LATENCY} ms · median of ${RUNS} (interleaved)\n`,
  );
  const metrics = [
    ["App shell visible (ms)", "shell"],
    ["Product cards visible (ms)", "cards"],
    ["LCP (ms)", "lcp"],
    ["CLS", "cls"],
    ["Skeleton on screen (ms)", "skeletonMs"],
    ["Paints while skeleton shows", "skeletonPaintCount"],
    ["Paint time while skeleton shows (ms)", "skeletonPaintMs"],
    ["Main thread: script (ms)", "script"],
    ["Main thread: style (ms)", "style"],
    ["Main thread: layout (ms)", "layout"],
    ["Main thread: paint (ms)", "paint"],
    ["Paints in first 4 s", "paintCount"],
  ];
  const cell = (rowsForDir, key) => {
    const value = median(rowsForDir.map((r) => r[key] ?? 0));
    return key === "cls" ? value.toFixed(3) : String(Math.round(value));
  };
  console.log(`| Metric | ${DIRS.join(" | ")} |`);
  console.log(`| --- | ${DIRS.map(() => "---").join(" | ")} |`);
  for (const [label, key] of metrics) {
    console.log(`| ${label} | ${rows.map((r) => cell(r, key)).join(" | ")} |`);
  }
} finally {
  for (const preview of previews) preview.kill();
}

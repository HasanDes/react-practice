// D4-1: Lighthouse accessibility scores for the pages the spec names (home,
// cart, login), against the production build. Fails if any page is below 90.
//
//   npm run a11y            (builds first, then runs this)
//
// Starts `vite preview`, launches Chrome (or Edge on Windows; set CHROME_PATH
// to choose), and prints each page's score plus every failing audit.
// "Cart (with items)" preloads a saved cart into localStorage first, so the
// audit covers the real cart page, not just its empty state.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
const THRESHOLD = 90;

const SAVED_CART = {
  items: [
    {
      productId: "p-0001",
      name: "Decaf Pods #1",
      price: 1299,
      imageUrl: "/images/products/coffee.svg",
      stock: 52,
      quantity: 2,
    },
    {
      productId: "p-0002",
      name: "Mechanical Keyboard #2",
      price: 8999,
      imageUrl: "/images/products/keyboards.svg",
      stock: 10,
      quantity: 1,
    },
  ],
};

const PAGES = [
  { name: "Home", path: "/" },
  { name: "Cart (empty)", path: "/cart" },
  { name: "Cart (with items)", path: "/cart", cart: SAVED_CART },
  { name: "Login", path: "/login" },
];

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
if (!process.env.CHROME_PATH && process.platform === "win32" && existsSync(EDGE)) {
  process.env.CHROME_PATH = EDGE;
}

/** Set localStorage for the app's origin over the DevTools protocol. */
async function setLocalStorage(port, entries) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((target) => target.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  let id = 0;
  const send = (method, params) =>
    new Promise((resolve) => {
      const n = ++id;
      const onMessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id === n) {
          ws.removeEventListener("message", onMessage);
          resolve(message);
        }
      };
      ws.addEventListener("message", onMessage);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send("Page.navigate", { url: `${BASE}/` });
  await sleep(1500);
  const script = Object.entries(entries)
    .map(
      ([key, value]) => `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)});`,
    )
    .join("");
  await send("Runtime.evaluate", { expression: script });
  ws.close();
}

const preview = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--port", String(PORT), "--strictPort"],
  { stdio: "ignore" },
);

let failed = false;
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
    `Lighthouse ${(await import("lighthouse/package.json", { with: { type: "json" } })).default.version} accessibility (threshold ${THRESHOLD})\n`,
  );
  for (const page of PAGES) {
    const chrome = await chromeLauncher.launch({
      chromeFlags: ["--headless=new", "--disable-gpu"],
    });
    try {
      if (page.cart)
        await setLocalStorage(chrome.port, { "bazaar:cart:v1": JSON.stringify(page.cart) });
      const result = await lighthouse(`${BASE}${page.path}`, {
        port: chrome.port,
        onlyCategories: ["accessibility"],
        disableStorageReset: Boolean(page.cart),
        logLevel: "error",
      });
      const lhr = result?.lhr;
      if (!lhr) throw new Error("Lighthouse returned no result");
      const score = Math.round((lhr.categories.accessibility.score ?? 0) * 100);
      const failing = Object.values(lhr.audits).filter(
        (audit) => audit.score === 0 && audit.scoreDisplayMode === "binary",
      );
      if (score < THRESHOLD) failed = true;
      console.log(`${score >= THRESHOLD ? "✔" : "✘"} ${page.name.padEnd(18)} ${score}`);
      for (const audit of failing) {
        const nodes = audit.details?.items?.map((item) => item.node?.snippet).filter(Boolean) ?? [];
        console.log(`    - ${audit.id}: ${audit.title}`);
        for (const snippet of nodes.slice(0, 3)) console.log(`        ${snippet}`);
      }
    } finally {
      await chrome.kill();
    }
  }
} finally {
  preview.kill();
}

process.exitCode = failed ? 1 : 0;

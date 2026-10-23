// Screenshots of the app at phone and desktop sizes, light and dark, saved to ../test-screenshots.
// Usage: node shots.mjs [baseUrl] [prefix]   (default http://127.0.0.1:8000/ and no prefix)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBrowser, SIZES, skipWelcome } from "./browser.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "..", "test-screenshots");
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] || "http://127.0.0.1:8000/";
const PREFIX = process.argv[3] ? process.argv[3] + "-" : "";
const ROUTES = [["today", "#/today"], ["modules", "#/modules"], ["module-C1e", "#/module/C1e"], ["practice", "#/practice"], ["task-C1e-outage", "#/task/C1e-outage"], ["review", "#/review"], ["mock", "#/mock"], ["progress", "#/progress"]];

const { browser, close, version } = await startBrowser();
console.log("browser:", version);
try {
  for (const [sizeName, vp] of Object.entries(SIZES)) {
    for (const scheme of ["light", "dark"]) {
      const page = await browser.newPage();
      await page.setViewport(vp);
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
      await page.goto(BASE, { waitUntil: "networkidle0" });
      await skipWelcome(page);
      for (const [name, hash] of ROUTES) {
        await page.goto(BASE + hash, { waitUntil: "networkidle0" });
        await page.evaluate(() => new Promise(r => setTimeout(r, 150)));
        const file = path.join(OUT, `${PREFIX}${sizeName}-${scheme}-${name}.png`);
        await page.screenshot({ path: file, fullPage: name !== "today" });
        console.log("saved", path.relative(path.resolve(here, ".."), file));
      }
      await page.close();
    }
  }
} finally { await close(); }

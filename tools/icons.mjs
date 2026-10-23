// Renders icons/icon.svg and icons/icon-maskable.svg to the PNG sizes the manifest lists,
// using icons/make-icons.html in headless Edge (it fills window.pngs with base64 PNGs).
// Usage: node icons.mjs [baseUrl]   (default http://127.0.0.1:8000/)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBrowser } from "./browser.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ICONS = path.resolve(here, "..", "icons");
const BASE = process.argv[2] || "http://127.0.0.1:8000/";
const EXPECT = { "icon-192.png": 192, "icon-512.png": 512, "icon-512-maskable.png": 512, "apple-touch-icon.png": 180 };

const { browser, close } = await startBrowser();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
  await page.goto(BASE + "icons/make-icons.html", { waitUntil: "networkidle0" });
  await page.waitForFunction(n => window.pngs && Object.keys(window.pngs).length >= n, { timeout: 20000 }, Object.keys(EXPECT).length);
  const pngs = await page.evaluate(() => window.pngs);
  for (const [name, b64] of Object.entries(pngs)) {
    const buf = Buffer.from(b64, "base64");
    // PNG header: width at bytes 16-19, height at 20-23 (big-endian)
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    fs.writeFileSync(path.join(ICONS, name), buf);
    const ok = w === EXPECT[name] && h === EXPECT[name];
    console.log(`${ok ? "OK  " : "BAD "} ${name}  ${w}x${h}  ${buf.length} bytes`);
    if (!ok) process.exitCode = 1;
  }
} finally { await close(); }

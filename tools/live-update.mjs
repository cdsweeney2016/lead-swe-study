// Verifies the update flow on the live GitHub Pages site end to end:
//   1. opens the live app in headless Edge and waits for the service worker to install,
//   2. bumps VERSION in sw.js, commits and pushes (a real release),
//   3. waits for the Pages build, asks the registration to update,
//   4. expects the "new version is ready" bar, clicks Reload and checks the new shell cache.
// Usage: node live-update.mjs [liveUrl]
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startBrowser, skipWelcome } from "./browser.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const LIVE = process.argv[2] || "https://cdsweeney2016.github.io/lead-swe-study/";
const sh = (cmd) => execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] }).toString().trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const { browser, close } = await startBrowser();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(LIVE, { waitUntil: "networkidle0" });
  await skipWelcome(page); await page.reload({ waitUntil: "networkidle0" });
  const before = await page.evaluate(async () => { await navigator.serviceWorker.ready; return caches.keys(); });
  console.log("installed:", before.join(", "));

  // real release: bump VERSION, commit, push
  const swPath = path.join(ROOT, "sw.js");
  const src = fs.readFileSync(swPath, "utf8");
  const cur = src.match(/const VERSION = "([^"]+)"/)[1];
  const [day, n] = cur.split(/\.(?=\d+$)/);
  const next = `${day}.${Number(n) + 1}`;
  fs.writeFileSync(swPath, src.replace(`const VERSION = "${cur}"`, `const VERSION = "${next}"`));
  sh("git add sw.js");
  sh(`git commit -q -m "Release ${next}: service worker version bump" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`);
  sh("git push -q origin main");
  console.log("pushed VERSION", cur, "->", next);

  // wait for Pages to publish the new sw.js
  let live = "";
  for (let i = 0; i < 60 && !live.includes(next); i++) {
    await sleep(10000);
    try { live = await (await fetch(LIVE + "sw.js", { cache: "no-store" })).text(); } catch {}
    process.stdout.write(".");
  }
  console.log("\nlive sw.js has", live.includes(next) ? next : "OLD VERSION (timed out)");

  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r && r.update()));
  const bar = await page.waitForSelector("#updatebar", { timeout: 30000 }).then(() => true).catch(() => false);
  console.log(bar ? "PASS  update bar appeared on the live site" : "FAIL  no update bar within 30 s");
  if (bar) {
    await page.screenshot({ path: path.join(ROOT, "test-screenshots", "live-phone-update-bar.png") });
    await page.evaluate(() => document.querySelector("#updatebar button").click());
    await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => {});
    await sleep(800);
    const after = await page.evaluate(() => caches.keys());
    const ok = after.some(k => k === "lss-shell-" + next) && !after.some(k => k === "lss-shell-" + cur);
    console.log(ok ? "PASS  new service worker active, old shell cache removed" : "FAIL  caches: " + after.join(", "));
    // after the reload, the page must still work offline with the new worker
    await page.setOfflineMode(true); await page.reload({ waitUntil: "networkidle0" }).catch(() => {});
    const txt = await page.evaluate(() => document.querySelector("main")?.innerText.slice(0, 80) || "");
    console.log(/Today/.test(txt) ? "PASS  offline reload works after update" : "FAIL  offline reload: " + txt);
    await page.setOfflineMode(false);
    if (!ok || !/Today/.test(txt)) process.exitCode = 1;
  } else process.exitCode = 1;
} finally { await close(); }

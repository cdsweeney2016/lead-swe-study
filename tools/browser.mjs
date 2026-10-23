// Shared helper: start the installed Microsoft Edge headless with a DevTools port and connect
// puppeteer-core to it. (puppeteer.launch() fails on this machine because the Edge launcher
// process exits immediately while the real browser keeps running.)
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

const CANDIDATES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let b = ""; res.on("data", d => b += d); res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); }).on("error", reject);
  });
}

export async function startBrowser({ port = 9333 + Math.floor(Math.random() * 500), extraArgs = [] } = {}) {
  const exe = CANDIDATES.find(p => fs.existsSync(p));
  if (!exe) throw new Error("No Edge or Chrome found");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lss-edge-"));
  const args = ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-features=Translate,msEdgeStartupBoost", `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, ...extraArgs, "about:blank"];
  const child = spawn(exe, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  let version;
  for (let i = 0; i < 100; i++) {
    try { version = await getJSON(`http://127.0.0.1:${port}/json/version`); break; } catch { await new Promise(r => setTimeout(r, 200)); }
  }
  if (!version) throw new Error("Edge did not open its DevTools port");
  const browser = await puppeteer.connect({ browserWSEndpoint: version.webSocketDebuggerUrl, defaultViewport: null });
  const close = async () => {
    try { await browser.close(); } catch {}
    // Best effort cleanup of the temporary profile a moment later.
    setTimeout(() => { try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {} }, 1500).unref();
  };
  return { browser, close, version: version.Browser };
}

export const SIZES = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
};

// Seed state so the welcome screen is skipped (same fields freshState() creates).
export async function skipWelcome(page) {
  await page.evaluate(() => {
    const k = "leadSweStudy.v1";
    const s = JSON.parse(localStorage.getItem(k) || "null");
    if (s && s.seenIntro) return;
    const fresh = { v: 1, start: new Date().toISOString().slice(0, 10), ev: {}, passed: {}, starBest: {}, cards: {}, extraCards: [], mistakes: [], stories: [], days: {}, best: {}, newIntro: {} };
    localStorage.setItem(k, JSON.stringify(Object.assign(fresh, s || {}, { seenIntro: true })));
  });
}

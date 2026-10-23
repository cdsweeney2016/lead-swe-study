// End-to-end smoke test for Lead SWE Study. Drives the installed Edge (headless) through
// puppeteer-core at phone (390x844) and desktop (1280x800) sizes:
//   every task type with a passing answer, one deliberate failure (mistakes log), review,
//   mock technical + behavioral rounds, situational STAR form, progress, export/import/reset,
//   dark mode, offline reload (service worker), the update flow (VERSION bump), plain-file mode.
// Usage: node smoke.mjs [baseUrl]   (default http://127.0.0.1:8000/, served from the repo root)
// Screenshots: ../test-screenshots/smoke-<size>-<step>.png. Exit code 1 if any check fails.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBrowser, SIZES, skipWelcome } from "./browser.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const OUT = path.join(ROOT, "test-screenshots");
const DL = path.join(OUT, "_downloads");
fs.mkdirSync(DL, { recursive: true });
const BASE = process.argv[2] || "http://127.0.0.1:8000/";
const LOCAL_SW = BASE.startsWith("http://127.0.0.1") || BASE.startsWith("http://localhost");

const results = [];
let consoleErrors = [];
function check(name, ok, detail = "") { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- passing answers, one per task type ----
const ANSWERS = {
  code: { id: "K2-ts-groupby", value: "type Permit = { id: number; status: 'Open' | 'Approved' | 'Closed' };\n\nfunction groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {\n  const out = {} as Record<K, T[]>;\n  for (const it of items) { const k = key(it); (out[k] ??= []).push(it); }\n  return out;\n}\n" },
  yaml: { id: "A4-yaml-prod", append: "\n  - stage: Deploy_Prod\n    dependsOn: Test\n    jobs:\n      - deployment: DeployWeb\n        environment: production\n        strategy:\n          runOnce:\n            deploy:\n              steps:\n                - script: echo Deploying\n" },
  json: { id: "K7-keyvault", value: '[\n  { "name": "ASPNETCORE_ENVIRONMENT", "value": "Production", "slotSetting": false },\n  { "name": "ConnectionStrings__PermitsDb", "value": "@Microsoft.KeyVault(VaultName=kv-permits-prod;SecretName=PermitsDb)", "slotSetting": false },\n  { "name": "Payments__ApiKey", "value": "@Microsoft.KeyVault(VaultName=kv-permits-prod;SecretName=PaymentsApiKey)", "slotSetting": false }\n]\n' },
  xml: { id: "K8-iis-sni", value: '<site name="Permits" id="3">\n  <application path="/" applicationPool="PermitsPool">\n    <virtualDirectory path="/" physicalPath="D:\\sites\\permits" />\n  </application>\n  <bindings>\n    <binding protocol="http" bindingInformation="*:80:permits.example.com" />\n    <binding protocol="https" bindingInformation="*:443:permits.example.com" sslFlags="1" />\n  </bindings>\n</site>\n' },
  html: { id: "G1-fix-form", value: '<form id="permit">\n  <h2>Apply for a block party permit</h2>\n  <label for="owner">Your name</label>\n  <input type="text" id="owner" name="owner">\n  <label for="street">Street</label>\n  <input type="text" id="street" name="street" required aria-describedby="street-err">\n  <span id="street-err" class="error">Street is required</span>\n  <img src="map.png" alt="Map of the block">\n  <button type="submit">Submit</button>\n</form>\n' },
  cmd: { id: "K4-git-branch", value: 'git switch -c feature/permit-search\ngit add src/PermitSearch.cs\ngit commit -m "Add permit search"\ngit push -u origin feature/permit-search\n' },
  write: { id: "A3-clerk", value: "Hi Maria, the council agenda portal was unavailable today from 9:10 to 10:40 a.m. A security certificate that proves the site is genuine expired, so browsers blocked access. We renewed it and the site has worked normally since 10:40. You don't need to do anything. Agendas posted before the outage were not affected. To prevent this, we are switching to automatic renewal and adding an alert 30 days before any certificate expires. I'm sorry for the disruption before this morning's meeting. If anyone reports problems, please send them to me directly." },
};

async function openTask(page, id) {
  await page.goto(BASE + "#/task/" + id, { waitUntil: "networkidle0" });
  await page.waitForSelector(".submit");
}
async function setText(page, sel, value) {
  await page.evaluate((sel, value) => { const e = document.querySelector(sel); e.value = value; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, sel, value);
}
async function domClick(page, sel) { const ok = await page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel); if (!ok) throw new Error("missing " + sel); }
async function tick(page, sel) { await page.evaluate(sel => { document.querySelectorAll(sel).forEach(e => { e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); }); }, sel); }
async function result(page, timeout = 30000) {
  await page.waitForSelector(".out .result", { timeout });
  return page.evaluate(() => { const r = document.querySelector(".out .result"); return { pass: r.classList.contains("ok"), text: r.innerText.slice(0, 400) }; });
}
async function shot(page, size, name) { const f = path.join(OUT, `smoke-${size}-${name}.png`); await page.screenshot({ path: f, fullPage: true }); return path.relative(ROOT, f); }
async function state(page) { return page.evaluate(() => JSON.parse(localStorage.getItem("leadSweStudy.v1"))); }

async function runTasks(page, size) {
  // mcq (answer index comes from the task data)
  await openTask(page, "M1-star-result");
  const ans = await page.evaluate(() => TASKS.find(t => t.id === "M1-star-result").answer);
  await tick(page, `input[name="o-M1-star-result"][value="${ans}"]`);
  await domClick(page, ".submit"); let r = await result(page);
  check(`${size} mcq passes`, r.pass, r.text.split("\n")[0]); await shot(page, size, "task-mcq");

  // mcq deliberate failure -> mistakes log
  await openTask(page, "M2-bigo");
  const right = await page.evaluate(() => TASKS.find(t => t.id === "M2-bigo").answer);
  await tick(page, `input[name="o-M2-bigo"][value="${right === 0 ? 1 : 0}"]`);
  await domClick(page, ".submit"); r = await result(page);
  check(`${size} mcq wrong answer is marked Not yet`, !r.pass && /Not yet/.test(r.text));
  const st1 = await state(page); check(`${size} failure lands in mistakes log`, st1.mistakes.length >= 1, `${st1.mistakes.length} entries`);

  // pick
  await openTask(page, "K3-review");
  for (const v of ["sql", "select", "catch", "auth"]) await tick(page, `.body input[value="${v}"]`);
  await domClick(page, ".submit"); r = await result(page); check(`${size} pick passes`, r.pass); await shot(page, size, "task-pick");

  // scenario: choose the 3-point option on each step
  await openTask(page, "C1e-outage");
  const steps = await page.evaluate(() => TASKS.find(t => t.id === "C1e-outage").steps.map(s => s.o.findIndex(o => o[1] === 3)));
  for (let i = 0; i < steps.length; i++) {
    await tick(page, `input[name="s-C1e-outage-${i}"][value="${steps[i]}"]`);
    await domClick(page, ".submit"); // shows feedback
    await domClick(page, ".submit"); // next step / finish
  }
  r = await result(page); check(`${size} scenario passes`, r.pass && /100%/.test(r.text)); await shot(page, size, "task-scenario");

  // code (TypeScript via cdnjs + Web Worker)
  await openTask(page, "K2-ts-groupby");
  await setText(page, "textarea.code", ANSWERS.code.value);
  await domClick(page, ".submit"); r = await result(page, 60000);
  check(`${size} code passes (TypeScript compiled, tests run)`, r.pass, r.text.split("\n")[0]); await shot(page, size, "task-code");

  // form
  await openTask(page, "G3-cr");
  await setText(page, "#f-G3-cr-summary", "Deploy permit portal payment page");
  await setText(page, "#f-G3-cr-type", "Normal"); await setText(page, "#f-G3-cr-risk", "Medium");
  await setText(page, "#f-G3-cr-start", "Saturday 22:00");
  await setText(page, "#f-G3-cr-tests", "All pipeline tests green; UAT signed off in staging on Thursday.");
  await setText(page, "#f-G3-cr-steps", "1. Deploy to staging slot. 2. Smoke test payments. 3. Swap slots.");
  await setText(page, "#f-G3-cr-rollback", "If payments fail smoke tests by 23:30, swap the staging slot back (5 minutes) and verify the old page loads.");
  await setText(page, "#f-G3-cr-comms", "Help desk and Finance staff by email Friday; status page during the window.");
  await setText(page, "#f-G3-cr-implementer", "Sam"); await setText(page, "#f-G3-cr-approver", "Jordan");
  await domClick(page, ".submit"); r = await result(page); check(`${size} form passes`, r.pass, r.text.split("\n")[0]); await shot(page, size, "task-form");

  // yaml / json / xml / html editors
  await openTask(page, "A4-yaml-prod");
  const starter = await page.$eval("textarea.code", e => e.value);
  await setText(page, "textarea.code", starter + ANSWERS.yaml.append);
  await domClick(page, ".submit"); r = await result(page); check(`${size} yaml passes`, r.pass, r.text.split("\n")[0]); await shot(page, size, "task-yaml");
  for (const kind of ["json", "xml", "html"]) {
    await openTask(page, ANSWERS[kind].id); await setText(page, "textarea.code", ANSWERS[kind].value);
    await domClick(page, ".submit"); r = await result(page); check(`${size} ${kind} passes`, r.pass, r.text.split("\n")[0]); await shot(page, size, "task-" + kind);
  }

  // cmd
  await openTask(page, "K4-git-branch"); await setText(page, "textarea.code", ANSWERS.cmd.value);
  await domClick(page, ".submit"); r = await result(page); check(`${size} cmd passes`, r.pass, r.text.split("\n")[0]); await shot(page, size, "task-cmd");

  // http
  await openTask(page, "K9-patch");
  await setText(page, "select.hm", "PATCH"); await setText(page, "input.hu", "/api/permits/42");
  await setText(page, "textarea.hh", "Content-Type: application/json"); await setText(page, "textarea.hb", '{"status":"Approved"}');
  await domClick(page, ".submit"); r = await result(page); check(`${size} http passes`, r.pass, r.text.split("\n")[0]); await shot(page, size, "task-http");

  // rest
  await openTask(page, "S1-rest-design");
  const rows = [["GET", "/api/permits?page=2&pageSize=25", "200"], ["GET", "/api/permits/42", "200"], ["POST", "/api/permits", "201"], ["PUT", "/api/permits/42", "200"], ["PATCH", "/api/permits/42", "200"], ["DELETE", "/api/permits/42", "204"], ["GET", "/api/permits/42/inspections", "200"], ["POST", "/api/permits", "409"]];
  for (let i = 0; i < rows.length; i++) { await setText(page, `.rm[data-i="${i}"]`, rows[i][0]); await setText(page, `.rp[data-i="${i}"]`, rows[i][1]); await setText(page, `.rs[data-i="${i}"]`, rows[i][2]); }
  await domClick(page, ".submit"); r = await result(page); check(`${size} rest passes`, r.pass, r.text.split("\n")[0]); await shot(page, size, "task-rest");

  // write (two stages)
  await openTask(page, "A3-clerk"); await setText(page, ".body textarea", ANSWERS.write.value);
  await domClick(page, ".submit"); await page.waitForSelector(".out .result");
  const stage1 = await page.$eval(".out", e => e.innerText);
  check(`${size} write shows automatic checks and model answer`, /Automatic checks/.test(stage1) && /Model answer/.test(stage1));
  await tick(page, "input[data-c]"); await domClick(page, ".submit"); await sleep(200);
  r = await result(page); check(`${size} write passes after self-check`, r.pass, r.text.split("\n")[0]); await shot(page, size, "task-write");

  // hint penalty
  await openTask(page, "K9-patch"); await domClick(page, ".hintbtn");
  const hintText = await page.$eval(".hints", e => e.innerText); check(`${size} hint shows`, /Hint 1/.test(hintText));
  await setText(page, "select.hm", "PATCH"); await setText(page, "input.hu", "/api/permits/42"); await setText(page, "textarea.hh", "Content-Type: application/json"); await setText(page, "textarea.hb", '{"status":"Approved"}');
  await domClick(page, ".submit"); r = await result(page); check(`${size} hint costs 15%`, /score 85%/.test(r.text), r.text.split("\n")[0]);
}

async function runLanguages(page, size) {
  await page.goto(BASE + "#/lang", { waitUntil: "networkidle0" });
  const home = await page.$eval("main", e => e.innerText);
  check(`${size} Languages page lists C#, TypeScript and Angular`, /C#/.test(home) && /TypeScript/.test(home) && /Angular/.test(home) && /Drill: 10 cards/.test(home));
  const info = await page.evaluate(() => ({ dups: LANGS.flatMap(l => langLessons(l).map(x => x.id)).filter((x, i, a) => a.indexOf(x) !== i), badDrill: LANGS.flatMap(l => l.drill.filter(c => !c.accept.some(re => re.test(c.a))).map(c => c.id)), badWrite: LANGS.flatMap(l => langLessons(l).filter(x => x.kind === "write" && !x.accept.every(re => re.test(x.solution))).map(x => x.id)) }));
  check(`${size} language data is self-consistent`, !info.dups.length && !info.badDrill.length && !info.badWrite.length, JSON.stringify(info));
  await shot(page, size, "lang-home");
  // C# predict lesson: type the expected output
  await page.goto(BASE + "#/lang/cs/l/cs-1-1", { waitUntil: "networkidle0" });
  const expect1 = await page.evaluate(() => langFind("cs-1-1").lesson.expect);
  await setText(page, "#lbox textarea", expect1); await domClick(page, "#lbox .submit"); await sleep(200);
  let txt = await page.$eval("main", e => e.innerText);
  check(`${size} C# predict lesson passes with the right output`, /Done 100%/.test(txt) || /Passed/.test(txt));
  await shot(page, size, "lang-cs-predict");
  // C# write lesson: paste the solution
  await page.goto(BASE + "#/lang/cs/l/cs-1-3", { waitUntil: "networkidle0" });
  const sol = await page.evaluate(() => langFind("cs-1-3").lesson.solution);
  await setText(page, "#lbox textarea", sol); await domClick(page, "#lbox .submit"); await sleep(200);
  txt = await page.$eval("main", e => e.innerText); check(`${size} C# write lesson passes with the solution`, /Done 100%/.test(txt) || /Passed/.test(txt));
  // C# mcq
  await page.goto(BASE + "#/lang/cs/l/cs-1-4", { waitUntil: "networkidle0" });
  const ans = await page.evaluate(() => langFind("cs-1-4").lesson.answer);
  await tick(page, `input[name="lq-cs-1-4"][value="${ans}"]`); await domClick(page, "#lbox .submit"); await sleep(200);
  txt = await page.$eval("main", e => e.innerText); check(`${size} language mcq passes`, /Done 100%/.test(txt) || /Passed/.test(txt));
  // TypeScript run lesson: solution must produce the expected output
  await page.goto(BASE + "#/lang/ts/l/ts-1-1", { waitUntil: "networkidle0" });
  const tsol = await page.evaluate(() => langFind("ts-1-1").lesson.solution);
  await setText(page, "#lbox textarea", tsol); await domClick(page, "#lbox .runbtn"); await page.waitForSelector("#lbox .out .term", { timeout: 30000 });
  const runOut = await page.$eval("#lbox .out .term", e => e.innerText); check(`${size} TypeScript Run shows program output`, /permits: 6/.test(runOut));
  await domClick(page, "#lbox .submit"); await page.waitForFunction(() => /Passed|Not yet/.test(document.querySelector("main").innerText), { timeout: 30000 });
  txt = await page.$eval("main", e => e.innerText); check(`${size} TypeScript run lesson passes`, /Passed/.test(txt) || /Done 100%/.test(txt));
  await shot(page, size, "lang-ts-run");
  // TypeScript tests lesson
  await page.goto(BASE + "#/lang/ts/l/ts-2-3", { waitUntil: "networkidle0" });
  const tsol2 = await page.evaluate(() => langFind("ts-2-3").lesson.solution);
  await setText(page, "#lbox textarea", tsol2); await domClick(page, "#lbox .submit"); await page.waitForFunction(() => /Passed|Not yet/.test(document.querySelector("main").innerText), { timeout: 30000 });
  txt = await page.$eval("main", e => e.innerText); check(`${size} TypeScript tests lesson passes`, /Passed/.test(txt) || /Done 100%/.test(txt));
  // Angular signals lesson (harness)
  await page.goto(BASE + "#/lang/ng/l/ng-2-1", { waitUntil: "networkidle0" });
  const nsol = await page.evaluate(() => langFind("ng-2-1").lesson.solution);
  await setText(page, "#lbox textarea", nsol); await domClick(page, "#lbox .submit"); await page.waitForFunction(() => /Passed|Not yet/.test(document.querySelector("main").innerText), { timeout: 30000 });
  txt = await page.$eval("main", e => e.innerText); check(`${size} Angular signals lesson runs on the harness`, /Passed/.test(txt) || /Done 100%/.test(txt), txt.match(/(Passed|Not yet)[^\n]*/)?.[0]);
  // every run/tests solution passes its own check (data integrity, via the worker)
  const allOk = await page.evaluate(async () => {
    const out = [];
    for (const l of LANGS) for (const x of langLessons(l)) {
      if (x.kind !== "run" && x.kind !== "tests") continue;
      const c = await compileTS(x.solution); const h = x.harness === "ng" ? NG_HARNESS : "";
      const flush = "(async()=>{await new Promise(r=>setTimeout(r,60));return true})()";
      const r = await runInWorker(h + c.js, x.kind === "run" ? [flush] : x.tests.map(t => t[1]), 4000);
      const ok = r.ok && (x.kind === "run" ? normOut((r.logs || []).join("\n")) === normOut(x.expect) : r.R.every(t => t[1]));
      if (!ok) out.push(x.id + ":" + (r.error || JSON.stringify(r.R) || (r.logs || []).join("|")));
    }
    return out;
  });
  check(`${size} every TypeScript/Angular solution passes its own lesson`, allOk.length === 0, allOk.join("; "));
  // drill: 10-card session, answer with model answers, one reveal
  await page.goto(BASE + "#/lang/cs/drill/ten", { waitUntil: "networkidle0" });
  for (let i = 0; i < 10; i++) {
    const card = await page.evaluate(() => drill && drill.cards[drill.i] ? { a: drill.cards[drill.i].a } : null);
    if (!card) break;
    if (i === 2) { await domClick(page, "#rev"); } else { await setText(page, "main textarea", card.a); await domClick(page, "#chk"); }
    await page.waitForSelector("#next", { timeout: 5000 }); if (i === 1) await shot(page, size, "lang-drill-card");
    await domClick(page, "#next"); await sleep(80);
  }
  const sum = await page.$eval("main", e => e.innerText);
  check(`${size} drill session reaches a summary with 9 / 10 passed`, /drill: summary/.test(sum) && /9 \/ 10/.test(sum), sum.split("\n").slice(0, 6).join(" | "));
  await shot(page, size, "lang-drill-summary");
  const st = await state(page); check(`${size} drill results and SM-2 state saved`, Object.keys(st.lang.drill).length === 10 && Object.keys(st.lang.sm).length === 10 && Object.keys(st.lang.done).length >= 5);
  await page.goto(BASE + "#/lang/cs", { waitUntil: "networkidle0" });
  const track = await page.$eval("main", e => e.innerText); check(`${size} track page shows progress and drill stats`, /Lessons 3 \/ \d+/.test(track) && /10 seen/.test(track) && /% first try/.test(track));
  await shot(page, size, "lang-track");
}
async function runLessons(page, size) {
  await page.goto(BASE + "#/today", { waitUntil: "networkidle0" });
  const today = await page.$eval("main", e => e.innerText);
  check(`${size} Today shows a lesson step with a time estimate`, /Read today's lesson:/.test(today) && /Study it \(about \d+ min\)/.test(today) && /Lessons this week:/.test(today));
  const n = await page.evaluate(() => ({ lessons: Object.keys(LESSONS).length, items: ITEMS.length, missing: ITEMS.filter(i => !LESSONS[i.id]).map(i => i.id) }));
  check(`${size} every module has a lesson`, n.lessons === n.items && n.missing.length === 0, `${n.lessons}/${n.items}`);
  await page.goto(BASE + "#/learn/K9", { waitUntil: "networkidle0" });
  const text = await page.$eval("main", e => e.innerText);
  check(`${size} lesson page has all sections`, ["What it is", "How it works", "Key terms", "Read these", "Check yourself"].every(h => text.includes(h)));
  const links = await page.$$eval(".tasklist a[target=_blank]", as => as.map(a => a.href));
  check(`${size} lesson links are absolute https URLs`, links.length >= 2 && links.every(h => /^https:\/\//.test(h)), `${links.length} links`);
  await shot(page, size, "lesson-K9");
  await tick(page, "input[data-c]"); await domClick(page, "#markread"); await sleep(200);
  const st = await state(page); const d = st.days[new Date().toISOString().slice(0, 10)] || st.days[Object.keys(st.days).pop()];
  check(`${size} mark as read records the date and the daily step`, !!st.read.K9 && d && d.read >= 1, `read=${st.read.K9}`);
  await page.goto(BASE + "#/module/K9", { waitUntil: "networkidle0" });
  const mod = await page.$eval("main", e => e.innerText);
  check(`${size} module page shows Study card with read pill`, /Study\s*Read \d{4}-\d{2}-\d{2}/.test(mod) && /Open the lesson/.test(mod));
}
async function runReview(page, size) {
  await page.goto(BASE + "#/review", { waitUntil: "networkidle0" });
  const first = await page.$eval("#rv", e => e.innerText);
  check(`${size} review has cards due`, /1 \/ \d+/.test(first), first.split("\n").slice(0, 2).join(" | "));
  for (let i = 0; i < 3; i++) { await domClick(page, ".show"); await page.waitForSelector('.act button[data-q="4"]'); await domClick(page, '.act button[data-q="4"]'); }
  const after = await page.$eval("#rv", e => e.innerText);
  check(`${size} review advances after grading`, /4 \/ \d+/.test(after) || /All done/.test(after), after.split("\n")[0]);
  const st = await state(page); check(`${size} SM-2 state saved for graded cards`, Object.keys(st.cards).length >= 3);
  await shot(page, size, "review");
}

async function runMock(page, size) {
  await page.goto(BASE + "#/mock", { waitUntil: "networkidle0" });
  await shot(page, size, "mock");
  await domClick(page, "#mt"); await page.waitForSelector("#mbox .submit");
  for (let i = 0; i < 8; i++) {
    const info = await page.evaluate(() => ({ type: mockSession.tasks[mockSession.i].type, id: mockSession.tasks[mockSession.i].id, answer: mockSession.tasks[mockSession.i].answer }));
    if (info.type === "mcq") { await tick(page, `input[name="o-${info.id}"][value="${info.answer}"]`); await domClick(page, "#mbox .submit"); }
    else await domClick(page, "#skip");
    await sleep(100);
    if (await page.$("h2") && /results/.test(await page.$eval("h2", e => e.innerText))) break;
  }
  const techText = await page.$eval("main", e => e.innerText);
  const rowCount = await page.$$eval("table tr", rs => rs.length - 1);
  check(`${size} technical round reaches results with 8 rows`, /Technical round: results/.test(techText) && rowCount === 8, `${rowCount} rows`);
  check(`${size} mock mcq answers graded`, /\d+%/.test(techText));
  await shot(page, size, "mock-tech-results");

  // "Done" on the results page must return to the mock menu even though the hash is unchanged
  await domClick(page, "#mockdone"); await sleep(150);
  check(`${size} Done on results returns to the mock menu`, !!(await page.$("#mb")));
  // behavioral round: answer prompt 1, skip the rest
  await page.goto(BASE + "#/today", { waitUntil: "networkidle0" });
  await page.goto(BASE + "#/mock", { waitUntil: "networkidle0" }); await domClick(page, "#mb"); await page.waitForSelector("#mbox textarea");
  const n = await page.evaluate(() => mockSession.prompts.length); check(`${size} behavioral round has 6 prompts, must-ask last`, n === 6 && (await page.evaluate(() => mockSession.prompts[5].always === true)));
  // the first prompt may be behavioral (S,T,A,R) or situational (S,R): fill whatever is present
  await page.evaluate(() => { const v = { S: "Two departments needed the same API change in one sprint.", T: "I owned the schedule.", A: "I brought both to a short call and compared against the deadlines.", R: "Both shipped within two sprints; no escalation." }; document.querySelectorAll("#mbox textarea[data-k]").forEach(e => { e.value = v[e.dataset.k] || "notes"; e.dispatchEvent(new Event("input", { bubbles: true })); }); });
  await tick(page, "input[data-r]"); await domClick(page, ".sv"); await sleep(150);
  for (let i = 0; i < 5; i++) { if (await page.$("#skip")) { await domClick(page, "#skip"); await sleep(80); } }
  const beh = await page.$eval("main", e => e.innerText); check(`${size} behavioral round reaches results`, /Behavioral round: results/.test(beh) && /5\/5/.test(beh));
  await shot(page, size, "mock-beh-results");

  // situational STAR form (two textareas, situational rubric)
  await page.goto(BASE + "#/mock/star-C1-q8", { waitUntil: "networkidle0" });
  const labels = await page.$$eval("#sb textarea", es => es.map(e => e.dataset.k));
  check(`${size} situational form shows Approach + Measure only`, labels.join(",") === "S,R", labels.join(","));
  await setText(page, 'textarea[data-k="S"]', "Meet both leads, agree the goal, run a joint retro, publish decisions."); await setText(page, 'textarea[data-k="R"]', "Rollout success rate and fewer escalations in 90 days.");
  await tick(page, 'input[data-r="0"]'); await tick(page, 'input[data-r="1"]'); await tick(page, 'input[data-r="3"]');
  await shot(page, size, "star-situational"); await domClick(page, ".sv"); await sleep(150);
  const saved = await page.$eval("#sb", e => e.innerText); check(`${size} situational answer saved with 3/5`, /scored 3\/5/.test(saved));
  const st = await state(page); check(`${size} situational story stored with kind`, st.stories.some(s => s.kind === "situational") && st.starBest["C1c"] >= 3);
}

async function runProgress(page, size) {
  await page.goto(BASE + "#/progress", { waitUntil: "networkidle0" });
  const text = await page.$eval("main", e => e.innerText);
  check(`${size} progress shows Ready / 30`, /Posting items Ready\s+\d+ \/ 30/.test(text));
  check(`${size} progress lists mistakes and stories`, /Mistakes log \([1-9]/.test(text) && /Story bank \([1-9]/.test(text));
  check(`${size} coverage grid has competency section`, /Competency: Teamwork and collaboration/.test(text));
  await shot(page, size, "progress");

  // export -> reset -> import
  const client = await page.createCDPSession();
  await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL, eventsEnabled: true });
  for (const f of fs.readdirSync(DL)) fs.rmSync(path.join(DL, f));
  await domClick(page, "#ex");
  let file; for (let i = 0; i < 50 && !file; i++) { await sleep(100); file = fs.readdirSync(DL).find(f => f.endsWith(".json")); }
  check(`${size} export downloads a JSON file`, !!file, file || "none");
  const before = await state(page);
  await domClick(page, "#rs"); await sleep(300);
  const fresh = await state(page); check(`${size} reset clears progress`, fresh.stories.length === 0 && Object.keys(fresh.ev).length === 0);
  if (file) {
    const input = await page.$("#imf");
    await input.uploadFile(path.join(DL, file)); await sleep(500);
    const restored = await state(page);
    check(`${size} import restores progress`, restored.stories.length === before.stories.length && Object.keys(restored.best).length === Object.keys(before.best).length, `${restored.stories.length} stories, ${Object.keys(restored.best).length} task scores`);
  }
}

async function runDark(page, size) {
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await page.goto(BASE + "#/today", { waitUntil: "networkidle0" });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(`${size} dark mode changes body background`, bg && bg !== "rgb(246, 247, 249)", bg);
  await shot(page, size, "dark-today");
  await page.goto(BASE + "#/task/K8-iis-sni", { waitUntil: "networkidle0" }); await shot(page, size, "dark-task");
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
}

async function runOffline(page, size) {
  await page.goto(BASE + "#/today", { waitUntil: "networkidle0" });
  const sw = await page.evaluate(async () => { if (!("serviceWorker" in navigator)) return { supported: false }; const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 8000))]); return { supported: true, active: !!(reg && reg.active), controller: !!navigator.serviceWorker.controller, keys: await caches.keys() }; });
  check(`${size} service worker active with shell cache`, sw.active && sw.keys.some(k => k.startsWith("lss-shell-")), JSON.stringify(sw.keys));
  if (!sw.controller) { await page.reload({ waitUntil: "networkidle0" }); }
  await page.setOfflineMode(true);
  const pill = await page.evaluate(() => new Promise(r => setTimeout(() => r([...document.querySelectorAll("#netpill,#netpill2")].some(p => !p.hidden)), 300)));
  check(`${size} offline pill appears`, pill);
  await page.reload({ waitUntil: "networkidle0" }).catch(() => {});
  const offText = await page.evaluate(() => document.querySelector("main") ? document.querySelector("main").innerText.slice(0, 200) : "");
  check(`${size} app shell loads while offline`, /Today|Welcome/.test(offText), offText.split("\n")[0]);
  await shot(page, size, "offline-today");
  // cdnjs TypeScript cached from the earlier code task -> code task still runs offline
  await page.goto(BASE + "#/task/K2-ts-groupby", { waitUntil: "load" }).catch(() => {});
  await page.waitForSelector(".submit", { timeout: 5000 }).catch(() => {});
  await setText(page, "textarea.code", ANSWERS.code.value); await domClick(page, ".submit");
  const r = await result(page, 30000).catch(() => ({ pass: false, text: "no result" }));
  check(`${size} code task runs offline (compiler cached)`, r.pass, r.text.split("\n")[0]);
  await page.setOfflineMode(false);
}

async function runUpdateFlow(page, size) {
  if (!LOCAL_SW) { console.log("skip update flow (not local)"); return; }
  const swPath = path.join(ROOT, "sw.js"); const orig = fs.readFileSync(swPath, "utf8");
  const bumped = orig.replace(/const VERSION = "([^"]+)"/, (m, v) => `const VERSION = "${v}-smoketest"`);
  fs.writeFileSync(swPath, bumped);
  try {
    await page.goto(BASE + "#/today", { waitUntil: "networkidle0" });
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r && r.update()));
    const bar = await page.waitForSelector("#updatebar", { timeout: 15000 }).then(() => true).catch(() => false);
    check(`${size} update bar appears after VERSION bump`, bar);
    await shot(page, size, "update-bar");
    if (bar) {
      await domClick(page, "#updatebar button");
      await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => {});
      await sleep(500);
      const keys = await page.evaluate(() => caches.keys());
      check(`${size} new service worker took over (new shell cache, old removed)`, keys.some(k => k.includes("smoketest")) && keys.filter(k => k.startsWith("lss-shell-")).length === 1, JSON.stringify(keys));
    }
  } finally {
    fs.writeFileSync(swPath, orig);
    // Let the browser pick the restored version back up so later runs start clean.
    await page.goto(BASE + "#/today", { waitUntil: "networkidle0" }).catch(() => {});
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r && r.update())).catch(() => {});
    await page.waitForSelector("#updatebar", { timeout: 15000 }).then(() => domClick(page, "#updatebar button")).catch(() => {});
    await sleep(800);
  }
}

async function runPlainFile(browser, size) {
  const page = await browser.newPage(); await page.setViewport(SIZES[size]);
  const url = "file:///" + path.join(ROOT, "index.html").replace(/\\/g, "/");
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  await page.goto(url, { waitUntil: "load" }); await skipWelcome(page); await page.reload({ waitUntil: "load" });
  const text = await page.$eval("main", e => e.innerText);
  const ctrl = await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
  check(`${size} plain file mode renders Today without a service worker`, /Today/.test(text) && !ctrl && errs.length === 0, errs.join("; "));
  await page.goto(url + "#/task/M1-star-result", { waitUntil: "load" });
  const ans = await page.evaluate(() => TASKS.find(t => t.id === "M1-star-result").answer);
  await tick(page, `input[name="o-M1-star-result"][value="${ans}"]`); await domClick(page, ".submit");
  const r = await result(page); check(`${size} plain file mode grades a task`, r.pass);
  await shot(page, size, "plain-file");
  await page.close();
}

const { browser, close, version } = await startBrowser();
console.log("browser:", version, "base:", BASE);
try {
  for (const size of ["phone", "desktop"]) {
    const page = await browser.newPage();
    await page.setViewport(SIZES[size]);
    page.on("pageerror", e => consoleErrors.push(`[${size}] pageerror: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" && !/Service worker|sw\.js|favicon/.test(m.text())) consoleErrors.push(`[${size}] console: ${m.text().slice(0, 200)}`); });
    page.on("dialog", d => d.accept().catch(() => {}));
    await page.goto(BASE, { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.clear());
    await skipWelcome(page); await page.reload({ waitUntil: "networkidle0" });
    const today = await page.$eval("main", e => e.innerText);
    check(`${size} Today renders`, /Today/.test(today) && /Review|Task|STAR|prompt/i.test(today));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${size} no horizontal scroll`, overflow <= 0, `${overflow}px`);
    await shot(page, size, "today");
    await runTasks(page, size);
    await runLanguages(page, size);
    await runLessons(page, size);
    await runReview(page, size);
    await runMock(page, size);
    await runProgress(page, size);
    await runDark(page, size);
    if (LOCAL_SW || BASE.startsWith("https://")) { await runOffline(page, size); await runUpdateFlow(page, size); }
    await runPlainFile(browser, size);
    await page.close();
  }
} catch (e) { check("script completed without exceptions", false, e.stack.split("\n").slice(0, 3).join(" | ")); }
finally { await close(); }

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (consoleErrors.length) { console.log("Console / page errors:"); consoleErrors.forEach(e => console.log("  " + e)); }
if (failed.length) { console.log("Failed:"); failed.forEach(f => console.log("  - " + f.name + (f.detail ? "  (" + f.detail + ")" : ""))); }
fs.writeFileSync(path.join(OUT, "smoke-results.json"), JSON.stringify({ when: new Date().toISOString(), base: BASE, browser: version, results, consoleErrors }, null, 1));
process.exit(failed.length ? 1 : 0);

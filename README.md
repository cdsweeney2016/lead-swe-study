# Lead SWE Study

A standalone study tool for a **Lead Software Engineer** role. It uses a real job posting as the example and turns every line of it (30 items: minimum qualifications, knowledge, skills, abilities, preferred qualifications and a teamwork competency) into a module with objectives, free official resources, graded practice, review cards and interview prompts. Four supporting cross-cutting topics (web accessibility, data retention and audit logging, change management, legacy modernization) are included as extra modules.

Live site: https://cdsweeney2016.github.io/lead-swe-study/

It is a plain, professional study tool: no game, no story, no points economy. Real tools are taught by their real names (Azure DevOps, GitHub, TFVC, IIS, Angular, C#, .NET).

## Run it

- Online: open the live site. It installs as an app (Add to Home Screen on iPhone; Install on Android, Windows and macOS) and works offline after the first visit.
- Locally over http (needed for the manifest and offline support):

  ```
  cd lead-swe-study
  python -m http.server 8000
  ```

  then open http://localhost:8000/.
- As a plain file: open `index.html` directly. Everything works except offline caching and install.

There is no build step and no dependency to install. The only network dependency is the TypeScript compiler from cdnjs, used by the code tasks; the service worker caches it after the first use.

## Screens

| Screen | What it does |
| --- | --- |
| Today | A 20-minute session: today's lesson (one of this week's focus items), due review cards, one task from a weak item, one interview prompt, this week's plan. |
| Lesson | Every module has a lesson: what it is, how it works (steps), key terms, exactly what to read (specific pages with a time estimate), and check-yourself questions. "Mark as read" counts toward the daily streak. |
| Modules | One module per posting item and per supporting topic. Lesson, objectives, resources, practice, cards, prompts. |
| Practice | Every graded task, filterable by item and type. "Mixed set" picks from your five weakest items. |
| Review | Spaced repetition (SM-2) over the review cards, plus cards generated from your mistakes. |
| Mock Interview | Technical round (8 graded tasks, 25 minutes) and behavioral round (STAR and situational prompts with a rubric). |
| Progress | Coverage grid, mistakes log, story bank, 14-week plan, export and import. |

An item is **Ready** when mastery is 80 % or more, it has a graded pass, and an interview answer tagged to it scored 3/5 or more. The supporting topics (G1–G4) feed the posting items but do not count toward "Ready / 30".

## Where the data lives

Everything is in `index.html`, in the `DATA` section near the top of the script:

| Constant | Holds |
| --- | --- |
| `R` | Resources: `key: [title, url]`. Free, official sources only. |
| `CORE_ITEMS` | The posting items M1–M2, K1–K10, S1–S3, A1–A4, P1–P5. Shape: `{id, g, t, obj:[...], res:[R keys], sum}`. |
| `COMPETENCIES` | Competencies from the posting (see below). Each one generates its items (`C1a`…), cards, prompts and tasks. |
| `PUBLIC_ITEMS` | Supporting topics G1–G4 (group `Enterprise`) with `supports:[item ids]`. |
| `LESSONS` | One lesson per item id: `{what, how:[steps], terms:[[term, meaning]], read:[[title, url, what to read]], check:[questions]}`. Competency behaviors carry theirs as `behavior.lesson`. The time estimate comes from the "N minutes" notes in `read`. |
| `CORE_CARDS` | Review cards: `[item id, question, answer]`. |
| `CORE_STAR` | Interview prompts: `{id, q, tags:[item ids], kind?: "situational", always?: true}`. |
| `PLAN` | The 14-week plan: `[week, [item ids], read, practice, milestone]`. |
| `TASKS` | Graded practice, added with `T({...})`. Types: mcq, pick, scenario, code, cmd, yaml, json, xml, html, form, http, rest, write. |

`ITEMS`, `CARDS_RAW` and `STAR` are assembled from the core lists plus the competencies, so you normally edit the core lists or `COMPETENCIES`, not the assembled ones.

## How to add a competency

1. Copy the `C1` object in `COMPETENCIES` and give it a new `id` (`C2`), `name` and `summary`.
2. List its **behaviors**: `{id:"a", t:"Title", obj:[...], res:[R keys], sum:"..."}`. Each behavior becomes a module with id `C2a`, `C2b`, … and counts toward Ready.
3. Add **cards** as `["a", question, answer]` (aim for 3 per behavior).
4. Add **prompts**: `{id:"q1", q:"...", tags:["a","A3"]}`. Add `kind:"situational"` for a "what would you do" question and `always:true` for a question that should appear in every behavioral mock round.
5. Add **panel** questions: `{b:"a", q:"...", listen:"what the panel is listening for"}`. They are shown on the behavior's module page and are not graded.
6. Add **practice** tasks using the same shapes as `TASKS` (scenario and write tasks fit best; any type works). Give each a short `id` such as `"a-retro"` and a `ksa` list.

Tag rules inside a competency: a single lowercase letter (`"a"`) means "this competency's behavior"; anything else (`"A3"`, `"K7"`) is a posting item id. Ids are prefixed automatically: `"a-retro"` becomes `C2a-retro`, prompt `"q1"` becomes `C2-q1`.

The Modules page and the Progress grid show one section per competency. Week 14 of the plan picks up every competency behavior. Open the browser console: `selfCheck()` warns about any behavior that lacks 3 cards, 2 prompts or a graded (non-write) task, and about duplicate ids.

## Adding a task

Call `T({...})` in the `TASKS` section. Every task has `id`, `ksa` (item ids, first one is the primary), `type`, `tier` (1–3), `title` and `prompt`. Graded types take `checks` (success) and `constraints` (must hold, otherwise the score caps at 50) as `{l:"label", f:(parsed, raw)=>boolean}`, optional `hints` (−15 % each) and `explain`. Scenarios use `steps:[{q, o:[[text, points 0–3, feedback]]}]`; write tasks use `auto` checks, a `checklist` and a `model` answer.

## Your data

Progress is stored in this browser only, under the `localStorage` key `leadSweStudy.v1`. Use **Export progress** on the Progress page to back it up or move it to another device, and **Import progress** to restore it. Nothing is sent anywhere.

## Files

```
index.html             the whole app (inline CSS and JS)
manifest.webmanifest   PWA manifest (relative paths; scope ./)
sw.js                  service worker (bump VERSION to ship an update)
icons/                 SVG and PNG icons; make-icons.html renders the PNGs
```

To ship an update, change `VERSION` in `sw.js`. Installed copies show a "new version is ready" bar and reload on request.

# R&D Control Tower: POC build plan for Claude Code

A front-end-only working demo of the R&D Control Tower proposal for Amber's R&D team. No backend. Everything runs in the browser on seeded data from Amber's own R&D AC deck (13 Oct 2026), so the demo opens on their real projects, people and numbers.

**How to use this file:** put it in an empty repo with the `seed/` folder and `CLAUDE.md`. Open Claude Code in that folder and run the phases in section 10 one at a time. Each phase has a prompt to paste and a "done when" checklist. Commit after every phase.

---

## 1. What the demo must prove (in 10 minutes)

1. **The head sees only exceptions.** He opens one screen and sees which decisions need him, which team is holding which model, and which projects are red.
2. **Every blocker has an address.** A task waiting on DQA, Electronics or Sourcing becomes a request in that department's queue, with a committed date both sides can see.
3. **Dates never move silently.** Moving a forecast date asks for a reason, and the delay ledger books the lost days to the cause.
4. **Meetings close the loop.** A Teams meeting is scheduled from a stage, the transcript becomes a draft MOM, and the MOM's actions become tasks linked to that stage.
5. **People are reminded without anyone chasing.** The 08:30 digest, assignment mails and escalation mails appear in a simulated Outbox, and advancing the demo clock triggers the escalation rules live.
6. **Adoption is cheap.** An engineer's whole update takes three taps on a phone-sized screen.

The headline line for the presenter: *"These are your 13 Oct numbers. In your deck they were a picture. Here they move."*

---

## 2. Hard constraints

- **No backend, no API keys in the browser.** All data lives in a client-side store, seeded from `seed/*.json` and persisted to `localStorage`.
- A **Reset demo** button restores the seed state instantly. Every demo starts from the same state.
- **Deterministic:** no `Math.random()` at runtime. Generated data uses a seeded PRNG (mulberry32 with a fixed seed), so every reset looks identical.
- **The demo clock, not the wall clock:** all "today" logic reads `demoToday` from the store. The default is `2026-10-13`, the "today" of the deck, so the live counts match the deck.
- **Static hosting:** use `HashRouter` so the build works on Vercel, Netlify, GitHub Pages or a plain folder. `npm run build` must produce a self-contained `dist/`.
- Works at **1440 px desktop** (main presentation) and **390 px phone** (My Day). Light theme only.
- Integrations are **simulated and labelled as simulated** in the UI (small "Simulated" tag): Teams, Outlook, transcripts, AQMS, Teamcenter. Never pretend to call a real service.

---

## 3. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite + React 18 + TypeScript (strict) | Fast, static output |
| Styling | Tailwind CSS with design tokens as CSS variables | Quick, consistent, easy to theme |
| Components | Headless primitives (Radix UI) + own components | Own design language, no stock look |
| State | Zustand with `persist` middleware (localStorage) | Simple global store, survives refresh |
| Routing | React Router (HashRouter) | Static hosting |
| Dates | date-fns | Working-day maths, formatting |
| Charts | Recharts | Ledger and trend charts |
| Icons | lucide-react | Clean line icons |
| Tests | Vitest (rules engine, generator, scheduler); Playwright smoke test | Prove logic and that pages render |
| Fonts | IBM Plex Sans + IBM Plex Mono via @fontsource | Engineering feel, offline-safe |

Don't add a component kit like MUI or Ant Design. The product needs its own look.

---

## 4. Design language

This is enterprise software sold to Amber, so it needs a look of its own. It must not reuse the colours or layout of the existing NPD or EXIM portals, or of the deck mock-ups. Use the deck for content, not for style.

**Concept: "drawing office".** A calm warm-paper canvas, precise lines and monospaced numbers, with one teal accent for "the tower" and one violet that always means "waiting on someone else".

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#F6F5F1` | App background (warm paper) |
| `--surface` | `#FFFFFF` | Cards, tables |
| `--line` | `#E4E1D8` | Borders, dividers |
| `--ink` | `#1B2230` | Primary text |
| `--ink-2` | `#5B6472` | Secondary text |
| `--accent` | `#0E7C7B` | Primary actions, current stage, links |
| `--accent-soft` | `#E3F1F0` | Selected rows, accent backgrounds |
| `--ok` | `#2E7D4F` | On track |
| `--risk` | `#B7791F` | At risk / amber |
| `--late` | `#B42318` | Overdue / red |
| `--wait` | `#6E56CF` | "Waiting on" chips and blocked states (signature colour) |
| `--hold` | `#8A8F98` | On hold |

- **Type:** IBM Plex Sans for UI. IBM Plex Mono for IDs, dates and every number in a table or KPI, so columns align like a drawing title block. Sizes: 13 px body, 12 px table, 20 px page title, 28 px KPI.
- **Shape:** 8 px grid, 10 px card radius, 6 px input radius, 1 px borders, no drop shadows except on popovers.
- **Signature components** (build these first, use them everywhere):
  - `StageRail`: five segments CE / Proto / DV / PP / MP with small gate diamonds between them. Done segments are filled ink, the current one teal, future ones outlined. "On hold" shows hatched grey.
  - `DatePair`: `committed → forecast` in mono, with a slip badge (`+6d` in `--late`, `−2d` in `--ok`) when they differ.
  - `WaitingChip`: a violet pill `⟶ DQA` / `⟶ Electronics` / `⟶ R&D head`. Click opens the linked request.
  - `RagDot`: 8 px dot with a text label for accessibility.
  - `KpiTile`: label, big mono number, optional delta and sparkline.
  - `SimulatedTag`: a tiny outlined tag next to anything that fakes an integration.
- **Layout:** a slim top bar (product name, demo clock, persona switcher, notifications bell, Outbox, Reset) and a left icon rail for navigation. Content is max 1440 px wide.

---

## 5. Repo structure

```
/seed                      ← provided, do not edit by hand
  rd-cycle-template.json   137 activities in 5 stages, from the R&D cycle Excel
  amber-rd-seed.json       teams, people, projects, tasks, requests, decisions, labs, deck KPIs
  demo-meeting-transcript.vtt
/src
  /app                     App shell, routes, layout, providers
  /design                  tokens.css, signature components (StageRail, DatePair, …)
  /domain                  types.ts, scheduler.ts, rules.ts, generator.ts, ledger.ts, mom-extractor.ts
  /store                   zustand store, slices, selectors, persistence, reset
  /sim                     clock.ts, mailer.ts, teams.ts, notifications.ts
  /features
    /tower /team /myday /project /requests /meetings /ledger /labs /outbox /admin
  /lib                     dates (working days), prng, format
/tests                     vitest + playwright
```

---

## 6. Data model and seed

### 6.1 Types (put in `src/domain/types.ts`)

```ts
type StageCode = 'CE' | 'PROTO' | 'DV' | 'PP' | 'MP' | 'TOOLING' | 'INFRA' | 'ON_HOLD';
type Role = 'HEAD' | 'TEAM_LEADER' | 'ENGINEER' | 'DEPT_LEAD';
type Size = 'S' | 'M' | 'L';                    // load points: S=1, M=2, L=4; weekly capacity 10
type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
type Rag = 'green' | 'amber' | 'red';

interface Team { id: string; name: string; kind: 'model' | 'support-rnd' | 'cross-functional' | 'external'; leaderId: string }
interface Person { id: string; name: string; teamId: string; title: string; role: Role; level: 'L1'|'L2'|'L3';
  reportsTo: string | null; email: string }

interface Project { id: string; name: string; teamId: string; customer?: string; note?: string;
  stage: StageCode; onHold: boolean; nextMilestone?: string; nextMilestoneDate?: string; rag: Rag;
  ownerId: string; templateId?: string | null; plan?: PlanActivity[] }   // plan only for instantiated projects

interface PlanActivity { activityId: string; sNo: string; name: string; stage: StageCode; subStage: string;
  kind: string; ownerId?: string; dependencyTeam?: string; plannedDays: number | null;
  baselineStart: string; baselineEnd: string; committedEnd: string; forecastEnd: string;
  actualEnd?: string; status: TaskStatus; requestId?: string }

type WaitingOn = { kind: 'HEAD' } | { kind: 'TEAM' | 'DEPT'; id: string; note?: string } | { kind: 'NOTE'; note: string };

interface Task { id: string; title: string; teamId: string; projectId?: string | null; stage?: StageCode;
  ownerIds: string[]; size: Size; status: TaskStatus; waitingOn?: WaitingOn | null;
  baselineDate: string; committedDate: string; forecastDate: string; doneDate?: string;
  lastUpdatedAt: string; source: 'deck-13-oct' | 'generated' | 'mom' | 'user'; momId?: string }

interface Request { id: string; fromTeamId: string; toId: string; toKind: 'TEAM' | 'DEPT'; title: string;
  blocks: string; projectId?: string | null; taskId?: string; raisedById: string; raisedAt: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'COMMITTED' | 'ACCEPTED' | 'DONE' | 'REJECTED';
  requestedDate?: string; committedDate?: string; plannedTatDays?: number | null;
  comments: Comment[]; history: Event[] }

interface DateChange { id: string; entity: 'task' | 'request' | 'activity'; entityId: string; field: 'forecast' | 'committed';
  from: string; to: string; reasonCode: string; note?: string; attributedTo?: string /* team/dept id */;
  byId: string; at: string }

interface Decision { id: string; teamId: string; title: string; ask: string; raisedById: string;
  kind: 'DECISION' | 'SUPPORT' | 'ESCALATION'; status: 'PENDING' | 'DECIDED' | 'PUSHED_BACK';
  raisedOn: string; outcome?: string }

interface Meeting { id: string; title: string; scope: { projectId?: string; stage?: StageCode; taskId?: string };
  organiserId: string; attendeeIds: string[]; start: string; durationMin: number; recurrence?: 'weekly' | null;
  teamsJoinUrl: string; agenda: AgendaItem[]; status: 'SCHEDULED' | 'ENDED'; transcript?: TranscriptLine[]; momId?: string }

interface Mom { id: string; meetingId: string; status: 'DRAFT' | 'PUBLISHED'; points: string[];
  decisions: { text: string; sourceLine?: number }[];
  actions: { text: string; ownerId?: string; dueDate?: string; sourceLine?: number; taskId?: string }[];
  publishedAt?: string }

interface Email { id: string; at: string; toIds: string[]; ccIds?: string[]; subject: string; html: string;
  kind: 'DIGEST' | 'ASSIGNMENT' | 'REMINDER' | 'ESCALATION' | 'MOM' | 'INVITE' | 'WEEKLY';
  relatedId?: string; replied?: 'DONE' | 'NEW_DATE' }

interface Exception { id: string; ruleId: 'R1'|'R2'|'R3'|'R4'|'R5'|'R6'; entityId: string; teamId: string;
  title: string; detail: string; since: string; routedToId: string /* leader or head */ }
```

### 6.2 Loading the seed

- `meta.heroStory` in the seed describes the demo's main thread: task `tsk-011` (Jatin, MHI 15K3S DV closure) is blocked by request `req-001` (to DQA, raised 12 Oct, still open, 5-day TAT).
- `amber-rd-seed.json` holds the items the deck names: 73 people (the R&D head, 7 R&D teams, and placeholder leads for Sourcing, DQA, Plant PPC, Stores, Costing, Cycle team, Supplier, Customer and Management), 60 projects, 57 named tasks, 33 cross-team requests, 22 decisions waiting on the head, psy-lab utilisation, reason codes, escalation rules, and `deckKpis` per team.
- Seed emails are fake (`*.demo@example.com`). Keep them fake.
- **Top-up generator** (`generator.ts`): the deck's totals are bigger than the named items. For each team, generate filler tasks so the live counts equal `deckKpis` for `openItems`, `overdue`, `dueThisWeek` and `waitingOnOthers`, measured at `demoToday = 2026-10-13`. Rules:
  - Count definitions (use the same selectors everywhere): **open** = not DONE; **overdue** = open and `forecastDate < demoToday`; **due this week** = open, not overdue, `forecastDate` from `demoToday` up to that week's Sunday; **waiting on others** = open with `waitingOn.kind` TEAM or DEPT.
  - Filler titles come from template activity names applied to that team's projects (for example "Proto testing balancing, Psy lab · Amber CBU 18K 3S 10-pole").
  - Spread overdue filler across people in proportion to `person.deckOverdue`.
  - People with `deckNoTasksLogged: true` get **no** tasks. That is the deck's adoption point and must stay visible as "no tasks logged".
  - Use the seeded PRNG. Write a Vitest test asserting that every team's counts equal `deckKpis` after generation.
- `lastUpdatedAt` for seed tasks: a deterministic 0–20 days before `demoToday`, so a few trip rule R4 (not updated for 14 days).

### 6.3 One fully instantiated showcase project

Instantiate the 137-activity template for **"MHI 2028 BEE line-up (5 models)"** (`prj-rac-01`), so the project workspace has real depth:

- Schedule backwards from DV closure on 2026-10-30. Stage windows use the template's stage days (CE 75, Proto 105, DV 66, PP 34, MP 4). Inside a stage, activities run in template order, sized by `plannedDays`; a null TAT counts as 1 day.
- CE and Proto are done. Give about 15% of their activities late actual dates, with reason codes, so the ledger has history. Book most of the late days to Electronics and Sourcing, which matches the deck's pattern.
- DV is in progress. Activity 3.7.9 "DV machine software validation & closer" is linked to request `req-001` (DQA, MHI 15K3S software validation) and shows **blocked → DQA**. That is the hero of the demo story.
- PP and MP are not started.
- Other projects keep only their summary (stage, milestone, RAG) plus their tasks. Add an "Instantiate plan from template" button on any project to show that this works for every model.

---

## 7. Simulated services (`src/sim`)

| Service | Behaviour |
| --- | --- |
| **Demo clock** | `demoToday` plus time of day. Top-bar control with `+1 day`, `+1 week`, `Run 08:30` and a date picker. Every advance re-runs the rules engine, generates the emails due in that window and adds notifications. Weekends are skipped for working-day maths. |
| **Mailer / Outbox** | Builds HTML emails from templates and stores them in `emails[]`. The Outbox page looks like a mail client: list on the left, rendered email on the right. Digest and assignment emails have **Reply "Done"** and **Reply with new date** buttons that update the task, which demonstrates reply-to-update. |
| **Teams** | Scheduling creates a `Meeting` with a fake join URL (`https://teams.microsoft.com/l/meetup-join/DEMO-<id>`), an INVITE email to the attendees, and an agenda. Tagged Simulated. |
| **Transcript** | On a scheduled meeting, **Simulate: meeting ended** parses `seed/demo-meeting-transcript.vtt` (or a generic fallback transcript) into `TranscriptLine[]` with speaker, timestamp and text. |
| **MOM extractor** | Deterministic, rule-based, no LLM: a line containing `Decision` becomes a decision; lines with `Action for <X>:` or `Action:` become actions. The owner is mapped from role words to people (R&D Head → the head, RAC → the RAC leader, Sourcing → the Sourcing lead, and so on). Dates like "Monday the 19th" or "by Tuesday the 20th" are resolved against the meeting date. Each extracted row keeps `sourceLine`, so clicking it highlights the transcript line. The UI labels this "Draft MOM, generated from transcript: review before publishing". |
| **Notifications** | In-app feed per persona (bell with count): assignments, requests received, commitments, escalations, MOM published. |

On the transcript sample, the extractor must produce at least: decision *"Electronics releases the final 15K3S build to DQA by Monday the 19th"*, plus actions for the R&D head (Megmeet escalation), Sourcing (PO terms by 20 Oct) and RAC (Thailand dispatch date by Monday). Write a Vitest test for exactly that.

---

## 8. Rules engine (`src/domain/rules.ts`)

A pure function `evaluate(state, demoToday) → Exception[]`, unit-tested. The thresholds come from `state.settings`, editable in Admin.

| Rule | Condition | Routed to |
| --- | --- | --- |
| R1 | `forecast − committed > 7` calendar days | Team leader; if the project is red, also the head |
| R2 | Task's forecast is later than its project's `nextMilestoneDate` | Project owner, then the head |
| R3 | `waitingOn.kind === 'HEAD'`, or a pending decision | Head |
| R4 | `demoToday − lastUpdatedAt ≥ 14` days and not done | Owner, then team leader after 3 more days |
| R5 | Person's open load above 120% of capacity in each of the last 2 weeks | Team leader, then the head |
| R6 | Request still `OPEN` more than 2 working days after `raisedAt` | Receiving department lead |

**Propagation:** when a request linked to a task or activity gets a committed date later than that item's forecast, the item's forecast moves to the request date + 1 working day. A `DateChange` is logged with reason `WAITING_DEPT`, attributed to the department the *request's own* change blamed (if DQA blamed Electronics, Electronics gets the days). The same applies when an activity moves past a dependent activity.

The head's **Exceptions inbox** shows only items routed to the head (R3, plus R1/R2/R5 when escalated). Clearing an exception requires an action: decide, reassign, push back with a note, escalate, or accept a new date. Every action is logged.

---

## 9. Screens and routes

A persona switcher in the top bar changes who you are. The demo personas: **Mahender Kumar (R&D head)**, **Satbir Singh (RAC team leader)**, **Jatin Sharma (RAC engineer)**, **Dhiraj Gupta (Electronics software lead)**, **DQA Lead** and **Sourcing Lead**. Each persona lands on its own home screen.

| Route | Who | What it shows | Done when |
| --- | --- | --- | --- |
| `#/tower` | Head | KPI strip (open, overdue, due this week, waiting on others, needs head, projects at red) with totals and a per-team breakdown on hover. Portfolio board: a column per stage with project cards (RAG, next milestone, `DatePair`). Exceptions inbox with one-tap actions. Department blocker heatmap (receiving team or department × age bucket 0–7 / 8–14 / 15–30 / 30+ days). Load per person (top 10). On-time trend per team from the ledger. | At 13 Oct: open 206, overdue 42, due this week 59, waiting on others 91, projects at red 16, all matching the deck. "Needs head" is derived (pending decisions + tasks waiting on the head) and reads close to the deck's 25. Deciding an exception removes it and logs it. |
| `#/team/:teamId` | Team leader | Same building blocks as the deck pages, in the new design language: KPI strip, project table with `StageRail`, team to-do with Today / This week / This month / All open tabs, team load bars including "no tasks logged", Waiting on other teams, Goes to head. | Each team's counts equal `deckKpis`. Switching tabs filters correctly. |
| `#/my-day` | Engineer | Overdue / Today / This week list. Three-tap actions: ✓ Done, ↷ Move forecast (opens the reason sheet), ⚑ Waiting on… (pick a person, team, department or head). Quick add in one line. A **phone frame** toggle renders it at 390 px inside a device outline, for presenting on a laptop. | Moving a forecast without a reason is impossible. The update shows on the team and tower screens immediately. |
| `#/projects` and `#/projects/:id` | All | List with filters (team, stage, RAG, customer). Project header with `StageRail`, customer, next milestone, owner. Tabs: **Plan** (activities grouped by sub-stage: planned and actual TAT, owner, dependency team, status, `WaitingChip`); **Timeline** (Gantt with a baseline bar and a forecast bar, today line, gate diamonds); **Requests**; **Meetings & MOM**; **Ledger**; **Gate checklist** (deliverables BOM / NPL-CPL, CCL, DFMEA, FFR checklist, test reports, production guideline, AQMS upload link, approver sign-off; a stage cannot close until all are ticked). | The showcase project shows CE/Proto done, DV in progress, and 3.7.9 blocked → DQA. "Close stage" stays disabled until the checklist is complete. |
| `#/requests` | All | **Incoming** queue for a department or support team, and **Outgoing** for model teams. Detail drawer: acknowledge, commit date, R&D owner accepts or counters, comments, history. Raising a request from a task or activity pre-fills the planned TAT from the template. | As DQA Lead: acknowledge and commit `req-001`; as Jatin: accept; the activity and task show the agreed date. |
| `#/meetings` and `#/meetings/:id` | All | Week calendar and list. Schedule dialog: title, scope (project / stage / task), attendees, date, time, weekly recurrence. Detail page: auto agenda, join link (Simulated), **Simulate: meeting ended**, transcript viewer with speaker lanes, draft MOM editor, **Publish MOM**. | Publishing creates tasks with owners and dates linked to the stage, emails the MOM to attendees in the Outbox, and lists the MOM on the project's Meetings & MOM tab. |
| `#/ledger` | Head, leaders | Days lost by reason code (bar chart), days lost by department, planned vs actual TAT per department, a filterable table of every date change. | After the demo story, the extra days appear booked to Electronics. |
| `#/labs` | Lab, head | Psy-lab utilisation and loss hours (Sep), October plan per lab, a simple week × lab booking grid tied to test activities. | Booking a slot on a test activity shows on that project. |
| `#/outbox` | Presenter | Every simulated email, filterable by kind and person. | The digest for Jatin at 08:30 on 13 Oct lists his real overdue items. |
| `#/admin` | Admin | Template viewer (5 stages, sub-stages, 137 activities with TATs, owner role and dependency team; editable TAT), rule thresholds, reason codes, and a user master table (name, email, role, level, reports to, team), mirroring the attached user master's pattern. | Changing the R1 threshold from 7 to 3 days immediately adds exceptions to the tower. |

---

## 10. Build phases (paste one prompt per Claude Code session)

Start each phase in plan mode, review the plan, then let it build. End each phase with `npm run build`, `npm test` and a commit.

**Phase 0: Scaffold and design system**
> Read CLAUDE.md and POC_BUILD_PLAN.md (sections 2–5). Scaffold a Vite + React + TS strict project with Tailwind, Zustand, React Router (HashRouter), date-fns, Recharts, lucide-react, Radix primitives, Vitest and Playwright. Implement the design tokens from section 4 as CSS variables, load IBM Plex Sans and Mono via @fontsource, and build the signature components: StageRail, DatePair, WaitingChip, RagDot, KpiTile and SimulatedTag. Add a /#/styleguide page showing each component in every state.

Done when: the styleguide renders every component, the build passes, and nothing looks like a stock component kit.

**Phase 1: Domain, seed and rules engine**
> Implement section 6 and section 8. Types in src/domain/types.ts; seed loader for seed/*.json; seeded PRNG; the top-up generator that matches deckKpis; scheduler.ts that instantiates the template for a project; instantiate the showcase project as described in 6.3; rules.ts; and the Zustand store with persistence and resetDemo(). Write Vitest tests: per-team counts equal deckKpis at 2026-10-13; each rule R1–R6 fires on a crafted case and not on a near miss; the scheduler gives 137 activities with valid dates; the generator is deterministic across two runs.

Done when: all tests pass. No UI yet beyond a debug JSON page.

**Phase 2: Shell, personas, clock and the Control Tower**
> Build the app shell from section 4 (top bar with product name, demo clock, persona switcher, bell, Outbox link, Reset demo; left icon rail). Implement the demo clock controls from section 7. Build #/tower as specified in section 9, including one-tap actions on the exceptions inbox, with every action logged.

Done when: as Mahender at 13 Oct, open / overdue / due this week / waiting / at red equal 206 / 42 / 59 / 91 / 16; deciding an exception removes it; Reset restores everything.

**Phase 3: Team dashboard and My Day**
> Build #/team/:teamId and #/my-day from section 9, including the reason sheet for forecast moves (reason codes from the seed; attribution defaults to the waiting-on team or department), quick add, Waiting on… picker and the phone frame toggle. All writes go through store actions that append to the ledger and update lastUpdatedAt.

Done when: as Jatin, moving "MHI 15K3S: DV closure" by 6 days with reason "Waiting on another department → DQA" updates his list, the RAC team page and the tower, and fires R1 if over the threshold.

**Phase 4: Project workspace**
> Build #/projects and #/projects/:id with the Plan, Timeline, Requests, Meetings & MOM, Ledger and Gate checklist tabs from section 9. Add "Instantiate plan from template" for any project without a plan. Gantt: baseline bar, forecast bar, today line, gate diamonds; group by stage, collapsible sub-stages.

Done when: the showcase project reads correctly and Close stage stays disabled until the checklist is complete.

**Phase 5: Requests desk and delay ledger**
> Build #/requests (incoming and outgoing queues, detail drawer, acknowledge → commit → accept or counter flow, comments, history) and raise-request from any task or activity, pre-filling the planned TAT. Build #/ledger with the charts and table from section 9. Rule R6 must fire for unacknowledged requests as the clock advances.

Done when: the full req-001 flow works across the DQA Lead and Jatin personas, and the activity 3.7.9 chip and dates update.

**Phase 6: Meetings, transcript and MOM**
> Build #/meetings and #/meetings/:id per sections 7 and 9: schedule dialog, auto agenda (overdue, blocked and open requests in scope), simulated Teams link and invite email, "Simulate: meeting ended" loading seed/demo-meeting-transcript.vtt, transcript viewer, the deterministic MOM extractor with source-line linking, the editable draft, and Publish creating tasks, an MOM record and emails. Add the Vitest test from section 7.

Done when: the transcript produces the expected decision and three actions, and publishing creates linked tasks visible on the project and in each owner's My Day.

**Phase 7: Outbox, notifications and escalations over time**
> Build #/outbox and the notifications bell. Generate emails for: assignment, request received or committed, the 08:30 digest per person with open items (working days), the due-in-2-days reminder, escalations from the rules engine, MOM published, and the Monday weekly summary. Add Reply "Done" / Reply with new date on digest and assignment emails. Advancing the clock must produce the right emails exactly once (keep a sent-log keyed by rule + entity + date).

Done when: going from 13 Oct to 20 Oct with +1 day clicks produces digests each working day, the escalations appear once, and the replies update tasks.

**Phase 8: Admin, labs, polish and deploy**
> Build #/admin and #/labs from section 9. Add a "Demo script" side panel (section 11 steps with deep links) toggled from the top bar. Empty states, loading skeletons, keyboard focus states, number formatting, and the 390 px layout for My Day. Write a Playwright smoke test that visits every route as each persona with no console errors and saves screenshots to /tests/screens. Add a README with run, build and deploy steps (Vercel or Netlify, static).

Done when: the smoke test passes, the screenshots look right, and `dist/` deploys as static files.

Typical effort with Claude Code: 3–5 working days, depending on how much polish the showcase needs.

---

## 11. Demo script (about 10 minutes)

1. **Mahender, Control Tower, 13 Oct.** "These are your 13 Oct numbers: 206 open, 42 overdue, 91 waiting on other teams." Point at the blocker heatmap: Electronics is holding the most.
2. **Open the Exceptions inbox.** Decide "K-series CFF development" with a one-line note. It disappears and is logged.
3. **Switch to Satbir (RAC leader).** The team page shows the same layout as the deck page he knows, now live. Point at "no tasks logged" for three people.
4. **Switch to Jatin, phone frame on.** "MHI 15K3S: DV closure" (committed Fri 16 Oct) shows `⟶ DQA`; its request `req-001` was raised yesterday and is not yet acknowledged. Then show how cheap a new blocker is: flag "Hitachi WAC grill lock modification" as Waiting on → Plant PPC in three taps, which creates a request in Plant PPC's queue.
5. **Switch to DQA Lead.** `req-001` is in her queue with its 5-day planned TAT. Commit Thursday 15 Oct. Back as Jatin, accept.
6. **Advance the clock to Thursday 15 Oct.** As DQA, move the commitment to Tuesday 20 Oct with reason "Waiting on another department → Electronics". As Jatin, the DV closure forecast moves to 21 Oct on its own (propagation, section 8).
7. **Advance to Friday 16 Oct and schedule the weekly cross-functional review** from the DV stage of MHI 2028. Show the auto agenda and the Simulated Teams link. Click "Simulate: meeting ended", then "Draft MOM". The decision and three actions appear, linked to transcript lines. Publish.
8. **Open the Outbox.** Show the MOM email, the 08:30 digest with Reply "Done", and the invite.
9. **Advance the clock to Tuesday 20 Oct.** The Electronics action is still open. As Jatin, move DV closure to 2 Nov with reason "Waiting on another department → Electronics". It now lands after the project's mother milestone (DV closures, 30 Oct), so R2 puts it in Mahender's inbox with the full trail: who, which dates, which meeting decided what.
10. **Open the Ledger.** The lost days are booked to Electronics, not DQA. Close with: "Nobody made a phone call in this story."

---

## 12. Out of scope for the POC

Real authentication, real Microsoft Graph / Outlook / Teams calls, real LLM calls, AQMS / Teamcenter / SAP integration, multi-user sync, file uploads beyond names, role-based security, audit export, and mobile apps. Mention them as phase items from the proposal when asked.

## 13. Quality bar

- TypeScript strict, no `any` in domain code.
- Domain logic is pure and lives in `src/domain`; UI components never compute rules themselves.
- No console errors on any route; the Playwright smoke test is the gate.
- Every number on screen is derived from the store, never hard-coded, except the seed values themselves.
- Readable at 1440 px from the back of a meeting room: KPI numbers at least 28 px, table text at least 12 px.

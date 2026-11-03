# Contracts for screen agents

Front-end demo only: every click must visibly change the screen. Reuse what exists; the simplest state change that works is fine.

## Folder ownership (edit only your own folder)
| Agent | Owns |
|---|---|
| Team + My Day | `src/features/team/`, `src/features/myday/` |
| Projects | `src/features/project/` (ProjectsPage, ProjectPage) |
| Requests + Ledger | `src/features/requests/`, `src/features/ledger/` |
| Meetings + Outbox | `src/features/meetings/`, `src/features/outbox/`, `src/domain/mom-extractor.ts`, `src/sim/teams.ts` |

Shared (ask before changing, keep edits additive): `src/store/*`, `src/sim/{mailer,notifications,clock}.ts`, `src/app/*`, `src/design/*`, `src/domain/types.ts`.

## Routes (all inside the shell, `src/app/App.tsx`)
`#/tower` · `#/team/:teamId` · `#/my-day` · `#/projects` · `#/projects/:id` · `#/requests` (query `?id=req-001`, `?to=electronics`) · `#/meetings` · `#/meetings/:id` · `#/outbox` · `#/ledger`.
Persona homes are in `src/app/personas.ts`. Use `PageHeader` from `src/app/Shell.tsx` as the first element of every page (it renders the `h1`); `Avatar` is there too.

## Store (`src/store/store.ts`, `useStore`)
State: `demoToday`, `currentPersonId`, `teams`, `people`, `projects` (plan on `prj-rac-01`), `tasks`, `requests`, `decisions`, `dateChanges`, `reasonCodes`, `settings`, `actionLog`, `meetings[]`, `moms[]`, `emails[]`, `notifications[]`, `clearedExceptions`.
Actions: `createTask`, `updateTask`, `completeTask`, `moveForecast(entity, id, date, reasonCode, note?, attributedTo?)` (refuses without reason; activity id = `${projectId}:${activityId}`), `setWaitingOn(taskId, {kind:'TEAM'|'DEPT', id} | {kind:'HEAD'} | null)` (raises a request), `createRequest`, `acknowledgeRequest`, `commitRequest(id, date, reason?, note?, attributedTo?)` (propagates to task/activity), `acceptRequest`, `counterRequest`, `commentRequest`, `decideDecision`, `decideException`, `notify`, `sendEmail`, `markNotificationsRead`, `logAction`, `setPersona`, `resetDemo`.
For meetings/MOMs there is no action yet: add yours with `useStore.setState((s) => ({ meetings: [...s.meetings, m] }))`; ids like `` `mtg-${s.meetings.length + 1}` ``.
Already emailed automatically: assignment (createTask for someone else), request raised, request committed/re-committed, head decisions, new escalations on clock moves, the 08:30 digest.

## Selectors (`src/store/selectors.ts`)
Hooks: `useKpis(teamId?)`, `useExceptions()`. Functions: `selectTasks(s, 'open'|'overdue'|'dueThisWeek'|'waiting', teamId?)`, `selectKpis`, `selectHeadInbox`, `selectMyTasks`, `blockerHeatmap(requests, today, fromTeamId?)`, `topLoad(s, limit, teamId?)`, `isRequestLive`, `shortTeam(name)`.
Selectors return new arrays: wrap in `useMemo` over raw `useStore((s) => s.tasks)` slices, never `useStore(selectX)`.
Domain: `src/domain/metrics.ts` (counts), `rules.ts` (`evaluate`, `headId`, `leaderOf`), `ledger.ts` (`daysLostByReason`, `daysLostByDepartment`, `plannedVsActualTat`, `onTimeTrend`), `seed.ts` (`HERO_TASK_ID`, `HERO_REQUEST_ID`, `HERO_ACTIVITY_ID`, `SHOWCASE_PROJECT_ID`, `template`). Dates: `src/lib/dates.ts` (`fmtShort`, `fmtDay`, `addWorkingDays`, ...).

## Simulated services
- `sendEmail({ kind, toIds, ccIds?, subject, html, relatedId?, at? })` from `src/sim/mailer.ts` → `emails[]`. Kinds: DIGEST, ASSIGNMENT, REQUEST, COMMITMENT, REMINDER, ESCALATION, MOM, INVITE, WEEKLY. Digest items are `<li data-task="tsk-…">` (for Reply "Done").
- `notify(personId, text, link?, kind = 'INFO')` from `src/sim/notifications.ts` → bell. `link` is a route like `/requests?id=req-001`.
- `src/sim/clock.ts`: `setDate`, `advanceDays`, `run0830` (top bar uses them).

## Design (`src/design/index.tsx`)
`StageRail`, `DatePair`, `WaitingChip`, `RagDot`, `KpiTile`, `SimulatedTag`, `cx`. Classes: `card`, `num`, tokens `text-ink-2`, `bg-accent`, `bg-wait-soft`, `text-late`, `rounded-input`, `shadow-popover`, `text-title|table|kpi`. Radix primitives and lucide icons are installed. Anything Teams/Outlook/transcript shows `<SimulatedTag />`. Design at 1440 px; no new tests needed.

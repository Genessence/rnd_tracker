# R&D Control Tower: clickable demo

A front-end-only demo of the R&D Control Tower for Amber's R&D team. It runs entirely in the browser on seed data taken from the R&D AC deck of 13 Oct 2026. There is no backend and there are no network calls. Every click changes state in the browser, saved to `localStorage`.

## Run and build

Requires Node 22.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check, then write static files to dist/
npm run preview    # serve dist/ locally
npm test           # Vitest: seed counts, rules engine, scheduler
```

## Deploy

`npm run build` produces a self-contained `dist/` folder. It uses relative asset paths and hash routing (`#/tower`), so it works from any static host or subfolder without rewrite rules:

- **Netlify:** drag `dist/` onto app.netlify.com/drop, or set build command `npm run build` and publish directory `dist`.
- **Vercel:** framework preset "Vite", output directory `dist`.
- **GitHub Pages, S3, an intranet share:** copy the contents of `dist/` as they are.

## Personas

Use the persona switcher in the top bar. Each persona opens on its own home screen.

| Persona | Role | Home |
| --- | --- | --- |
| Mahender Kumar | R&D head | Control Tower `#/tower` |
| Satbir Singh | RAC team leader | Team page `#/team/rac` |
| Jatin Sharma | RAC engineer | My Day `#/my-day` (phone frame toggle) |
| Dhiraj Gupta | Electronics software lead | Requests `#/requests` |
| DQA Lead | Department lead | Requests (Incoming) |
| Sourcing Lead | Department lead | Requests (Incoming) |

The demo clock in the top bar (`+1 day`, `+1 week`, date picker, `Run 08:30`) drives all "today" logic. **Reset demo** restores the 13 Oct seed state.

## Demo script (about 10 minutes)

Click **Demo script** in the top bar. The panel lists these steps, and each button sets the persona, the clock and the screen. Start from **Reset demo**; the steps build on each other.

1. **Mahender, Control Tower, 13 Oct.** "These are your 13 Oct numbers": 206 open, 42 overdue, 91 waiting on other teams. The blocker heatmap shows Electronics holding the most.
2. **Exceptions inbox.** Decide "K-series CFF development" with a one-line note. It disappears and shows under "Recently cleared · logged".
3. **Satbir (RAC leader).** The team page has the same building blocks as his deck page, now live. Three people show "no tasks logged".
4. **Jatin, phone frame on.** "MHI 15K3S: DV closure" (committed 16 Oct) shows `⟶ DQA` with req-001, not acknowledged. Flag "Hitachi WAC grill lock modification" as ⚑ Waiting on… → Plant PPC. That raises a request in Plant PPC's queue and emails its lead.
5. **DQA Lead.** Open req-001 (5-day TAT), Acknowledge, Commit 15 Oct. Then, as Jatin, Accept.
6. **Clock to Thu 15 Oct.** As DQA, use Move commitment to set Tue 20 Oct, reason "Waiting on another department", booked to Electronics. Jatin's DV closure forecast moves to 21 Oct on its own.
7. **Clock to Fri 16 Oct.** On the MHI 2028 project plan, click Schedule meeting on the DV stage. Schedule & send invite shows the auto agenda and the Simulated Teams link. Then click Simulate: meeting ended, Draft MOM (one decision and three actions, each linked to its transcript line), and Publish MOM.
8. **Outbox.** Show the MOM email, an 08:30 digest with Reply "Done", and the invite.
9. **Clock to Tue 20 Oct.** The Electronics action is still open. As Jatin, use ↷ Move on DV closure: 2 Nov, "Waiting on another department" → Electronics. R2 puts it in Mahender's inbox with the trail: who moved which dates, and which meeting decided what.
10. **Delay ledger** ("Since 13 Oct"). The lost days are booked to Electronics, not DQA. "Nobody made a phone call in this story."

## Team leader workflow (start of a project)

As **Satbir Singh (RAC team leader)**, the Team page and the Projects list show team-leader actions:
- **New project** starts the stage-gate workflow: the R&D cycle template (CE → Proto → DV → PP → MP, 137 activities) is scheduled from the start date and assigned to the leader and the engineers picked. Engineers are emailed.
- **Add task** gives an engineer a task (project, stage, due date, size). It appears on their My Day with an assignment email.
- **Raise request** sends a request to another department or R&D team and assigns the engineer who follows it up; the engineer gets a linked task showing ⟶ that department. On the project Plan, each activity has **+ Task** and **Request**, and its owner can be reassigned.

## What is simulated

Everything. This is a demo of the workflow, not a working system.

- **All data.** People, projects, tasks, requests and decisions come from `seed/` (from the 13 Oct deck), plus deterministic filler so the counts match the deck. Email addresses are fake (`*.demo@example.com`).
- **Microsoft Teams.** Join links are fake (`https://teams.microsoft.com/l/meetup-join/DEMO-…`); no meeting is created.
- **Outlook.** Every email lands in the in-app Outbox only. Nothing is sent. Replies are buttons inside the Outbox.
- **Meeting transcript.** "Simulate: meeting ended" loads the fixed sample `seed/demo-meeting-transcript.vtt`. The MOM is drafted by simple rules, not by AI.
- **AQMS / Teamcenter.** These are referred to by name only; there is no integration.
- **Users and login.** The persona switcher stands in for sign-in; there is no security.

Each simulated integration carries a "Simulated" tag on screen.

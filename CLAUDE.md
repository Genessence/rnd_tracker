# R&D Control Tower POC

Front-end-only demo of an R&D project and stage-gate tracker for Amber's R&D team. The full spec is in `POC_BUILD_PLAN.md`; read the relevant sections before each phase.

## Rules
- No backend, no network calls, no API keys. All state in a Zustand store persisted to localStorage, with a working "Reset demo".
- "Today" is always `demoToday` from the store (default 2026-10-13), never `new Date()` in domain logic.
- Deterministic: no Math.random at runtime; use the seeded PRNG in src/lib/prng.ts.
- HashRouter only. `npm run build` must produce static files that work from any host.
- Domain logic (rules, scheduler, generator, ledger, MOM extractor) is pure TypeScript in src/domain with Vitest tests. UI never computes rules itself.
- Do not edit files in /seed by hand. Derive everything else from them.
- Use the design tokens and signature components in src/design. No stock component kits (MUI, Ant, etc.). Light theme only. Do not copy the colours or layout of the deck mock-ups or of other client portals.
- Anything that fakes an integration (Teams, Outlook, transcripts, AQMS, Teamcenter) shows a SimulatedTag.
- Seed emails are fake (*.demo@example.com); keep them fake.

## Commands
- `npm run dev`, `npm run build`, `npm test` (Vitest), `npx playwright test` (smoke).
- Before finishing any phase: build passes, tests pass, then commit.

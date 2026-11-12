// Stage gate: the checklist for a project's current stage and what "Go" moves it to. Pure.
import { RAIL_STAGES, type PlanActivity, type Project, type RailStage } from './types';

/** Gate deliverables = the stage's sign-off and documentation activities in the template (CE signoff, FFR, DV signed off, ...). */
export const isGateItem = (a: PlanActivity) => a.kind === 'approval' || a.kind === 'documentation';

export function gateChecklist(p: Project) {
  const items = (p.plan ?? []).filter((a) => a.stage === p.stage && isGateItem(a));
  const done = items.filter((a) => a.status === 'DONE').length;
  return { items, done, total: items.length, ready: items.length > 0 && done === items.length };
}

export const nextStage = (stage: string): RailStage | null => {
  const i = RAIL_STAGES.indexOf(stage as RailStage);
  return i >= 0 && i < RAIL_STAGES.length - 1 ? RAIL_STAGES[i + 1] : null;
};

/** Project after a "Go": next stage, its closure as the next milestone (from the plan), off hold. Last stage closes the project. */
export function advanceStage(p: Project): Project {
  const next = nextStage(p.stage);
  if (!next) return { ...p, onHold: false, nextMilestone: 'Project closed', nextMilestoneDate: null };
  const end = (p.plan ?? []).filter((a) => a.stage === next).reduce((m, a) => (a.committedEnd > m ? a.committedEnd : m), '');
  const label = next === 'PROTO' ? 'Proto' : next;
  return { ...p, stage: next, onHold: false, nextMilestone: `${label} closure`, nextMilestoneDate: end || p.nextMilestoneDate };
}

/** Readiness chips from plan activities that already exist (no separate module): samples, parts, BOM, customer approval. */
const READY: { key: string; match: (a: PlanActivity) => boolean }[] = [
  { key: 'Samples', match: (a) => /sample/i.test(a.name) },
  { key: 'Parts & material', match: (a) => a.kind === 'material' && !/sample/i.test(a.name) },
  { key: 'BOM', match: (a) => /\bBOM\b/i.test(a.name) },
  { key: 'Customer approval', match: (a) => /customer/i.test(a.name) },
];
export type Readiness = { key: string; done: number; total: number; status: 'ready' | 'late' | 'pending'; next?: PlanActivity };
export function readiness(p: Project, today: string): Readiness[] {
  return READY.map(({ key, match }) => {
    const items = (p.plan ?? []).filter(match);
    const open = items.filter((a) => a.status !== 'DONE').sort((a, b) => a.forecastEnd.localeCompare(b.forecastEnd));
    const status: Readiness['status'] = !open.length ? 'ready' : open.some((a) => a.forecastEnd < today) ? 'late' : 'pending';
    return { key, done: items.length - open.length, total: items.length, status, next: open[0] };
  }).filter((r) => r.total > 0);
}

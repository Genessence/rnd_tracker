// Instantiates the R&D cycle template into a dated plan (plan section 6.3). Pure.
import { addWorkingDays, isWorkingDay, nextWorkingDay } from '../lib/dates';
import { RAIL_STAGES, type PlanActivity, type Project, type RailStage, type StageCode, type Template } from './types';

/** Template dependency-team labels -> team / department ids in the seed. */
const DEPENDENCY_MAP: [RegExp, string][] = [
  [/dqa/i, 'dqa'],
  [/plant/i, 'plant-ppc'],
  [/electronics/i, 'electronics'],
  [/purchase|sourcing/i, 'sourcing'],
  [/supplier/i, 'supplier'],
  [/lab/i, 'lab'],
  [/store/i, 'stores'],
  [/costing/i, 'costing'],
  [/management/i, 'management'],
  [/structure/i, 'structure'],
  [/customer/i, 'customer'],
];
export const mapDependencyTeam = (label: string | null): string | undefined =>
  label ? DEPENDENCY_MAP.find(([re]) => re.test(label))?.[1] : undefined;

export interface PlanOwners {
  leaderId: string;
  inchargeId: string;
  memberIds: string[]; // "Team member" activities rotate across these
  sourcingId?: string;
}

function ownerFor(responsibility: string | null, owners: PlanOwners, i: number): string {
  const r = (responsibility ?? '').toLowerCase();
  if (r.startsWith('team leader')) return owners.leaderId;
  if (r.startsWith('team member') && owners.memberIds.length) return owners.memberIds[i % owners.memberIds.length];
  if (r.startsWith('purchase') && owners.sourcingId) return owners.sourcingId;
  return owners.inchargeId;
}

export const isRailStage = (s: StageCode): s is RailStage => (RAIL_STAGES as readonly string[]).includes(s);

/**
 * Lays the template out backwards/forwards from the end date of the anchor stage. Stage windows use the
 * template's stage days (working days). Inside a stage, activities run in template order, sized in proportion
 * to plannedDays (null counts as 1) so they exactly fill the window.
 */
export function scheduleTemplate(
  template: Template,
  anchor: { stage: RailStage; endDate: string },
  owners: PlanOwners,
): PlanActivity[] {
  const stages = template.stages;
  const ai = stages.findIndex((s) => s.code === anchor.stage);
  const windows: { start: string; end: string }[] = new Array(stages.length);
  const anchorEnd = isWorkingDay(anchor.endDate) ? anchor.endDate : addWorkingDays(anchor.endDate, -1);
  windows[ai] = { start: addWorkingDays(anchorEnd, -(stages[ai].plannedDays - 1)), end: anchorEnd };
  for (let i = ai - 1; i >= 0; i--) {
    const end = addWorkingDays(windows[i + 1].start, -1);
    windows[i] = { start: addWorkingDays(end, -(stages[i].plannedDays - 1)), end };
  }
  for (let i = ai + 1; i < stages.length; i++) {
    const start = addWorkingDays(windows[i - 1].end, 1);
    windows[i] = { start, end: addWorkingDays(start, stages[i].plannedDays - 1) };
  }

  const plan: PlanActivity[] = [];
  let memberTurn = 0;
  stages.forEach((stage, si) => {
    const { start } = windows[si];
    const W = stage.plannedDays;
    const acts = stage.subStages.flatMap((ss) => ss.activities.map((a) => ({ a, subStage: ss.name })));
    const total = acts.reduce((s, { a }) => s + (a.plannedDays ?? 1), 0);
    let cum = 0;
    for (const { a, subStage } of acts) {
      const startIdx = Math.floor((cum * W) / total);
      cum += a.plannedDays ?? 1;
      const endIdx = Math.max(startIdx, Math.ceil((cum * W) / total) - 1);
      const end = addWorkingDays(start, endIdx);
      if ((a.responsibility ?? '').toLowerCase().startsWith('team member')) memberTurn++;
      plan.push({
        activityId: a.id,
        sNo: a.sNo,
        name: a.name.replace(/\s+/g, ' ').trim(),
        stage: stage.code,
        subStage: subStage.replace(/\s+/g, ' ').trim(),
        kind: a.kind,
        ownerId: ownerFor(a.responsibility, owners, memberTurn),
        dependencyTeam: mapDependencyTeam(a.dependencyTeam),
        plannedDays: a.plannedDays,
        baselineStart: addWorkingDays(start, startIdx),
        baselineEnd: end,
        committedEnd: end,
        forecastEnd: end,
        status: 'OPEN',
      });
    }
  });
  return plan;
}

/**
 * Marks progress as of today: stages before the current one are DONE, the current stage's activities that
 * ended before today are DONE (except its final sign-off), the one spanning today is IN_PROGRESS.
 */
export function applyProgress(plan: PlanActivity[], currentStage: RailStage, today: string): PlanActivity[] {
  const ci = RAIL_STAGES.indexOf(currentStage);
  const lastOfCurrent = plan.filter((a) => a.stage === currentStage).at(-1)?.activityId;
  return plan.map((a) => {
    const si = RAIL_STAGES.indexOf(a.stage as RailStage);
    if (si < ci) return { ...a, status: 'DONE', actualEnd: a.baselineEnd };
    if (si > ci) return a;
    if (a.baselineEnd < today && a.activityId !== lastOfCurrent)
      return { ...a, status: 'DONE', actualEnd: a.baselineEnd };
    if (a.baselineStart <= today && a.baselineEnd >= today) return { ...a, status: 'IN_PROGRESS' };
    return a;
  });
}

/** "Instantiate plan from template" for any project: anchors its current stage on the next milestone. */
export function instantiatePlan(
  template: Template,
  project: Project,
  owners: PlanOwners,
  today: string,
): PlanActivity[] {
  const stage: RailStage = isRailStage(project.stage) ? project.stage : 'CE';
  const days = template.stages.find((s) => s.code === stage)!.plannedDays;
  const endDate = project.nextMilestoneDate ?? addWorkingDays(nextWorkingDay(today), days);
  return applyProgress(scheduleTemplate(template, { stage, endDate }, owners), stage, today);
}

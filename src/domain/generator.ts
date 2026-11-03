// Top-up generator (plan section 6.2): filler tasks so each team's live counts equal deckKpis at demoToday.
import { addDays, addWorkingDays, weekEnd, workingDaysBetween } from '../lib/dates';
import { pick, randInt, type Rng } from '../lib/prng';
import { countTasks, isOverdue } from './metrics';
import { isRailStage } from './scheduler';
import type { DateChange, DeckKpi, Person, Project, Request, Size, Task, Template } from './types';

export interface GeneratorInput {
  today: string;
  deckKpis: Record<string, DeckKpi>;
  people: Person[];
  projects: Project[];
  tasks: Task[]; // seed tasks
  template: Template;
}

export interface GeneratorOutput {
  tasks: Task[]; // filler only (open + done history)
  requests: Request[]; // one per waiting filler task, so every blocker has an address
  dateChanges: DateChange[]; // late done-history tasks
}

// Who model teams wait on; Electronics holds the most (deck pattern). Self is filtered out.
const WAIT_TARGETS: [string, 'TEAM' | 'DEPT'][] = [
  ['electronics', 'TEAM'], ['electronics', 'TEAM'], ['electronics', 'TEAM'], ['electronics', 'TEAM'], ['electronics', 'TEAM'],
  ['supplier', 'DEPT'], ['supplier', 'DEPT'], ['sourcing', 'DEPT'], ['sourcing', 'DEPT'], ['dqa', 'DEPT'], ['dqa', 'DEPT'],
  ['plant-ppc', 'DEPT'], ['structure', 'TEAM'], ['lab', 'TEAM'], ['customer', 'DEPT'], ['cycle', 'DEPT'],
];
const LATE_BLAME = ['electronics', 'electronics', 'electronics', 'sourcing', 'sourcing', 'supplier', 'dqa', 'lab'];
const LATE_REASON: Record<string, string> = {
  electronics: 'WAITING_DEPT', sourcing: 'SUPPLIER', supplier: 'SUPPLIER', dqa: 'WAITING_DEPT', lab: 'LAB_SLOT',
};
const DONE_HISTORY_PER_TEAM = 10;

const size = (rng: Rng): Size => {
  const r = rng();
  return r < 0.6 ? 'S' : r < 0.9 ? 'M' : 'L';
};

/** Largest-remainder apportionment of n across weights (all-zero weights -> equal split). */
function apportion(n: number, weights: number[]): number[] {
  const w = weights.some((x) => x > 0) ? weights : weights.map(() => 1);
  const sum = w.reduce((a, b) => a + b, 0);
  const raw = w.map((x) => (x * n) / sum);
  const out = raw.map(Math.floor);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < n - out.reduce((a, b) => a + b, 0); k++) out[order[k][1]]++;
  return out;
}

function shuffled<T>(rng: Rng, items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateFiller(input: GeneratorInput, rng: Rng): GeneratorOutput {
  const { today, deckKpis, people, projects, tasks, template } = input;
  const allActs = template.stages.flatMap((s) =>
    s.subStages.flatMap((ss) => ss.activities.map((a) => ({ stage: s.code, name: a.name.replace(/\s+/g, ' ').trim() }))),
  );
  const fri = addDays(weekEnd(today), -2);
  const out: GeneratorOutput = { tasks: [], requests: [], dateChanges: [] };

  /** Title from a template activity applied to one of the team's projects; linked only if it would not trip R2. */
  const titleFor = (teamId: string, forecast: string) => {
    const teamProjects = projects.filter((p) => p.teamId === teamId);
    const project = pick(rng, teamProjects);
    const pool = isRailStage(project.stage) ? allActs.filter((a) => a.stage === project.stage) : allActs;
    const act = pick(rng, pool);
    const linkable = !project.onHold && (!project.nextMilestoneDate || forecast <= project.nextMilestoneDate);
    return {
      title: `${act.name} · ${project.name}`,
      projectId: linkable ? project.id : null,
      stage: linkable && isRailStage(project.stage) ? project.stage : undefined,
    };
  };

  for (const [teamId, kpi] of Object.entries(deckKpis)) {
    const c = countTasks(tasks, today, teamId);
    const need = {
      open: kpi.openItems - c.open,
      overdue: kpi.overdue - c.overdue,
      due: kpi.dueThisWeek - c.dueThisWeek,
      waiting: kpi.waitingOnOthers - c.waiting,
    };
    if (Object.values(need).some((n) => n < 0) || need.overdue + need.due > need.open || need.waiting > need.open)
      throw new Error(`Seed tasks for ${teamId} exceed deckKpis; cannot top up`);

    const eligible = people.filter((p) => p.teamId === teamId && !p.deckNoTasksLogged && p.role !== 'DEPT_LEAD');
    if (!eligible.length) throw new Error(`No eligible owners in ${teamId}`);
    const leaderId = eligible.find((p) => p.role === 'TEAM_LEADER')?.id ?? eligible[0].id;

    // Overdue filler owners: proportional to what each person's deck overdue still lacks.
    const seedOverdue = (pid: string) =>
      tasks.filter((t) => t.teamId === teamId && t.ownerIds.includes(pid) && isOverdue(t, today)).length;
    const lack = eligible.map((p) => Math.max(0, (p.deckOverdue ?? 0) - seedOverdue(p.id)));
    const weights = lack.some((x) => x > 0) ? lack : eligible.map((p) => p.deckOverdue ?? 0);
    const overdueOwners = apportion(need.overdue, weights).flatMap((n, i) => Array<string>(n).fill(eligible[i].id));

    const slots: { kind: 'overdue' | 'due' | 'later'; ownerId: string }[] = [
      ...overdueOwners.map((ownerId) => ({ kind: 'overdue' as const, ownerId })),
      ...Array.from({ length: need.due }, () => ({ kind: 'due' as const, ownerId: pick(rng, eligible).id })),
      ...Array.from({ length: need.open - need.overdue - need.due }, () => ({
        kind: 'later' as const,
        ownerId: pick(rng, eligible).id,
      })),
    ];
    const waitingIdx = new Set(shuffled(rng, slots.map((_, i) => i)).slice(0, need.waiting));
    const targets = WAIT_TARGETS.filter(([id]) => id !== teamId);

    slots.forEach((slot, i) => {
      const forecast =
        slot.kind === 'overdue'
          ? addWorkingDays(today, -randInt(rng, 1, 30))
          : slot.kind === 'due'
            ? addWorkingDays(today, randInt(rng, 0, Math.max(0, workingDaysBetween(today, fri))))
            : addWorkingDays(weekEnd(today), randInt(rng, 1, 30));
      const committed = rng() < 0.2 ? addDays(forecast, -randInt(rng, 1, 6)) : forecast;
      const id = `gen-${teamId}-${String(i + 1).padStart(3, '0')}`;
      const t: Task = {
        id,
        ...titleFor(teamId, forecast),
        teamId,
        ownerIds: [slot.ownerId],
        size: size(rng),
        status: 'OPEN',
        waitingOn: null,
        baselineDate: committed,
        committedDate: committed,
        forecastDate: forecast,
        lastUpdatedAt: addDays(today, -randInt(rng, 0, 13)), // filler never trips R4 on its own
        source: 'generated',
      };
      if (waitingIdx.has(i)) {
        const [toId, toKind] = pick(rng, targets);
        const reqId = `req-${id}`;
        const acked = rng() < 0.5;
        t.status = 'BLOCKED';
        t.waitingOn = { kind: toKind, id: toId, requestId: reqId };
        const raisedAt = addDays(today, -randInt(rng, 3, 45));
        out.requests.push({
          id: reqId,
          fromTeamId: teamId,
          toId,
          toKind,
          title: t.title,
          blocks: t.title,
          projectId: t.projectId,
          taskId: id,
          raisedById: slot.ownerId,
          raisedAt,
          status: acked ? 'ACKNOWLEDGED' : 'COMMITTED',
          requestedDate: forecast,
          committedDate: acked ? null : forecast,
          plannedTatDays: null,
          comments: [],
          history: [{ at: raisedAt, byId: slot.ownerId, type: 'RAISED' }],
        });
      }
      out.tasks.push(t);
    });

    // Done history over the last 8 weeks, for on-time trends and ledger depth.
    for (let k = 0; k < DONE_HISTORY_PER_TEAM; k++) {
      const doneDate = addWorkingDays(today, -randInt(rng, 1, 40));
      const late = rng() < 0.25;
      const committed = late ? addWorkingDays(doneDate, -randInt(rng, 2, 8)) : doneDate;
      const ownerId = pick(rng, eligible).id;
      const id = `gen-${teamId}-d${String(k + 1).padStart(2, '0')}`;
      out.tasks.push({
        id,
        ...titleFor(teamId, doneDate),
        teamId,
        ownerIds: [ownerId],
        size: size(rng),
        status: 'DONE',
        waitingOn: null,
        baselineDate: committed,
        committedDate: committed,
        forecastDate: doneDate,
        doneDate,
        lastUpdatedAt: doneDate,
        source: 'generated',
      });
      if (late) {
        const blame = pick(rng, LATE_BLAME.filter((b) => b !== teamId));
        out.dateChanges.push({
          id: `dc-${id}`,
          entity: 'task',
          entityId: id,
          field: 'forecast',
          from: committed,
          to: doneDate,
          reasonCode: LATE_REASON[blame],
          attributedTo: blame,
          byId: leaderId,
          at: committed,
        });
      }
    }
  }
  return out;
}

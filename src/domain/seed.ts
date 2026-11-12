// Seed loader: turns seed/*.json into the initial demo state. Pure and deterministic (fixed PRNG seed).
import seedJson from '../../seed/amber-rd-seed.json';
import templateJson from '../../seed/rd-cycle-template.json';
import { addDays, addWorkingDays, DEFAULT_DEMO_TODAY } from '../lib/dates';
import { DEMO_SEED, mulberry32, pick, randInt, type Rng } from '../lib/prng';
import { generateFiller } from './generator';
import { applyProgress, scheduleTemplate } from './scheduler';
import type {
  DateChange,
  Decision,
  DeckKpi,
  DomainState,
  EscalationRule,
  Lab,
  Person,
  PlanActivity,
  Project,
  ReasonCode,
  Request,
  Settings,
  Task,
  Team,
  Template,
} from './types';

export const template = templateJson as unknown as Template;

interface SeedFile {
  meta: { demoToday: string; heroStory: string };
  teams: Team[];
  people: Person[];
  projects: Project[];
  tasks: Omit<Task, 'lastUpdatedAt'>[];
  requests: (Omit<Request, 'committedDate'> & { committedDate: string | null })[];
  decisions: Decision[];
  labs: Lab[];
  deckKpis: Record<string, DeckKpi>;
  reasonCodes: ReasonCode[];
  escalationRules: EscalationRule[];
}
export const seed = seedJson as unknown as SeedFile;

export const SHOWCASE_PROJECT_ID = 'prj-rac-01';
export const HERO_TASK_ID = 'tsk-011';
export const HERO_REQUEST_ID = 'req-001';
export const HERO_ACTIVITY_ID = 'A3_7_9';
const SHOWCASE_DV_CLOSURE = '2026-10-30';

export interface SeedState extends DomainState {
  reasonCodes: ReasonCode[];
  escalationRules: EscalationRule[];
  labs: Lab[];
  deckKpis: Record<string, DeckKpi>;
}

export function defaultSettings(rules: EscalationRule[] = seed.escalationRules): Settings {
  const p = (id: string, d: number) => rules.find((r) => r.id === id)?.param ?? d;
  return {
    r1SlipDays: p('R1', 7),
    r4StaleDays: p('R4', 14),
    r4EscalateAfterDays: 3,
    r5LoadPct: p('R5', 120),
    r5WeeklyCapacity: 10,
    r6AckWorkingDays: p('R6', 2),
  };
}

/**
 * The showcase project (6.3): template scheduled backwards from DV closure 30 Oct; CE + Proto done with ~15%
 * late actuals (late days mostly booked to Electronics and Sourcing); DV in progress; activity 3.7.9 blocked
 * by req-001 (DQA) with the hero task's dates.
 */
function buildShowcase(
  project: Project,
  heroTask: Omit<Task, 'lastUpdatedAt'>,
  people: Person[],
  today: string,
  rng: Rng,
): { plan: PlanActivity[]; dateChanges: DateChange[] } {
  const members = people
    .filter((p) => p.teamId === project.teamId && p.role === 'ENGINEER' && !p.deckNoTasksLogged)
    .map((p) => p.id)
    .filter((id) => id !== heroTask.ownerIds[0]);
  const inchargeId = heroTask.ownerIds[0];
  let plan = scheduleTemplate(
    template,
    { stage: 'DV', endDate: SHOWCASE_DV_CLOSURE },
    { leaderId: project.ownerId, inchargeId, memberIds: members, sourcingId: 'p-sourcing-lead' },
  );
  plan = applyProgress(plan, 'DV', today);

  const dateChanges: DateChange[] = [];
  const early = plan.filter((a) => a.stage === 'CE' || a.stage === 'PROTO');
  const target = Math.round(early.length * 0.15);
  const blamed = early.filter((a) => a.dependencyTeam === 'electronics' || a.dependencyTeam === 'sourcing');
  const others = early.filter((a) => !blamed.includes(a));
  const nBlamed = Math.round(target * 0.75);
  const pickN = (pool: PlanActivity[], n: number) => {
    const p = [...pool];
    const res: PlanActivity[] = [];
    while (res.length < n && p.length) res.push(p.splice(Math.floor(rng() * p.length), 1)[0]);
    return res;
  };
  const late = [...pickN(blamed, nBlamed), ...pickN(others, target - nBlamed)];
  for (const a of late) {
    const actualEnd = addWorkingDays(a.baselineEnd, randInt(rng, 2, 7));
    const attributedTo = a.dependencyTeam === 'electronics' || a.dependencyTeam === 'sourcing'
      ? a.dependencyTeam
      : pick(rng, ['lab', 'dqa', project.teamId]);
    const reasonCode =
      attributedTo === 'sourcing' ? 'SUPPLIER' : attributedTo === 'lab' ? 'LAB_SLOT'
        : attributedTo === project.teamId ? 'DESIGN_CHANGE' : attributedTo === 'dqa' ? 'TEST_FAIL' : 'WAITING_DEPT';
    Object.assign(a, { actualEnd, forecastEnd: actualEnd });
    dateChanges.push({
      id: `dc-${project.id}-${a.activityId}`,
      entity: 'activity',
      entityId: `${project.id}:${a.activityId}`,
      field: 'forecast',
      from: a.baselineEnd,
      to: actualEnd,
      reasonCode,
      attributedTo,
      byId: inchargeId,
      at: a.baselineEnd,
    });
  }

  // Hero: 3.7.9 carries the 15K3S DV closure dates and is blocked on req-001 (DQA).
  const hero = plan.find((a) => a.activityId === HERO_ACTIVITY_ID)!;
  Object.assign(hero, {
    baselineStart: addWorkingDays(heroTask.baselineDate, -((hero.plannedDays ?? 1) - 1)),
    baselineEnd: heroTask.baselineDate,
    committedEnd: heroTask.committedDate,
    forecastEnd: heroTask.forecastDate,
    status: 'BLOCKED',
    requestId: HERO_REQUEST_ID,
    ownerId: inchargeId,
  });
  return { plan, dateChanges };
}

export function buildInitialState(today: string = DEFAULT_DEMO_TODAY): SeedState {
  const rng = mulberry32(DEMO_SEED);
  const s = structuredClone(seed);

  const tasks: Task[] = s.tasks.map((t) => ({
    ...t,
    projectId: t.projectId ?? null,
    waitingOn: t.waitingOn ?? null,
    lastUpdatedAt: addDays(today, -randInt(rng, 0, 20)),
  }));
  const requests: Request[] = s.requests.map((r) => {
    const { demoHero: _drop, ...rest } = r as typeof r & { demoHero?: boolean };
    void _drop;
    return {
      ...rest,
      activityId: r.id === HERO_REQUEST_ID ? HERO_ACTIVITY_ID : null,
      history: r.history.length ? r.history : [{ at: r.raisedAt, byId: r.raisedById, type: 'RAISED' as const }],
    };
  });

  const filler = generateFiller(
    { today, deckKpis: s.deckKpis, people: s.people, projects: s.projects, tasks, template },
    rng,
  );

  const heroTask = s.tasks.find((t) => t.id === HERO_TASK_ID)!;
  const showcase = buildShowcase(s.projects.find((p) => p.id === SHOWCASE_PROJECT_ID)!, heroTask, s.people, today, rng);
  const projects = s.projects.map((p) => (p.id === SHOWCASE_PROJECT_ID ? { ...p, plan: showcase.plan } : p));

  return {
    demoToday: today,
    settings: defaultSettings(s.escalationRules),
    teams: s.teams,
    people: s.people,
    projects,
    tasks: [...tasks, ...filler.tasks],
    requests: [...requests, ...filler.requests],
    decisions: s.decisions,
    dateChanges: [...showcase.dateChanges, ...filler.dateChanges],
    reasonCodes: [...s.reasonCodes, { code: 'ACCEPTED_NEW_DATE', label: 'New date accepted by R&D head' }, { code: 'HEAD_APPROVED_EXTENSION', label: 'Extension approved by R&D head' }],
    escalationRules: s.escalationRules,
    labs: s.labs,
    deckKpis: s.deckKpis,
  };
}

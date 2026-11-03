import { describe, expect, it } from 'vitest';
import { addWorkingDays } from '../src/lib/dates';
import { mulberry32 } from '../src/lib/prng';
import { countTasks, needsHead, projectsAtRed } from '../src/domain/metrics';
import { buildInitialState, defaultSettings, HERO_ACTIVITY_ID, SHOWCASE_PROJECT_ID, template } from '../src/domain/seed';
import { scheduleTemplate } from '../src/domain/scheduler';
import { evaluate, propagateRequestDate } from '../src/domain/rules';
import { daysLostByDepartment, plannedVsActualTat } from '../src/domain/ledger';
import type { DomainState, Project, Request, RuleId, Task } from '../src/domain/types';

const TODAY = '2026-10-13';
const state = buildInitialState(TODAY);

describe('seed + generator', () => {
  it('every team matches deckKpis at 2026-10-13', () => {
    for (const [teamId, k] of Object.entries(state.deckKpis)) {
      const c = countTasks(state.tasks, TODAY, teamId);
      expect({ teamId, ...c }).toEqual({
        teamId, open: k.openItems, overdue: k.overdue, dueThisWeek: k.dueThisWeek, waiting: k.waitingOnOthers,
      });
      expect(projectsAtRed(state.projects, teamId)).toBe(k.projectsAtRed);
    }
  });

  it('totals are 206 / 42 / 59 / 91 and 16 projects at red; needs head close to 25', () => {
    expect(countTasks(state.tasks, TODAY)).toEqual({ open: 206, overdue: 42, dueThisWeek: 59, waiting: 91 });
    expect(projectsAtRed(state.projects)).toBe(16);
    expect(needsHead(state.tasks, state.decisions)).toBe(24);
  });

  it('people with deckNoTasksLogged get no generated tasks', () => {
    const none = new Set(state.people.filter((p) => p.deckNoTasksLogged).map((p) => p.id));
    const gen = state.tasks.filter((t) => t.source === 'generated');
    expect(gen.some((t) => t.ownerIds.some((o) => none.has(o)))).toBe(false);
  });

  it('is deterministic across two runs', () => {
    expect(JSON.stringify(buildInitialState(TODAY))).toBe(JSON.stringify(state));
  });

  it('seeded PRNG repeats', () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('scheduler', () => {
  const owners = { leaderId: 'L', inchargeId: 'I', memberIds: ['M1', 'M2'] };
  const plan = scheduleTemplate(template, { stage: 'DV', endDate: '2026-10-30' }, owners);

  it('gives 137 activities with valid, ordered dates inside stage windows', () => {
    expect(plan).toHaveLength(137);
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    for (const a of plan) {
      expect(a.baselineStart).toMatch(iso);
      expect(a.baselineStart <= a.baselineEnd).toBe(true);
      expect(a.committedEnd).toBe(a.baselineEnd);
    }
    for (let i = 1; i < plan.length; i++) expect(plan[i].baselineStart >= plan[i - 1].baselineStart).toBe(true);
    expect(plan.filter((a) => a.stage === 'DV').at(-1)!.baselineEnd).toBe('2026-10-30');
    expect(plan.filter((a) => a.stage === 'PP')[0].baselineStart).toBe('2026-11-02');
  });

  it('showcase: CE/Proto done with late history, DV in progress, 3.7.9 blocked by req-001', () => {
    const p = state.projects.find((x) => x.id === SHOWCASE_PROJECT_ID)!;
    expect(p.plan).toHaveLength(137);
    const done = p.plan!.filter((a) => a.stage === 'CE' || a.stage === 'PROTO');
    expect(done.every((a) => a.status === 'DONE')).toBe(true);
    const late = done.filter((a) => a.actualEnd! > a.baselineEnd);
    expect(late.length).toBeGreaterThanOrEqual(10);
    expect(p.plan!.filter((a) => a.stage === 'PP' || a.stage === 'MP').every((a) => a.status === 'OPEN')).toBe(true);
    const dv = p.plan!.filter((a) => a.stage === 'DV');
    expect(dv.some((a) => a.status === 'DONE') && dv.some((a) => a.status !== 'DONE')).toBe(true);
    const hero = p.plan!.find((a) => a.activityId === HERO_ACTIVITY_ID)!;
    expect(hero).toMatchObject({ sNo: '3.7.9', status: 'BLOCKED', requestId: 'req-001', forecastEnd: '2026-10-16' });
    const byDept = daysLostByDepartment(state.dateChanges.filter((c) => c.entity === 'activity'));
    expect(['electronics', 'sourcing']).toContain(byDept[0].key);
    expect(plannedVsActualTat(state.projects).length).toBeGreaterThan(0);
  });
});

// ---- rules ---------------------------------------------------------------------------------------------
const settings = defaultSettings();
const teams = [{ id: 'rac', name: 'RAC', kind: 'model' as const, leaderId: 'lead' }, { id: 'dqa', name: 'DQA', kind: 'cross-functional' as const, leaderId: 'dqa-lead' }];
const people = [
  { id: 'head', name: 'Head', teamId: 'rnd-head', title: '', role: 'HEAD' as const, level: 'L3' as const, reportsTo: null, email: '' },
  { id: 'lead', name: 'Lead', teamId: 'rac', title: '', role: 'TEAM_LEADER' as const, level: 'L2' as const, reportsTo: 'head', email: '' },
  { id: 'eng', name: 'Eng', teamId: 'rac', title: '', role: 'ENGINEER' as const, level: 'L1' as const, reportsTo: 'lead', email: '' },
];
const project: Project = { id: 'p1', name: 'P1', teamId: 'rac', stage: 'DV', onHold: false, nextMilestone: 'DV closure', nextMilestoneDate: '2026-10-30', rag: 'amber', ownerId: 'lead' };
const task = (o: Partial<Task> = {}): Task => ({
  id: 't1', title: 'T', teamId: 'rac', projectId: 'p1', ownerIds: ['eng'], size: 'S', status: 'OPEN', waitingOn: null,
  baselineDate: '2026-10-16', committedDate: '2026-10-16', forecastDate: '2026-10-16', lastUpdatedAt: TODAY, source: 'user', ...o,
});
const req = (o: Partial<Request> = {}): Request => ({
  id: 'r1', fromTeamId: 'rac', toId: 'dqa', toKind: 'DEPT', title: 'R', blocks: 'T', raisedById: 'eng', raisedAt: '2026-10-12',
  status: 'OPEN', comments: [], history: [], taskId: 't1', ...o,
});
const world = (o: Partial<DomainState> = {}): DomainState => ({
  demoToday: TODAY, settings, teams, people, projects: [project], tasks: [], requests: [], decisions: [], dateChanges: [], ...o,
});
const fired = (s: DomainState, rule: RuleId, today = TODAY) => evaluate(s, today).filter((e) => e.ruleId === rule);

describe('rules R1-R6', () => {
  it('R1 fires above 7 days slip, not at 7; red project also routes to head', () => {
    expect(fired(world({ tasks: [task({ forecastDate: '2026-10-24' })] }), 'R1').map((e) => e.routedToId)).toEqual(['lead']);
    expect(fired(world({ tasks: [task({ forecastDate: '2026-10-23' })] }), 'R1')).toHaveLength(0);
    const red = world({ projects: [{ ...project, rag: 'red' }], tasks: [task({ forecastDate: '2026-10-24' })] });
    expect(fired(red, 'R1').map((e) => e.routedToId)).toEqual(['lead', 'head']);
  });

  it('R2 fires when forecast passes the project milestone, not on the milestone day', () => {
    expect(fired(world({ tasks: [task({ committedDate: '2026-10-28', forecastDate: '2026-10-31' })] }), 'R2').map((e) => e.routedToId)).toEqual(['lead', 'head']);
    expect(fired(world({ tasks: [task({ forecastDate: '2026-10-30' })] }), 'R2')).toHaveLength(0);
  });

  it('R3 fires for waiting on head and pending decisions, not for decided ones', () => {
    const s = world({
      tasks: [task({ waitingOn: { kind: 'HEAD' }, status: 'BLOCKED' })],
      decisions: [{ id: 'd1', teamId: 'rac', title: 'D', ask: 'A', raisedById: 'eng', kind: 'DECISION', status: 'PENDING', raisedOn: TODAY }],
    });
    expect(fired(s, 'R3').map((e) => e.routedToId)).toEqual(['head', 'head']);
    const near = world({
      tasks: [task({ waitingOn: { kind: 'DEPT', id: 'dqa' } })],
      decisions: [{ id: 'd1', teamId: 'rac', title: 'D', ask: 'A', raisedById: 'eng', kind: 'DECISION', status: 'DECIDED', raisedOn: TODAY }],
    });
    expect(fired(near, 'R3')).toHaveLength(0);
  });

  it('R4 fires at 14 days (owner), escalates to leader at 17, not at 13', () => {
    expect(fired(world({ tasks: [task({ lastUpdatedAt: '2026-09-29' })] }), 'R4').map((e) => e.routedToId)).toEqual(['eng']);
    expect(fired(world({ tasks: [task({ lastUpdatedAt: '2026-09-26' })] }), 'R4').map((e) => e.routedToId)).toEqual(['lead']);
    expect(fired(world({ tasks: [task({ lastUpdatedAt: '2026-09-30' })] }), 'R4')).toHaveLength(0);
    expect(fired(world({ tasks: [task({ lastUpdatedAt: '2026-09-01', status: 'DONE' })] }), 'R4')).toHaveLength(0);
  });

  it('R5 fires above 120% load in both of the last 2 weeks, not when one week is at the limit', () => {
    // Tasks due in the week of 28 Sep stay open, so they count in both 28 Sep and 5 Oct weeks.
    const heavy = Array.from({ length: 4 }, (_, i) => task({ id: `h${i}`, size: 'L', forecastDate: '2026-10-01', lastUpdatedAt: TODAY })); // 16 pts
    expect(fired(world({ tasks: heavy }), 'R5').map((e) => e.routedToId)).toEqual(['lead']);
    const atLimit = [ // 12 pts in week 1 (not above 12), 16 in week 2
      ...Array.from({ length: 3 }, (_, i) => task({ id: `a${i}`, size: 'L', forecastDate: '2026-10-01' })),
      task({ id: 'b', size: 'L', forecastDate: '2026-10-07' }),
    ];
    expect(fired(world({ tasks: atLimit }), 'R5')).toHaveLength(0);
  });

  it('R6 fires when OPEN more than 2 working days after raised, not at 2 or once acknowledged', () => {
    expect(fired(world({ requests: [req()] }), 'R6', '2026-10-15').map((e) => e.routedToId)).toEqual(['dqa-lead']);
    expect(fired(world({ requests: [req()] }), 'R6', '2026-10-14')).toHaveLength(0);
    expect(fired(world({ requests: [req({ status: 'ACKNOWLEDGED' })] }), 'R6', '2026-10-20')).toHaveLength(0);
  });

  it('baseline state stays mostly quiet for the head (R3 + few others)', () => {
    const head = evaluate(state, TODAY).filter((e) => e.routedToId === 'p-mahender');
    expect(head.filter((e) => e.ruleId === 'R3')).toHaveLength(24);
    expect(head.length).toBeLessThan(40);
  });
});

describe('propagation', () => {
  let n = 0;
  const ctx = { byId: 'dqa-lead', at: '2026-10-15', nextId: () => `dc${++n}` };

  it('moves the task to request date + 1 working day, attributed to whom the request blamed', () => {
    const s = world({
      tasks: [task()],
      dateChanges: [{ id: 'x', entity: 'request', entityId: 'r1', field: 'committed', from: '2026-10-15', to: '2026-10-20',
        reasonCode: 'WAITING_DEPT', attributedTo: 'electronics', byId: 'dqa-lead', at: '2026-10-15' }],
    });
    const out = propagateRequestDate(s, req({ status: 'COMMITTED', committedDate: '2026-10-20' }), ctx);
    expect(out.tasks[0].forecastDate).toBe('2026-10-21');
    expect(out.dateChanges.at(-1)).toMatchObject({ entity: 'task', entityId: 't1', reasonCode: 'WAITING_DEPT', attributedTo: 'electronics', from: '2026-10-16', to: '2026-10-21' });
  });

  it('falls back to the receiving department and ignores dates not later than the forecast', () => {
    const later = propagateRequestDate(world({ tasks: [task()] }), req({ committedDate: '2026-10-19' }), ctx);
    expect(later.dateChanges.at(-1)!.attributedTo).toBe('dqa');
    const earlier = propagateRequestDate(world({ tasks: [task()] }), req({ committedDate: '2026-10-15' }), ctx);
    expect(earlier.tasks[0].forecastDate).toBe('2026-10-16');
    expect(earlier.dateChanges).toHaveLength(0);
  });

  it('moves the linked hero activity on the showcase plan', () => {
    const r = state.requests.find((x) => x.id === 'req-001')!;
    const out = propagateRequestDate(state, { ...r, committedDate: '2026-10-20' }, ctx);
    const hero = out.projects.find((p) => p.id === SHOWCASE_PROJECT_ID)!.plan!.find((a) => a.activityId === HERO_ACTIVITY_ID)!;
    expect(hero.forecastEnd).toBe(addWorkingDays('2026-10-20', 1));
    expect(out.tasks.find((t) => t.id === 'tsk-011')!.forecastDate).toBe('2026-10-21');
  });
});

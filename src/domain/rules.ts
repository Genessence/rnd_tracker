// Rules engine (plan section 8): evaluate(state, demoToday) -> Exception[], plus request-date propagation. Pure.
import { addDays, addWorkingDays, daysBetween, weekStart, workingDaysBetween } from '../lib/dates';
import { isOpen, isWaitingOnHead, personLoad } from './metrics';
import type { DateChange, DomainState, Exception, PlanActivity, Project, Request, Task } from './types';

type RuleState = Pick<DomainState, 'settings' | 'teams' | 'people' | 'projects' | 'tasks' | 'requests' | 'decisions'>;

export const headId = (s: Pick<DomainState, 'people'>) => s.people.find((p) => p.role === 'HEAD')?.id ?? '';
export const leaderOf = (s: Pick<DomainState, 'teams'>, teamId: string) =>
  s.teams.find((t) => t.id === teamId)?.leaderId ?? '';

export function evaluate(state: RuleState, demoToday: string): Exception[] {
  const { settings: cfg, projects, tasks } = state;
  const head = headId(state);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const out: Exception[] = [];
  const add = (e: Exception) => out.push(e);

  // Items with forecast/committed dates: open tasks and open activities of instantiated plans.
  type Item = { id: string; teamId: string; title: string; committed: string; forecast: string; project?: Project };
  const items: Item[] = tasks.filter(isOpen).map((t) => ({
    id: t.id,
    teamId: t.teamId,
    title: t.title,
    committed: t.committedDate,
    forecast: t.forecastDate,
    project: t.projectId ? projectById.get(t.projectId) : undefined,
  }));
  const r2Activities = new Set<string>(); // R2 only looks at the project's current stage
  for (const p of projects) {
    for (const a of p.plan ?? []) {
      if (a.status === 'DONE') continue;
      const id = `${p.id}:${a.activityId}`;
      if (a.stage === p.stage) r2Activities.add(id);
      items.push({ id, teamId: p.teamId, title: `${a.sNo} ${a.name} · ${p.name}`, committed: a.committedEnd, forecast: a.forecastEnd, project: p });
    }
  }

  for (const it of items) {
    // R1: forecast beyond committed by more than N calendar days -> leader; red project also -> head.
    const slip = daysBetween(it.committed, it.forecast);
    if (slip > cfg.r1SlipDays) {
      const base = { ruleId: 'R1' as const, entityId: it.id, teamId: it.teamId, title: it.title,
        detail: `Forecast ${it.forecast} is ${slip}d past committed ${it.committed}`, since: addDays(it.committed, cfg.r1SlipDays + 1) };
      add({ ...base, id: `R1:${it.id}:${it.forecast}`, routedToId: leaderOf(state, it.teamId) });
      if (it.project?.rag === 'red') add({ ...base, id: `R1:${it.id}:${it.forecast}:head`, routedToId: head });
    }
    // R2: forecast later than the project's next (mother) milestone -> project owner, then the head.
    const p = it.project;
    const isTask = !it.id.includes(':');
    if (p && !p.onHold && p.nextMilestoneDate && it.forecast > p.nextMilestoneDate && (isTask || r2Activities.has(it.id))) {
      const base = { ruleId: 'R2' as const, entityId: it.id, teamId: it.teamId, title: it.title,
        detail: `Forecast ${it.forecast} lands after "${p.nextMilestone}" (${p.nextMilestoneDate})`, since: demoToday };
      add({ ...base, id: `R2:${it.id}:${it.forecast}`, routedToId: p.ownerId });
      add({ ...base, id: `R2:${it.id}:${it.forecast}:head`, routedToId: head });
    }
  }

  // R3: waiting on the head, or a pending decision.
  for (const t of tasks.filter(isWaitingOnHead))
    add({ id: `R3:${t.id}`, ruleId: 'R3', entityId: t.id, teamId: t.teamId, title: t.title,
      detail: 'Waiting on R&D head', since: t.lastUpdatedAt, routedToId: head });
  for (const d of state.decisions.filter((d) => d.status === 'PENDING'))
    add({ id: `R3:${d.id}`, ruleId: 'R3', entityId: d.id, teamId: d.teamId, title: d.title,
      detail: d.ask, since: d.raisedOn, routedToId: head });

  // R4: not updated for N days -> owner; after N+3 days -> team leader.
  for (const t of tasks.filter(isOpen)) {
    const age = daysBetween(t.lastUpdatedAt, demoToday);
    if (age < cfg.r4StaleDays) continue;
    const toLeader = age >= cfg.r4StaleDays + cfg.r4EscalateAfterDays;
    add({ id: `R4:${t.id}:${t.lastUpdatedAt}`, ruleId: 'R4', entityId: t.id, teamId: t.teamId, title: t.title,
      detail: `Not updated for ${age} days`, since: addDays(t.lastUpdatedAt, cfg.r4StaleDays),
      routedToId: toLeader ? leaderOf(state, t.teamId) : t.ownerIds[0] });
  }

  // R5: load above X% of capacity in each of the last 2 full weeks -> team leader (leaders -> head).
  const limit = (cfg.r5WeeklyCapacity * cfg.r5LoadPct) / 100;
  const thisWeek = weekStart(demoToday);
  const weeks = [addDays(thisWeek, -14), addDays(thisWeek, -7)];
  const owners = new Set(tasks.flatMap((t) => t.ownerIds));
  for (const person of state.people) {
    if (!owners.has(person.id)) continue;
    const loads = weeks.map((w) => personLoad(tasks, person.id, w));
    if (!loads.every((l) => l > limit)) continue;
    const leader = leaderOf(state, person.teamId);
    add({ id: `R5:${person.id}:${thisWeek}`, ruleId: 'R5', entityId: person.id, teamId: person.teamId,
      title: `${person.name} overloaded`, detail: `Load ${loads.join(' / ')} pts vs ${limit} pts limit (last 2 weeks)`,
      since: weeks[0], routedToId: leader && leader !== person.id ? leader : head });
  }

  // R6: request still OPEN more than N working days after it was raised -> receiving lead.
  for (const r of state.requests) {
    if (r.status !== 'OPEN' || workingDaysBetween(r.raisedAt, demoToday) <= cfg.r6AckWorkingDays) continue;
    add({ id: `R6:${r.id}`, ruleId: 'R6', entityId: r.id, teamId: r.fromTeamId, title: r.title,
      detail: `Not acknowledged since ${r.raisedAt}`, since: addWorkingDays(r.raisedAt, cfg.r6AckWorkingDays + 1),
      routedToId: leaderOf(state, r.toId) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Propagation: a request's committed date later than a linked item's forecast moves the item to request
// date + 1 working day, logged as WAITING_DEPT and attributed to whoever the request's own latest change blamed.

type PropState = Pick<DomainState, 'tasks' | 'projects' | 'dateChanges'>;
export interface PropagationCtx {
  byId: string;
  at: string;
  nextId: () => string;
}

/** Department the request's own latest date change blamed; falls back to the receiving department. */
export function requestBlame(request: Request, dateChanges: DateChange[]): string {
  const own = dateChanges.filter((c) => c.entity === 'request' && c.entityId === request.id).at(-1);
  return own?.attributedTo ?? request.toId;
}

/** Pushes later activities of the same plan when their predecessor now ends on or after them. */
export function cascadePlan(
  projectId: string,
  plan: PlanActivity[],
  fromIndex: number,
  attributedTo: string,
  ctx: PropagationCtx,
  changes: DateChange[],
): PlanActivity[] {
  const next = [...plan];
  for (let i = fromIndex + 1; i < next.length; i++) {
    const prev = next[i - 1];
    const a = next[i];
    if (a.status === 'DONE' || a.forecastEnd > prev.forecastEnd) break;
    const to = addWorkingDays(prev.forecastEnd, 1);
    changes.push({ id: ctx.nextId(), entity: 'activity', entityId: `${projectId}:${a.activityId}`, field: 'forecast',
      from: a.forecastEnd, to, reasonCode: 'WAITING_DEPT', note: `Follows ${prev.sNo}`, attributedTo, byId: ctx.byId, at: ctx.at });
    next[i] = { ...a, forecastEnd: to };
  }
  return next;
}

export function propagateRequestDate(state: PropState, request: Request, ctx: PropagationCtx): PropState {
  const date = request.committedDate;
  if (!date) return state;
  const to = addWorkingDays(date, 1);
  const blame = requestBlame(request, state.dateChanges);
  const changes: DateChange[] = [];
  const note = `${request.id} committed ${date}`;

  const tasks = state.tasks.map((t): Task => {
    if (t.id !== request.taskId || t.status === 'DONE' || date <= t.forecastDate) return t;
    changes.push({ id: ctx.nextId(), entity: 'task', entityId: t.id, field: 'forecast', from: t.forecastDate, to,
      reasonCode: 'WAITING_DEPT', note, attributedTo: blame, byId: ctx.byId, at: ctx.at });
    return { ...t, forecastDate: to, lastUpdatedAt: ctx.at };
  });

  const projects = state.projects.map((p): Project => {
    if (!p.plan) return p;
    const i = p.plan.findIndex((a) => a.requestId === request.id || (request.projectId === p.id && a.activityId === request.activityId));
    if (i < 0) return p;
    const a = p.plan[i];
    if (a.status === 'DONE' || date <= a.forecastEnd) return p;
    changes.push({ id: ctx.nextId(), entity: 'activity', entityId: `${p.id}:${a.activityId}`, field: 'forecast',
      from: a.forecastEnd, to, reasonCode: 'WAITING_DEPT', note, attributedTo: blame, byId: ctx.byId, at: ctx.at });
    const plan = [...p.plan];
    plan[i] = { ...a, forecastEnd: to };
    return { ...p, plan: cascadePlan(p.id, plan, i, blame, ctx, changes) };
  });

  return { tasks, projects, dateChanges: [...state.dateChanges, ...changes] };
}

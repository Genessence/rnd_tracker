// Selectors: thin wrappers over src/domain so every screen counts the same way.
// They return fresh arrays/objects, so in components use the hooks below (memoised) or useShallow,
// never `useStore(selectX)` directly with a derived value.
import { useMemo } from 'react';
import { countTasks, isDueThisWeek, isOpen, isOverdue, isWaitingOnOthers, needsHead, personLoad, projectsAtRed, type Counts } from '../domain/metrics';
import { daysBetween, weekStart } from '../lib/dates';
import { evaluate, headId } from '../domain/rules';
import type { Exception, Request, Task } from '../domain/types';
import { useStore, type AppData } from './store';

export type TaskBucket = 'open' | 'overdue' | 'dueThisWeek' | 'waiting';

const BUCKET: Record<TaskBucket, (t: Task, today: string) => boolean> = {
  open: (t) => isOpen(t),
  overdue: isOverdue,
  dueThisWeek: isDueThisWeek,
  waiting: (t) => isWaitingOnOthers(t),
};

/** Tasks in a bucket, for one team or all teams. */
export const selectTasks = (s: AppData, bucket: TaskBucket, teamId?: string): Task[] =>
  s.tasks.filter((t) => (!teamId || t.teamId === teamId) && BUCKET[bucket](t, s.demoToday));

export const selectCounts = (s: AppData, teamId?: string): Counts => countTasks(s.tasks, s.demoToday, teamId);

export interface Kpis extends Counts {
  needsHead: number;
  projectsAtRed: number;
}
export const selectKpis = (s: AppData, teamId?: string): Kpis => ({
  ...selectCounts(s, teamId),
  needsHead: needsHead(s.tasks, s.decisions, teamId),
  projectsAtRed: projectsAtRed(s.projects, teamId),
});

/** Live exceptions minus the ones cleared by an action. */
export const selectExceptions = (s: AppData): Exception[] =>
  evaluate(s, s.demoToday).filter((e) => !s.clearedExceptions[e.id]);

export const selectHeadInbox = (s: AppData) => {
  const head = headId(s);
  return selectExceptions(s).filter((e) => e.routedToId === head);
};

export const selectMyTasks = (s: AppData, personId = s.currentPersonId) =>
  s.tasks.filter((t) => isOpen(t) && t.ownerIds.includes(personId));

// ---- hooks -----------------------------------------------------------------------------------------------

export function useKpis(teamId?: string): Kpis {
  const tasks = useStore((s) => s.tasks);
  const decisions = useStore((s) => s.decisions);
  const projects = useStore((s) => s.projects);
  const demoToday = useStore((s) => s.demoToday);
  return useMemo(
    () => ({
      ...countTasks(tasks, demoToday, teamId),
      needsHead: needsHead(tasks, decisions, teamId),
      projectsAtRed: projectsAtRed(projects, teamId),
    }),
    [tasks, decisions, projects, demoToday, teamId],
  );
}

export function useExceptions(): Exception[] {
  const s = useStore();
  const { tasks, projects, requests, decisions, settings, people, teams, demoToday, clearedExceptions } = s;
  return useMemo(() => selectExceptions(s), [tasks, projects, requests, decisions, settings, people, teams, demoToday, clearedExceptions]);
}

// ---- blockers and load (tower, team pages) -----------------------------------------------------------------

export const AGE_BUCKETS = ['0–7', '8–14', '15–30', '30+'] as const;
const ageBucket = (days: number) => (days <= 7 ? 0 : days <= 14 ? 1 : days <= 30 ? 2 : 3);
/** A request still holds someone up until the requester accepts it (or it is done/rejected). */
export const isRequestLive = (r: Request) => r.status !== 'ACCEPTED' && r.status !== 'DONE' && r.status !== 'REJECTED';

export interface HeatRow { toId: string; cells: number[]; total: number }
/** Open requests by receiving team/department × age bucket, busiest first. Optional fromTeamId filter. */
export function blockerHeatmap(requests: Request[], today: string, fromTeamId?: string): HeatRow[] {
  const rows = new Map<string, HeatRow>();
  for (const r of requests) {
    if (!isRequestLive(r) || (fromTeamId && r.fromTeamId !== fromTeamId)) continue;
    const row = rows.get(r.toId) ?? { toId: r.toId, cells: [0, 0, 0, 0], total: 0 };
    row.cells[ageBucket(daysBetween(r.raisedAt, today))]++;
    row.total++;
    rows.set(r.toId, row);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

/** This week's load points per person (capacity in settings), highest first. */
export function topLoad(s: Pick<AppData, 'tasks' | 'people' | 'demoToday'>, limit = 10, teamId?: string) {
  const ws = weekStart(s.demoToday);
  return s.people
    .filter((p) => p.role !== 'HEAD' && (!teamId || p.teamId === teamId))
    .map((p) => ({ person: p, load: personLoad(s.tasks, p.id, ws) }))
    .filter((x) => x.load > 0)
    .sort((a, b) => b.load - a.load)
    .slice(0, limit);
}

/** Short team label: "RAC (SAC / WAC)" -> "RAC". */
export const shortTeam = (name: string) => name.replace(/\s*\(.*\)\s*$/, '');

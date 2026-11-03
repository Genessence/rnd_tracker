// Selectors: thin wrappers over src/domain so every screen counts the same way.
// They return fresh arrays/objects, so in components use the hooks below (memoised) or useShallow,
// never `useStore(selectX)` directly with a derived value.
import { useMemo } from 'react';
import { countTasks, isDueThisWeek, isOpen, isOverdue, isWaitingOnOthers, needsHead, projectsAtRed, type Counts } from '../domain/metrics';
import { evaluate, headId } from '../domain/rules';
import type { Exception, Task } from '../domain/types';
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

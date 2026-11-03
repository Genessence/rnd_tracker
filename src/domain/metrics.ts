// The ONE definition of the headline counts (plan section 6.2). Use these everywhere: tower, team, tests, generator.
import { weekEnd } from '../lib/dates';
import { SIZE_POINTS, type Decision, type Project, type Task } from './types';

export const isOpen = (t: Task) => t.status !== 'DONE';
export const isOverdue = (t: Task, today: string) => isOpen(t) && t.forecastDate < today;
export const isDueThisWeek = (t: Task, today: string) =>
  isOpen(t) && t.forecastDate >= today && t.forecastDate <= weekEnd(today);
export const isWaitingOnOthers = (t: Task) =>
  isOpen(t) && (t.waitingOn?.kind === 'TEAM' || t.waitingOn?.kind === 'DEPT');
export const isWaitingOnHead = (t: Task) => isOpen(t) && t.waitingOn?.kind === 'HEAD';

export interface Counts {
  open: number;
  overdue: number;
  dueThisWeek: number;
  waiting: number;
}

/** Counts for one team (teamId) or all tasks (no teamId). */
export function countTasks(tasks: Task[], today: string, teamId?: string): Counts {
  const c: Counts = { open: 0, overdue: 0, dueThisWeek: 0, waiting: 0 };
  for (const t of tasks) {
    if (teamId && t.teamId !== teamId) continue;
    if (!isOpen(t)) continue;
    c.open++;
    if (isOverdue(t, today)) c.overdue++;
    if (isDueThisWeek(t, today)) c.dueThisWeek++;
    if (isWaitingOnOthers(t)) c.waiting++;
  }
  return c;
}

export const projectsAtRed = (projects: Project[], teamId?: string) =>
  projects.filter((p) => p.rag === 'red' && (!teamId || p.teamId === teamId)).length;

/** Derived "needs head": pending decisions + open tasks waiting on the head. */
export const needsHead = (tasks: Task[], decisions: Decision[], teamId?: string) =>
  decisions.filter((d) => d.status === 'PENDING' && (!teamId || d.teamId === teamId)).length +
  tasks.filter((t) => isWaitingOnHead(t) && (!teamId || t.teamId === teamId)).length;

/**
 * Load points a person carried in the week starting weekStartIso: tasks they own that were due by
 * that Sunday and not done by then (overdue work carries over). Capacity is 10 points a week.
 */
export function personLoad(tasks: Task[], personId: string, weekStartIso: string): number {
  const end = weekEnd(weekStartIso);
  let load = 0;
  for (const t of tasks) {
    if (!t.ownerIds.includes(personId) || t.forecastDate > end) continue;
    if (t.status === 'DONE' && (!t.doneDate || t.doneDate <= end)) continue;
    load += SIZE_POINTS[t.size];
  }
  return load;
}

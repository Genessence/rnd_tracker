// Delay ledger aggregations (plan sections 8-9). Pure.
import { addDays, daysBetween, weekStart, workingDaysBetween } from '../lib/dates';
import type { DateChange, Project, Task } from './types';

export interface Bucket {
  key: string;
  days: number;
  count: number;
}

/**
 * Calendar days lost (forecast moved later) on tasks and activities, grouped by reason code or by the
 * team/department the change was attributed to. Request-date changes are excluded: their effect is booked
 * on the items they moved, so counting both would double-count.
 */
export function daysLost(changes: DateChange[], by: 'reasonCode' | 'attributedTo'): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const c of changes) {
    if (c.entity === 'request' || c.field !== 'forecast') continue;
    const days = daysBetween(c.from, c.to);
    if (days <= 0) continue;
    const key = (by === 'reasonCode' ? c.reasonCode : c.attributedTo) ?? 'unattributed';
    const b = m.get(key) ?? { key, days: 0, count: 0 };
    b.days += days;
    b.count++;
    m.set(key, b);
  }
  return [...m.values()].sort((a, b) => b.days - a.days || a.key.localeCompare(b.key));
}

export const daysLostByReason = (changes: DateChange[]) => daysLost(changes, 'reasonCode');
export const daysLostByDepartment = (changes: DateChange[]) => daysLost(changes, 'attributedTo');

export interface TatRow {
  dept: string; // dependency team id, or 'internal'
  activities: number;
  plannedDays: number;
  actualDays: number;
}

/** Planned vs actual TAT (working days) per dependency department, over completed plan activities. */
export function plannedVsActualTat(projects: Project[]): TatRow[] {
  const m = new Map<string, TatRow>();
  for (const p of projects)
    for (const a of p.plan ?? []) {
      if (a.status !== 'DONE' || !a.actualEnd) continue;
      const dept = a.dependencyTeam ?? 'internal';
      const r = m.get(dept) ?? { dept, activities: 0, plannedDays: 0, actualDays: 0 };
      r.activities++;
      r.plannedDays += a.plannedDays ?? 1;
      r.actualDays += Math.max(1, workingDaysBetween(a.baselineStart, a.actualEnd) + 1);
      m.set(dept, r);
    }
  return [...m.values()].sort((a, b) => b.actualDays - b.plannedDays - (a.actualDays - a.plannedDays));
}

export interface TrendPoint {
  weekStart: string;
  done: number;
  onTime: number;
  pct: number | null; // null when nothing was done that week
}

/** On-time completion per week (done on or before committed date) for the last `weeks` weeks. */
export function onTimeTrend(tasks: Task[], today: string, weeks = 8, teamId?: string): TrendPoint[] {
  const first = addDays(weekStart(today), -7 * (weeks - 1));
  const pts: TrendPoint[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: addDays(first, 7 * i), done: 0, onTime: 0, pct: null,
  }));
  for (const t of tasks) {
    if (t.status !== 'DONE' || !t.doneDate || (teamId && t.teamId !== teamId)) continue;
    const i = Math.floor(daysBetween(first, t.doneDate) / 7);
    if (i < 0 || i >= weeks) continue;
    pts[i].done++;
    if (t.doneDate <= t.committedDate) pts[i].onTime++;
  }
  for (const p of pts) p.pct = p.done ? Math.round((100 * p.onTime) / p.done) : null;
  return pts;
}

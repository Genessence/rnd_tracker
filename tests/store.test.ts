// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store/store';
import { selectCounts, selectExceptions, selectHeadInbox } from '../src/store/selectors';
import { daysLostByDepartment } from '../src/domain/ledger';

const s = () => useStore.getState();
const heroActivity = () => s().projects.find((p) => p.id === 'prj-rac-01')!.plan!.find((a) => a.activityId === 'A3_7_9')!;
const task = (id: string) => s().tasks.find((t) => t.id === id)!;

beforeEach(() => s().resetDemo());

describe('store actions', () => {
  it('moveForecast refuses without a reason, and logs a DateChange with one', () => {
    s().setPersona('p-jatin-sharma');
    const before = s().dateChanges.length;
    expect(s().moveForecast('task', 'tsk-011', '2026-10-22', '')).toBe(false);
    expect(task('tsk-011').forecastDate).toBe('2026-10-16');
    expect(s().moveForecast('task', 'tsk-011', '2026-10-22', 'WAITING_DEPT', 'DQA', 'dqa')).toBe(true);
    expect(task('tsk-011')).toMatchObject({ forecastDate: '2026-10-22', lastUpdatedAt: '2026-10-13' });
    expect(s().dateChanges).toHaveLength(before + 1);
    expect(s().dateChanges.at(-1)).toMatchObject({ entity: 'task', from: '2026-10-16', to: '2026-10-22', attributedTo: 'dqa', byId: 'p-jatin-sharma' });
  });

  it('setWaitingOn DEPT raises a request in that queue and counts as waiting', () => {
    const before = selectCounts(s(), 'rac').waiting;
    const reqId = s().setWaitingOn('tsk-004', { kind: 'DEPT', id: 'plant-ppc' })!;
    const r = s().requests.find((x) => x.id === reqId)!;
    expect(r).toMatchObject({ toId: 'plant-ppc', toKind: 'DEPT', taskId: 'tsk-004', status: 'OPEN' });
    expect(selectCounts(s(), 'rac').waiting).toBe(before + 1);
  });

  it('setWaitingOn HEAD lands in the head inbox; deciding clears it and logs', () => {
    s().setWaitingOn('tsk-004', { kind: 'HEAD' });
    const ex = selectHeadInbox(s()).find((e) => e.entityId === 'tsk-004')!;
    expect(ex.ruleId).toBe('R3');
    expect(s().decideException(ex, 'DECIDE', 'Go ahead')).toBe(true);
    expect(selectExceptions(s()).some((e) => e.id === ex.id)).toBe(false);
    expect(s().actionLog.at(-1)).toMatchObject({ action: 'EXCEPTION_DECIDE', entityId: ex.id });
  });

  it('runs the demo story: req-001 commit, re-commit blaming Electronics propagates to task and 3.7.9', () => {
    s().setPersona('p-dqa-lead');
    s().acknowledgeRequest('req-001');
    expect(s().commitRequest('req-001', '2026-10-15')).toBe(true);
    expect(task('tsk-011').forecastDate).toBe('2026-10-16');
    s().setPersona('p-jatin-sharma');
    s().acceptRequest('req-001');
    s().setDemoToday('2026-10-15');
    s().setPersona('p-dqa-lead');
    expect(s().commitRequest('req-001', '2026-10-20')).toBe(false); // re-commit needs a reason
    expect(s().commitRequest('req-001', '2026-10-20', 'WAITING_DEPT', 'Final build pending', 'electronics')).toBe(true);
    expect(task('tsk-011').forecastDate).toBe('2026-10-21');
    expect(heroActivity().forecastEnd).toBe('2026-10-21');
    const moved = s().dateChanges.filter((c) => c.entity !== 'request' && c.at === '2026-10-15');
    expect(moved.every((c) => c.attributedTo === 'electronics')).toBe(true);
    expect(daysLostByDepartment(moved)).toEqual([{ key: 'electronics', days: 10, count: 2 }]);
  });

  it('R1 threshold change adds exceptions; resetDemo restores the seed', () => {
    const n = selectExceptions(s()).length;
    s().moveForecast('task', 'tsk-011', '2026-10-21', 'WAITING_DEPT');
    s().updateSettings({ r1SlipDays: 3 });
    expect(selectExceptions(s()).length).toBeGreaterThan(n);
    s().resetDemo();
    expect(task('tsk-011').forecastDate).toBe('2026-10-16');
    expect(selectCounts(s())).toEqual({ open: 206, overdue: 42, dueThisWeek: 59, waiting: 91 });
  });
});

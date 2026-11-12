// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store/store';
import { selectCounts, selectExceptions, selectHeadInbox, selectMyActivities } from '../src/store/selectors';
import { daysLostByDepartment } from '../src/domain/ledger';
import { addDays } from '../src/lib/dates';

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

  it('plan activities a person owns show on their My Day, and Done clears them', () => {
    s().setPersona('p-satbir-singh');
    const pid = s().createProject({ name: 'Test SAC', teamId: 'rac', startDate: '2026-10-13', engineerIds: ['p-jatin-sharma'] });
    const mine = selectMyActivities(s(), 'p-jatin-sharma').filter((t) => t.projectId === pid);
    expect(mine.length).toBeGreaterThan(0);
    s().completeTask(mine[0].id);
    expect(selectMyActivities(s(), 'p-jatin-sharma').some((t) => t.id === mine[0].id)).toBe(false);
    expect(s().projects.find((p) => p.id === pid)!.plan!.find((a) => `${pid}:${a.activityId}` === mine[0].id)).toMatchObject({ status: 'DONE', actualEnd: '2026-10-13' });
  });

  it('asks to the head: date extension approval moves the task; bring-in creates a task; task stops waiting', () => {
    s().setPersona('p-jatin-sharma');
    const id = s().raiseAsk({ kind: 'DATE_EXTENSION', title: 'Hitachi WAC grill lock modification', ask: 'Vendor late', taskId: 'tsk-004', proposedDate: '2026-10-27' });
    expect(task('tsk-004').waitingOn).toEqual({ kind: 'HEAD' });
    const ex = selectHeadInbox(s()).filter((e) => e.entityId === id || e.entityId === 'tsk-004');
    expect(ex.map((e) => e.entityId)).toEqual([id]); // one inbox item, not two
    s().setPersona('p-mahender');
    expect(s().decideException(ex[0], 'DECIDE', '')).toBe(true);
    expect(task('tsk-004')).toMatchObject({ forecastDate: '2026-10-27', committedDate: '2026-10-27', waitingOn: null });

    s().setPersona('p-jatin-sharma');
    const id2 = s().raiseAsk({ kind: 'INVOLVE', title: 'Need Electronics in DV review', ask: 'Software owner' });
    s().setPersona('p-mahender');
    const before = s().tasks.length;
    const ex2 = selectHeadInbox(s()).find((e) => e.entityId === id2)!;
    expect(s().decideException(ex2, 'REASSIGN', 'join Friday', { ownerId: 'p-dhiraj-gupta' })).toBe(true);
    expect(s().tasks.length).toBe(before + 1);
    expect(s().tasks.at(-1)!.ownerIds).toEqual(['p-dhiraj-gupta']);
    expect(s().decisions.find((d) => d.id === id2)!.status).toBe('DECIDED');
  });

  it('MOM upload is for an ended meeting: becomes a draft, publish creates assigned tasks', async () => {
    const { scheduleMeeting, endMeeting, uploadMom, draftMom, publishMom } = await import('../src/sim/teams');
    const { SAMPLE_MOM } = await import('../src/domain/mom-upload');
    const mid = scheduleMeeting({ title: 'DV review', projectId: 'prj-rac-01', stage: 'DV', attendeeIds: ['p-jatin-sharma'], date: '2026-10-16', time: '10:00', weekly: false });
    endMeeting(mid);
    expect(uploadMom(mid, SAMPLE_MOM)).toEqual([]);
    const mom = s().moms.find((m) => m.id === s().meetings.find((x) => x.id === mid)!.momId)!;
    expect(mom).toMatchObject({ status: 'DRAFT', upload: { fileName: 'MOM.txt', at: '2026-10-13' } });
    expect(s().meetings.find((x) => x.id === mid)!.momId).toBe(mom.id);
    expect(mom.actions).toHaveLength(6);
    expect(mom.actions[5].ownerId).toBeUndefined();
    // transcript path still drafts every action with an owner (the demo publishes it)
    const mid2 = scheduleMeeting({ title: 'DV review 2', projectId: 'prj-rac-01', stage: 'DV', attendeeIds: ['p-jatin-sharma'], date: '2026-10-16', time: '11:00', weekly: false });
    endMeeting(mid2);
    const id2 = draftMom(mid2);
    const m2 = s().moms.find((m) => m.id === id2)!;
    expect(m2.actions.every((a) => a.ownerId)).toBe(true);
    const before = s().tasks.length;
    publishMom(m2.id);
    expect(s().tasks.length).toBeGreaterThan(before);
  });

  it('stage gate: review unlocks when deliverables are done; Go advances, Hold parks, conditional go adds a task', async () => {
    const { gateChecklist } = await import('../src/domain/gate');
    s().setPersona('p-satbir-singh');
    const pid = s().createProject({ name: 'Gate SAC', teamId: 'rac', startDate: '2026-10-13', engineerIds: ['p-jatin-sharma'] });
    expect(s().requestGate(pid)).toBeUndefined(); // checklist open
    for (const a of gateChecklist(s().projects.find((p) => p.id === pid)!).items) s().completeTask(`${pid}:${a.activityId}`);
    const ask = s().requestGate(pid)!;
    expect(ask).toBeTruthy();
    expect(s().requestGate(pid)).toBeUndefined(); // one pending review at a time
    s().setPersona('p-mahender');
    const ex = () => selectHeadInbox(s()).find((e) => e.entityId === ask)!;
    expect(s().decideException(ex(), 'PUSH_BACK', 'BOM costing incomplete')).toBe(true);
    expect(s().projects.find((p) => p.id === pid)).toMatchObject({ stage: 'CE', onHold: true });
    s().setPersona('p-satbir-singh');
    const ask2 = s().requestGate(pid)!;
    s().setPersona('p-mahender');
    const before = s().tasks.length;
    expect(s().decideException(selectHeadInbox(s()).find((e) => e.entityId === ask2)!, 'DECIDE', 'Close cost gap by Proto', { conditional: true })).toBe(true);
    expect(s().projects.find((p) => p.id === pid)).toMatchObject({ stage: 'PROTO', onHold: false, nextMilestone: 'Proto closure' });
    expect(s().tasks.length).toBe(before + 1);
  });

  it('RAG goes live for a project touched in the app; untouched projects keep the deck RAG', () => {
    const before = s().projects.map((p) => p.rag);
    s().setPersona('p-jatin-sharma');
    const t = s().tasks.find((x) => x.projectId && x.status !== 'DONE' && s().projects.find((p) => p.id === x.projectId)?.nextMilestoneDate && !s().projects.find((p) => p.id === x.projectId)?.onHold)!;
    const p0 = s().projects.find((p) => p.id === t.projectId)!;
    s().moveForecast('task', t.id, addDays(p0.nextMilestoneDate!, 10), 'WAITING_DEPT');
    expect(s().projects.find((p) => p.id === p0.id)!.rag).toBe('red');
    const others = s().projects.filter((p) => p.id !== p0.id).map((p) => p.rag);
    expect(others).toEqual(before.filter((_, i) => s().projects[i].id !== p0.id));
  });

  it('R7: past its date and not re-forecast goes to the team leader', () => {
    const r7 = selectExceptions(s()).filter((e) => e.ruleId === 'R7');
    expect(r7.length).toBeGreaterThan(0);
    for (const e of r7) {
      const t = s().tasks.find((x) => x.id === e.entityId);
      if (t) expect(t.forecastDate === t.committedDate && t.forecastDate < '2026-10-11').toBe(true);
      expect(s().people.find((p) => p.id === e.routedToId)?.role).not.toBe('HEAD');
    }
  });

  it('request closure: delivered unblocks the task; not received re-blocks; scorecard counts on-time', async () => {
    const { deliveryScorecard } = await import('../src/domain/ledger');
    const reqId = s().setWaitingOn('tsk-004', { kind: 'DEPT', id: 'plant-ppc' })!;
    s().acknowledgeRequest(reqId);
    s().commitRequest(reqId, '2026-10-20');
    s().deliverRequest(reqId);
    expect(s().requests.find((r) => r.id === reqId)).toMatchObject({ status: 'DONE', deliveredAt: '2026-10-13' });
    expect(task('tsk-004').waitingOn).toBeNull();
    s().confirmDelivery(reqId, false, 'drawing missing');
    expect(s().requests.find((r) => r.id === reqId)!.status).toBe('COMMITTED');
    expect(task('tsk-004').waitingOn).toMatchObject({ kind: 'DEPT', id: 'plant-ppc' });
    s().deliverRequest(reqId);
    s().confirmDelivery(reqId, true);
    expect(s().requests.find((r) => r.id === reqId)!.receivedAt).toBe('2026-10-13');
    expect(deliveryScorecard(s().requests).find((r) => r.dept === 'plant-ppc')).toMatchObject({ delivered: 1, onTime: 1 });
  });

  it('dispute: booked lead is notified, disputes once, head upholding removes the booking', () => {
    s().setPersona('p-jatin-sharma');
    s().moveForecast('task', 'tsk-011', '2026-10-22', 'WAITING_DEPT', 'x', 'dqa');
    const c = s().dateChanges.at(-1)!;
    expect(s().notifications.some((n) => n.toId === 'p-dqa-lead' && n.relatedId === c.id)).toBe(true);
    s().setPersona('p-dqa-lead');
    const ask = s().disputeChange(c.id, 'Build came late from Electronics')!;
    expect(s().disputeChange(c.id, 'again')).toBeUndefined();
    s().setPersona('p-mahender');
    expect(s().decideException(selectHeadInbox(s()).find((e) => e.entityId === ask)!, 'DECIDE', '')).toBe(true);
    expect(s().dateChanges.find((x) => x.id === c.id)).toMatchObject({ attributedTo: undefined, dispute: { status: 'UPHELD' } });
  });

  it('test failure / design change need a note and raise an approval to the head', () => {
    s().setPersona('p-jatin-sharma');
    expect(s().moveForecast('task', 'tsk-011', '2026-10-22', 'TEST_FAIL')).toBe(false);
    const before = s().decisions.length;
    expect(s().moveForecast('task', 'tsk-011', '2026-10-22', 'TEST_FAIL', 'Noise 3 dB over at high speed')).toBe(true);
    expect(s().decisions.length).toBe(before + 1);
    expect(s().decisions.at(-1)).toMatchObject({ kind: 'APPROVAL', status: 'PENDING' });
    expect(s().decisions.at(-1)!.title).toMatch(/^Test failure/);
  });

  it('plan activities count in load; readiness chips come from existing activities', async () => {
    const { personLoad } = await import('../src/domain/metrics');
    const { readiness } = await import('../src/domain/gate');
    const { weekStart } = await import('../src/lib/dates');
    const ws = weekStart('2026-10-13');
    expect(personLoad(s().tasks, 'p-jatin-sharma', ws, s().projects)).toBeGreaterThan(personLoad(s().tasks, 'p-jatin-sharma', ws));
    const r = readiness(s().projects.find((p) => p.id === 'prj-rac-01')!, '2026-10-13');
    expect(r.map((x) => x.key)).toEqual(expect.arrayContaining(['Samples', 'BOM', 'Customer approval']));
  });
});


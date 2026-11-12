// The one Zustand store, persisted to localStorage. Domain logic stays in src/domain; actions call it.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { buildInitialState, template, type SeedState } from '../domain/seed';
import { cascadePlan, headId, leaderOf, propagateRequestDate } from '../domain/rules';
import { applyProgress, instantiatePlan, scheduleTemplate } from '../domain/scheduler';
import { advanceStage, gateChecklist, nextStage } from '../domain/gate';
import { liveRag } from '../domain/metrics';
import { addWorkingDays, daysBetween, fmtShort, nextWorkingDay } from '../lib/dates';
import type {
  ActionLogEntry,
  AskKind,
  DateChange,
  DateEntity,
  Decision,
  Email,
  Exception,
  ExceptionAction,
  Meeting,
  Mom,
  Notification,
  PlanActivity,
  Project,
  Request,
  Settings,
  Size,
  StageCode,
  Task,
  WaitingOn,
} from '../domain/types';
import { ASK_LABEL } from '../domain/types';

export interface ClearedException {
  action: ExceptionAction;
  note: string;
  byId: string;
  at: string;
}

export interface AppData extends SeedState {
  currentPersonId: string;
  seq: number; // id counter for everything created at runtime
  clearedExceptions: Record<string, ClearedException>;
  actionLog: ActionLogEntry[];
  meetings: Meeting[];
  moms: Mom[];
  emails: Email[];
  notifications: Notification[];
}

export interface NewTask {
  title: string;
  teamId?: string;
  projectId?: string | null;
  stage?: StageCode;
  ownerIds?: string[];
  size?: Size;
  forecastDate?: string;
  waitingOn?: WaitingOn | null;
  source?: Task['source'];
  momId?: string;
}

export interface NewRequest {
  toId: string;
  toKind: 'TEAM' | 'DEPT';
  title: string;
  blocks?: string;
  fromTeamId?: string;
  projectId?: string | null;
  taskId?: string | null;
  activityId?: string | null;
  requestedDate?: string | null;
  plannedTatDays?: number | null;
}

export interface Actions {
  resetDemo: () => void;
  setDemoToday: (date: string) => void;
  setPersona: (personId: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  logAction: (action: string, entityId: string, note?: string) => void;
  notify: (toId: string, kind: Notification['kind'], text: string, relatedId?: string, link?: string) => void;
  markNotificationsRead: (personId: string) => void;
  /** Stores a simulated email in the Outbox. Returns its id. Use src/sim/mailer.ts sendEmail from UI code. */
  sendEmail: (email: Omit<Email, 'id' | 'at'> & { at?: string }) => string;

  createTask: (input: NewTask) => string;
  /** Non-date fields only; dates move through moveForecast so the ledger sees every change. */
  updateTask: (id: string, patch: Partial<Pick<Task, 'title' | 'ownerIds' | 'size' | 'status' | 'projectId' | 'stage'>>) => void;
  completeTask: (id: string) => void;
  /**
   * Moves a task/activity forecast or a request's committed date. Refuses (returns false) without a reason
   * code or when the date is unchanged. Always appends a DateChange and touches lastUpdatedAt.
   * Activity ids are `${projectId}:${activityId}`.
   */
  moveForecast: (entity: DateEntity, id: string, newDate: string, reasonCode: string, note?: string, attributedTo?: string) => boolean;
  /** TEAM/DEPT raises a Request in that queue; HEAD routes to the head (R3); null clears. Returns a request id if raised. */
  setWaitingOn: (taskId: string, waitingOn: WaitingOn | null) => string | undefined;

  createRequest: (input: NewRequest) => string;
  acknowledgeRequest: (id: string) => void;
  /** Commits (or re-commits) a date and runs propagation. A re-commit to a new date needs a reason code. */
  commitRequest: (id: string, date: string, reasonCode?: string, note?: string, attributedTo?: string) => boolean;
  acceptRequest: (id: string) => void;
  /** Receiving team: done. The request stops blocking; the requester is asked to confirm receipt. */
  deliverRequest: (id: string, note?: string) => void;
  /** Requester: received (closes it) or not received (back to committed, the task waits again). */
  confirmDelivery: (id: string, received: boolean, note?: string) => void;
  /** Lead of the booked department contests a date change's booking; goes to the head as an ask. */
  disputeChange: (changeId: string, note: string) => string | undefined;
  counterRequest: (id: string, proposedDate: string, note: string) => void;
  commentRequest: (id: string, text: string) => void;

  /** Anyone asks the head for a decision, input, approval, date extension or people; optionally holds up a task. */
  raiseAsk: (input: { kind: AskKind; title: string; ask: string; taskId?: string; proposedDate?: string; projectId?: string; stage?: StageCode }) => string;
  /** Leader (or head) asks the head to review the current stage's gate. Refused until the checklist is complete or if one is pending. */
  requestGate: (projectId: string, lessons?: string) => string | undefined;
  decideDecision: (id: string, status: Exclude<Decision['status'], 'PENDING'>, outcome: string) => void;
  /** Clears an exception with an action (always logged). PUSH_BACK needs a note; REASSIGN takes ownerId. */
  decideException: (ex: Exception, action: ExceptionAction, note: string, opts?: { ownerId?: string; conditional?: boolean }) => boolean;

  instantiateProjectPlan: (projectId: string) => void;
  /** Starts the workflow: a new project at CE with the full template plan scheduled from startDate. Returns its id. */
  createProject: (input: NewProject) => string;
  /** Lead raises a request to another team/department and assigns the engineer who follows it up (gets a linked task). */
  raiseRequest: (input: RaiseRequestInput) => string;
  /** Lead (re)assigns a plan activity to an engineer; the engineer is notified and emailed. */
  assignActivity: (projectId: string, activityId: string, ownerId: string) => void;
}

export interface NewProject { name: string; teamId: string; customer?: string; startDate: string; engineerIds: string[] }
export interface RaiseRequestInput {
  toId: string; toKind: 'TEAM' | 'DEPT'; title: string; teamId: string; ownerId: string; neededBy: string;
  projectId?: string | null; stage?: StageCode; activityId?: string | null;
}

export type Store = AppData & Actions;

export function initialData(): AppData {
  const s = buildInitialState();
  return {
    ...s,
    currentPersonId: headId(s),
    seq: 0,
    clearedExceptions: {},
    actionLog: [],
    meetings: [],
    moms: [],
    emails: [],
    notifications: [],
  };
}

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      /** Returns a fresh runtime id and bumps the counter. */
      const nextId = (prefix: string) => {
        const seq = get().seq + 1;
        set({ seq });
        return `${prefix}-u${seq}`;
      };
      const me = () => get().currentPersonId;
      const today = () => get().demoToday;
      const log = (action: string, entityId: string, note?: string) => {
        const id = nextId('act');
        set((s) => ({ actionLog: [...s.actionLog, { id, at: s.demoToday, byId: s.currentPersonId, action, entityId, note }] }));
        refreshRag(entityId);
      };
      /** Every change is logged, so this is the one place project RAG goes live: find the project the entity belongs to. */
      const refreshRag = (entityId: string) => {
        const s = get();
        const pids = new Set<string>();
        for (const part of entityId.split(':')) {
          if (s.projects.some((p) => p.id === part)) pids.add(part);
          const t = s.tasks.find((x) => x.id === part);
          const r = s.requests.find((x) => x.id === part);
          const d = s.decisions.find((x) => x.id === part);
          const pid = t?.projectId ?? r?.projectId ?? d?.projectId ?? s.tasks.find((x) => x.id === (r?.taskId ?? d?.taskId))?.projectId;
          if (pid) pids.add(pid);
        }
        if (!pids.size) return;
        set((st) => ({ projects: st.projects.map((p) => (pids.has(p.id) ? { ...p, rag: liveRag(p, st.tasks, st.demoToday) } : p)) }));
      };
      const patchTask = (id: string, fn: (t: Task) => Task) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? fn(t) : t)) }));
      /** Activity ids are `${projectId}:${activityId}`. */
      const patchActivity = (id: string, fn: (a: PlanActivity) => PlanActivity) => {
        const [pid, aid] = id.split(':');
        set((s) => ({ projects: s.projects.map((p) => (p.id !== pid || !p.plan ? p : { ...p, plan: p.plan.map((a) => (a.activityId === aid ? fn(a) : a)) })) }));
      };
      const patchRequest = (id: string, fn: (r: Request) => Request) =>
        set((s) => ({ requests: s.requests.map((r) => (r.id === id ? fn(r) : r)) }));
      const change = (c: Omit<DateChange, 'id' | 'byId' | 'at'>): DateChange => {
        const dc = { ...c, id: nextId('dc'), byId: me(), at: today() };
        // Days booked to another department: tell its lead (they can dispute on the ledger).
        const s = get();
        const days = daysBetween(c.from, c.to);
        const lead = c.attributedTo ? leaderOf(s, c.attributedTo) : '';
        if (lead && lead !== me() && c.field === 'forecast' && c.entity !== 'request' && days > 0)
          get().notify(lead, 'INFO', `${days}d booked to your team (${c.reasonCode}). Dispute it on the delay ledger if it is wrong.`, dc.id, '/ledger');
        return dc;
      };

      const runPropagation = (requestId: string) => {
        const s = get();
        const req = s.requests.find((r) => r.id === requestId);
        if (!req) return;
        set(propagateRequestDate(s, req, { byId: me(), at: today(), nextId: () => nextId('dc') }));
      };

      return {
        ...initialData(),

        resetDemo: () => set(initialData()),
        setDemoToday: (date) => set({ demoToday: date }),
        setPersona: (personId) => set({ currentPersonId: personId }),
        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        logAction: log,
        notify: (toId, kind, text, relatedId, link) => {
          const id = nextId('ntf');
          set((s) => ({ notifications: [...s.notifications, { id, at: s.demoToday, toId, kind, text, relatedId, link }] }));
        },
        markNotificationsRead: (personId) =>
          set((s) => ({ notifications: s.notifications.map((n) => (n.toId === personId && !n.read ? { ...n, read: true } : n)) })),
        sendEmail: (email) => {
          const id = nextId('eml');
          set((s) => ({ emails: [...s.emails, { ...email, id, at: email.at ?? s.demoToday }] }));
          return id;
        },

        createTask: (input) => {
          const s = get();
          const ownerIds = input.ownerIds?.length ? input.ownerIds : [s.currentPersonId];
          const teamId = input.teamId ?? s.people.find((p) => p.id === ownerIds[0])?.teamId ?? '';
          const date = input.forecastDate ?? s.demoToday;
          const id = nextId('tsk');
          const task: Task = {
            id, title: input.title, teamId, projectId: input.projectId ?? null, stage: input.stage, ownerIds,
            size: input.size ?? 'S', status: 'OPEN', waitingOn: null, baselineDate: date, committedDate: date,
            forecastDate: date, lastUpdatedAt: s.demoToday, source: input.source ?? 'user', momId: input.momId,
          };
          set((st) => ({ tasks: [...st.tasks, task] }));
          const others = ownerIds.filter((o) => o !== s.currentPersonId);
          for (const o of others) get().notify(o, 'ASSIGNMENT', `New task: ${task.title}`, id, '/my-day');
          if (others.length) get().sendEmail({
            kind: 'ASSIGNMENT', toIds: others, ccIds: [s.currentPersonId], relatedId: id,
            subject: `New task: ${task.title} (due ${fmtShort(date)})`,
            html: `<p>You have a new task.</p><p><b>${task.title}</b><br/>Forecast: ${fmtShort(date)}</p>`,
          });
          log('TASK_CREATE', id);
          if (input.waitingOn) get().setWaitingOn(id, input.waitingOn);
          return id;
        },

        updateTask: (id, patch) => {
          if (id.includes(':')) { if (patch.status) patchActivity(id, (a) => ({ ...a, status: patch.status!, actualEnd: patch.status === 'DONE' ? a.actualEnd : undefined })); }
          else patchTask(id, (t) => ({ ...t, ...patch, lastUpdatedAt: today() }));
          log('TASK_UPDATE', id, Object.keys(patch).join(','));
        },

        completeTask: (id) => {
          if (id.includes(':')) patchActivity(id, (a) => ({ ...a, status: 'DONE', actualEnd: today() }));
          else patchTask(id, (t) => ({ ...t, status: 'DONE', doneDate: today(), lastUpdatedAt: today() }));
          log('TASK_COMPLETE', id);
        },

        moveForecast: (entity, id, newDate, reasonCode, note, attributedTo) => {
          if (!reasonCode?.trim() || !newDate) return false;
          const s = get();
          if (entity === 'request') return get().commitRequest(id, newDate, reasonCode, note, attributedTo);
          // Test failure / design change: a note is required and it goes to the head for approval (re-test, or change after freeze).
          const loop = reasonCode === 'TEST_FAIL' || reasonCode === 'DESIGN_CHANGE';
          if (loop && !note?.trim()) return false;
          const loopAsk = (title: string, projectId: string | undefined, from: string) => {
            if (!loop) return;
            const p = s.projects.find((x) => x.id === projectId);
            const frozen = !!p && ['DV', 'PP', 'MP'].includes(p.stage); // Proto signed off = design freeze
            const what = reasonCode === 'TEST_FAIL' ? 'Test failure: re-test plan' : frozen ? 'Design change after design freeze' : 'Design change';
            get().raiseAsk({ kind: 'APPROVAL', title: `${what}: ${title}`, ask: `${note} (moved ${fmtShort(from)} → ${fmtShort(newDate)})`, projectId });
          };
          if (entity === 'task') {
            const t = s.tasks.find((x) => x.id === id);
            if (!t || t.forecastDate === newDate) return false;
            const c = change({ entity, entityId: id, field: 'forecast', from: t.forecastDate, to: newDate, reasonCode, note, attributedTo });
            patchTask(id, (x) => ({ ...x, forecastDate: newDate, lastUpdatedAt: s.demoToday }));
            set((st) => ({ dateChanges: [...st.dateChanges, c] }));
            log('FORECAST_MOVE', id, `${fmtShort(t.forecastDate)} → ${fmtShort(newDate)} (${reasonCode})`);
            loopAsk(t.title, t.projectId ?? undefined, t.forecastDate);
            return true;
          }
          const [projectId, activityId] = id.split(':');
          const p = s.projects.find((x) => x.id === projectId);
          const i = p?.plan?.findIndex((a) => a.activityId === activityId) ?? -1;
          if (!p?.plan || i < 0 || p.plan[i].forecastEnd === newDate) return false;
          const a = p.plan[i];
          const changes = [change({ entity, entityId: id, field: 'forecast', from: a.forecastEnd, to: newDate, reasonCode, note, attributedTo })];
          const plan = [...p.plan];
          plan[i] = { ...a, forecastEnd: newDate };
          const ctx = { byId: me(), at: s.demoToday, nextId: () => nextId('dc') };
          const cascaded = cascadePlan(projectId, plan, i, attributedTo ?? a.dependencyTeam ?? p.teamId, ctx, changes);
          set((st) => ({
            projects: st.projects.map((x) => (x.id === projectId ? { ...x, plan: cascaded } : x)),
            dateChanges: [...st.dateChanges, ...changes],
          }));
          log('FORECAST_MOVE', id, `${fmtShort(a.forecastEnd)} → ${fmtShort(newDate)} (${reasonCode})`);
          loopAsk(`${a.name} · ${p.name}`, projectId, a.forecastEnd);
          return true;
        },

        setWaitingOn: (taskId, waitingOn) => {
          const s = get();
          const t = s.tasks.find((x) => x.id === taskId);
          if (!t) return undefined;
          let requestId: string | undefined;
          let w = waitingOn;
          if (w && (w.kind === 'TEAM' || w.kind === 'DEPT')) {
            const prev = t.waitingOn;
            const same = prev && (prev.kind === 'TEAM' || prev.kind === 'DEPT') && prev.id === w.id && prev.requestId;
            requestId = same ? prev.requestId : get().createRequest({
              toId: w.id, toKind: w.kind, title: t.title, blocks: t.title, fromTeamId: t.teamId,
              projectId: t.projectId, taskId: t.id, requestedDate: t.forecastDate,
            });
            w = { ...w, requestId };
          }
          if (w?.kind === 'HEAD') get().notify(headId(s), 'ESCALATION', `Waiting on you: ${t.title}`, taskId, '/tower');
          patchTask(taskId, (x) => ({
            ...x, waitingOn: w, lastUpdatedAt: s.demoToday,
            status: w && w.kind !== 'NOTE' ? 'BLOCKED' : x.status === 'BLOCKED' ? 'OPEN' : x.status,
          }));
          log('WAITING_ON', taskId, w ? (w.kind === 'NOTE' ? w.note : w.kind === 'HEAD' ? 'HEAD' : w.id) : 'cleared');
          return requestId;
        },

        createRequest: (input) => {
          const s = get();
          const id = nextId('req');
          const project = s.projects.find((p) => p.id === input.projectId);
          const tat = input.plannedTatDays ?? (input.activityId
            ? project?.plan?.find((a) => a.activityId === input.activityId)?.plannedDays ?? null
            : null);
          const fromTeamId = input.fromTeamId ?? s.people.find((p) => p.id === s.currentPersonId)?.teamId ?? '';
          const req: Request = {
            id, fromTeamId, toId: input.toId, toKind: input.toKind, title: input.title, blocks: input.blocks ?? input.title,
            projectId: input.projectId ?? null, taskId: input.taskId ?? null, activityId: input.activityId ?? null,
            raisedById: s.currentPersonId, raisedAt: s.demoToday, status: 'OPEN', requestedDate: input.requestedDate ?? null,
            committedDate: null, plannedTatDays: tat, comments: [],
            history: [{ at: s.demoToday, byId: s.currentPersonId, type: 'RAISED' }],
          };
          set((st) => ({
            requests: [...st.requests, req],
            projects: input.activityId
              ? st.projects.map((p) => p.id !== input.projectId || !p.plan ? p : {
                ...p, plan: p.plan.map((a) => (a.activityId === input.activityId ? { ...a, requestId: id, status: 'BLOCKED' as const } : a)),
              })
              : st.projects,
          }));
          const lead = leaderOf(s, input.toId);
          get().notify(lead, 'REQUEST', `New request: ${req.title}`, id, `/requests?id=${id}`);
          get().sendEmail({
            kind: 'REQUEST', toIds: [lead], ccIds: [s.currentPersonId], relatedId: id,
            subject: `Request ${id}: ${req.title}`,
            html: `<p>A new request has been raised to your team.</p><p><b>${req.title}</b><br/>Blocks: ${req.blocks}<br/>Requested by: ${req.requestedDate ?? 'not set'}${tat ? `<br/>Planned TAT: ${tat} days` : ''}</p><p>Please acknowledge and commit a date.</p>`,
          });
          log('REQUEST_RAISE', id);
          return id;
        },

        acknowledgeRequest: (id) => {
          patchRequest(id, (r) => ({ ...r, status: 'ACKNOWLEDGED', history: [...r.history, { at: today(), byId: me(), type: 'ACKNOWLEDGED' }] }));
          log('REQUEST_ACK', id);
        },

        commitRequest: (id, date, reasonCode, note, attributedTo) => {
          const r = get().requests.find((x) => x.id === id);
          if (!r || !date) return false;
          const recommit = !!r.committedDate && r.committedDate !== date;
          if (recommit && !reasonCode?.trim()) return false;
          if (recommit) {
            const c = change({ entity: 'request', entityId: id, field: 'committed', from: r.committedDate!, to: date, reasonCode: reasonCode!, note, attributedTo });
            set((s) => ({ dateChanges: [...s.dateChanges, c] }));
          }
          patchRequest(id, (x) => ({
            ...x, status: 'COMMITTED', committedDate: date,
            history: [...x.history, { at: today(), byId: me(), type: 'COMMITTED', detail: recommit ? `${fmtShort(r.committedDate!)} → ${fmtShort(date)} (${reasonCode})` : fmtShort(date) }],
          }));
          get().notify(r.raisedById, 'COMMITMENT', `${r.title}: committed ${fmtShort(date)}`, id, `/requests?id=${id}`);
          get().sendEmail({
            kind: 'COMMITMENT', toIds: [r.raisedById], ccIds: [me()], relatedId: id,
            subject: `${recommit ? 'Re-committed' : 'Committed'}: ${r.title} by ${fmtShort(date)}`,
            html: `<p><b>${r.title}</b> is committed for <b>${fmtShort(date)}</b>.</p>${recommit ? `<p>Moved from ${fmtShort(r.committedDate!)} (${reasonCode})${note ? `: ${note}` : ''}</p>` : ''}`,
          });
          log('REQUEST_COMMIT', id, date);
          runPropagation(id);
          refreshRag(id);
          return true;
        },

        acceptRequest: (id) => {
          patchRequest(id, (r) => ({ ...r, status: 'ACCEPTED', history: [...r.history, { at: today(), byId: me(), type: 'ACCEPTED' }] }));
          log('REQUEST_ACCEPT', id);
        },

        deliverRequest: (id, note) => {
          const s = get();
          const r = s.requests.find((x) => x.id === id);
          if (!r) return;
          patchRequest(id, (x) => ({ ...x, status: 'DONE', deliveredAt: s.demoToday, history: [...x.history, { at: today(), byId: me(), type: 'DONE', detail: note }] }));
          if (r.taskId) patchTask(r.taskId, (t) => ({ ...t, waitingOn: null, status: t.status === 'BLOCKED' ? 'IN_PROGRESS' : t.status, lastUpdatedAt: s.demoToday }));
          if (r.projectId && r.activityId) patchActivity(`${r.projectId}:${r.activityId}`, (a) => ({ ...a, status: a.status === 'BLOCKED' ? 'IN_PROGRESS' : a.status }));
          const late = r.committedDate && s.demoToday > r.committedDate ? ` (${daysBetween(r.committedDate, s.demoToday)}d after the commitment)` : '';
          get().notify(r.raisedById, 'COMMITMENT', `Delivered: ${r.title}. Confirm you received it.`, id, `/requests?id=${id}`);
          get().sendEmail({ kind: 'COMMITMENT', toIds: [r.raisedById], ccIds: [me()], relatedId: id, subject: `Delivered: ${r.title}`,
            html: `<p><b>${r.title}</b> was marked delivered on ${fmtShort(s.demoToday)}${late}.</p>${note ? `<p>${note}</p>` : ''}<p>Please confirm you received it.</p>` });
          log('REQUEST_DELIVERED', id, note);
        },

        confirmDelivery: (id, received, note) => {
          const s = get();
          const r = s.requests.find((x) => x.id === id);
          if (!r || r.status !== 'DONE') return;
          if (received) {
            patchRequest(id, (x) => ({ ...x, receivedAt: s.demoToday, history: [...x.history, { at: today(), byId: me(), type: 'ACCEPTED', detail: 'Received' }] }));
            log('REQUEST_RECEIVED', id);
            return;
          }
          const cid = nextId('cmt');
          patchRequest(id, (x) => ({ ...x, status: 'COMMITTED', deliveredAt: undefined,
            comments: [...x.comments, { id: cid, byId: me(), at: today(), text: `Not received: ${note ?? ''}` }],
            history: [...x.history, { at: today(), byId: me(), type: 'COUNTERED', detail: `Not received${note ? `: ${note}` : ''}` }] }));
          if (r.taskId) patchTask(r.taskId, (t) => ({ ...t, waitingOn: { kind: r.toKind, id: r.toId, requestId: r.id }, status: 'BLOCKED' }));
          const lead = leaderOf(s, r.toId);
          if (lead) get().notify(lead, 'REQUEST', `Not received: ${r.title}${note ? ` (${note})` : ''}`, id, `/requests?id=${id}`);
          log('REQUEST_NOT_RECEIVED', id, note);
        },

        disputeChange: (changeId, note) => {
          const s = get();
          const c = s.dateChanges.find((x) => x.id === changeId);
          if (!c || !c.attributedTo || c.dispute || !note.trim()) return undefined;
          const team = s.teams.find((t) => t.id === c.attributedTo)?.name ?? c.attributedTo;
          const what = c.entity === 'task' ? s.tasks.find((t) => t.id === c.entityId)?.title : c.entityId;
          const askId = get().raiseAsk({ kind: 'DECISION', title: `Dispute: ${daysBetween(c.from, c.to)}d booked to ${team}`, ask: `${what ?? c.entityId} (${c.reasonCode}). ${note}` });
          set((st) => ({
            decisions: st.decisions.map((d) => (d.id === askId ? { ...d, changeId } : d)),
            dateChanges: st.dateChanges.map((x) => (x.id === changeId ? { ...x, dispute: { askId, status: 'OPEN' } } : x)),
          }));
          return askId;
        },

        counterRequest: (id, proposedDate, note) => {
          const cid = nextId('cmt');
          patchRequest(id, (r) => ({
            ...r, status: 'ACKNOWLEDGED', requestedDate: proposedDate,
            comments: [...r.comments, { id: cid, byId: me(), at: today(), text: note }],
            history: [...r.history, { at: today(), byId: me(), type: 'COUNTERED', detail: `${fmtShort(proposedDate)}: ${note}` }],
          }));
          log('REQUEST_COUNTER', id, proposedDate);
        },

        commentRequest: (id, text) => {
          const cid = nextId('cmt');
          patchRequest(id, (r) => ({
            ...r,
            comments: [...r.comments, { id: cid, byId: me(), at: today(), text }],
            history: [...r.history, { at: today(), byId: me(), type: 'COMMENTED' }],
          }));
        },

        raiseAsk: ({ kind, title, ask, taskId, proposedDate, projectId, stage }) => {
          const s = get();
          const id = nextId('ask');
          const me = s.people.find((p) => p.id === s.currentPersonId)!;
          const task = taskId ? s.tasks.find((t) => t.id === taskId) : undefined;
          set((st) => ({ decisions: [...st.decisions, { id, teamId: task?.teamId ?? me.teamId, title, ask, raisedById: me.id, kind, status: 'PENDING', raisedOn: st.demoToday, taskId, proposedDate, projectId, stage }] }));
          if (task) patchTask(task.id, (t) => ({ ...t, waitingOn: { kind: 'HEAD' }, lastUpdatedAt: s.demoToday }));
          const head = headId(s);
          get().notify(head, 'ESCALATION', `${ASK_LABEL[kind]} needed: ${title}`, id, '/tower');
          get().sendEmail({ kind: 'ESCALATION', toIds: [head], ccIds: [leaderOf(s, me.teamId)].filter((x) => x !== me.id), relatedId: id,
            subject: `${ASK_LABEL[kind]} needed from you: ${title}`,
            html: `<p><b>${me.name}</b> asks for ${ASK_LABEL[kind].toLowerCase()}: <b>${title}</b></p>${ask ? `<p>${ask}</p>` : ''}${proposedDate ? `<p>New date asked: ${proposedDate}</p>` : ''}` });
          log('ASK_RAISED', id, ASK_LABEL[kind]);
          return id;
        },

        requestGate: (projectId, lessons) => {
          const s = get();
          const p = s.projects.find((x) => x.id === projectId);
          if (!p) return undefined; // on hold is fine: a re-review after fixes
          const g = gateChecklist(p);
          if (!g.ready || s.decisions.some((d) => d.kind === 'GATE' && d.projectId === projectId && d.status === 'PENDING')) return undefined;
          const label = p.stage === 'PROTO' ? 'Proto' : p.stage;
          const askId = get().raiseAsk({ kind: 'GATE', title: `${p.name}: ${label} gate`, ask: `All ${g.total} ${label} deliverables signed off. Go to ${nextStage(p.stage) ?? 'close'}?`, projectId, stage: p.stage });
          if (lessons?.trim()) set((st) => ({ decisions: st.decisions.map((d) => (d.id === askId ? { ...d, lessons: lessons.trim() } : d)) }));
          return askId;
        },

        decideDecision: (id, status, outcome) => {
          set((s) => ({ decisions: s.decisions.map((d) => (d.id === id ? { ...d, status, outcome } : d)) }));
          log(`DECISION_${status}`, id, outcome);
        },

        decideException: (ex, action, note, opts) => {
          if (action === 'PUSH_BACK' && !note.trim()) return false;
          if (action === 'REASSIGN' && !opts?.ownerId) return false;
          const s = get();
          const entity = ex.entityId;
          const task = s.tasks.find((t) => t.id === entity);
          if (s.decisions.some((d) => d.id === entity)) {
            const d0 = s.decisions.find((x) => x.id === entity)!;
            if (d0.taskId && s.tasks.some((t) => t.id === d0.taskId)) {
              // Answered either way: the task stops waiting on the head. An approved extension becomes the new commitment.
              patchTask(d0.taskId, (t) => ({ ...t, waitingOn: t.waitingOn?.kind === 'HEAD' ? null : t.waitingOn, lastUpdatedAt: s.demoToday }));
              const t = s.tasks.find((x) => x.id === d0.taskId)!;
              if (action === 'DECIDE' && d0.kind === 'DATE_EXTENSION' && d0.proposedDate && d0.proposedDate !== t.committedDate) {
                const c1 = change({ entity: 'task', entityId: t.id, field: 'forecast', from: t.forecastDate, to: d0.proposedDate, reasonCode: 'HEAD_APPROVED_EXTENSION', note });
                const c2 = change({ entity: 'task', entityId: t.id, field: 'committed', from: t.committedDate, to: d0.proposedDate, reasonCode: 'HEAD_APPROVED_EXTENSION', note });
                patchTask(t.id, (x) => ({ ...x, forecastDate: d0.proposedDate!, committedDate: d0.proposedDate! }));
                set((st) => ({ dateChanges: [...st.dateChanges, c1, c2] }));
              }
            }
            if (d0.changeId && (action === 'DECIDE' || action === 'PUSH_BACK')) {
              // Dispute upheld: the days come off that department (unattributed). Rejected: the booking stands.
              set((st) => ({ dateChanges: st.dateChanges.map((x) => (x.id !== d0.changeId ? x
                : { ...x, attributedTo: action === 'DECIDE' ? undefined : x.attributedTo, dispute: { askId: d0.id, status: action === 'DECIDE' ? 'UPHELD' : 'REJECTED' } })) }));
            }
            if (d0.kind === 'GATE' && d0.projectId) {
              const p = s.projects.find((x) => x.id === d0.projectId)!;
              if (action === 'DECIDE') {
                set((st) => ({ projects: st.projects.map((x) => (x.id === p.id ? advanceStage(x) : x)) }));
                if (opts?.conditional && note) get().createTask({ title: `Gate conditions (${p.name}): ${note}`, ownerIds: [p.ownerId], teamId: p.teamId, projectId: p.id, forecastDate: addWorkingDays(s.demoToday, 5), size: 'M' });
                log(opts?.conditional ? 'GATE_CONDITIONAL_GO' : 'GATE_GO', p.id, note);
              } else if (action === 'PUSH_BACK') {
                set((st) => ({ projects: st.projects.map((x) => (x.id === p.id ? { ...x, onHold: true } : x)) }));
                log('GATE_HOLD', p.id, note);
              }
            }
            if (action === 'REASSIGN') {
              // "Bring someone in": they get a linked task; the ask is answered.
              const who = s.people.find((p) => p.id === opts!.ownerId)!;
              get().createTask({ title: `${d0.title} (support asked by R&D head)`, ownerIds: [who.id], teamId: who.teamId, projectId: d0.taskId ? s.tasks.find((t) => t.id === d0.taskId)?.projectId ?? null : null, forecastDate: addWorkingDays(s.demoToday, 3), size: 'M' });
              get().decideDecision(entity, 'DECIDED', `Brought in ${who.name}${note ? `: ${note}` : ''}`);
              get().notify(d0.raisedById, 'ESCALATION', `R&D head brought in ${who.name}: ${d0.title}`, d0.id, '/my-day');
            }
            if (action === 'DECIDE' || action === 'PUSH_BACK') {
              get().decideDecision(entity, action === 'DECIDE' ? 'DECIDED' : 'PUSHED_BACK', note);
              const d = s.decisions.find((x) => x.id === entity)!;
              const verb = d.kind === 'GATE' ? (action === 'DECIDE' ? (opts?.conditional ? 'Conditional go' : 'Go') : 'Hold') : d.kind === 'APPROVAL' || d.kind === 'DATE_EXTENSION' ? (action === 'DECIDE' ? 'Approved' : 'Rejected') : d.kind === 'INPUT' ? (action === 'DECIDE' ? 'Answered' : 'Pushed back') : action === 'DECIDE' ? 'Decided' : 'Pushed back';
              // ponytail: seed has no decision→task link; match same-team tasks waiting on the head by title prefix.
              if (action === 'DECIDE') for (const t of s.tasks) {
                if (t.teamId === d.teamId && t.waitingOn?.kind === 'HEAD' && d.title.startsWith(t.title.split(':')[0])) get().setWaitingOn(t.id, null);
              }
              get().notify(d.raisedById, 'ESCALATION', `${verb}: ${d.title}`, d.id, `/team/${d.teamId}`);
              get().sendEmail({
                kind: 'ESCALATION', toIds: [d.raisedById], ccIds: [leaderOf(s, d.teamId)], relatedId: d.id,
                subject: `${verb} by R&D head: ${d.title}`,
                html: `<p><b>${d.title}</b></p><p>${verb}${note ? `: ${note}` : '.'}</p>`,
              });
            }
          } else if (task) {
            if (ex.ruleId === 'R3' && (action === 'DECIDE' || action === 'PUSH_BACK')) get().setWaitingOn(task.id, null);
            if (ex.ruleId === 'R7' && action === 'DECIDE') for (const o of task.ownerIds) get().notify(o, 'INFO', `Overdue: close or re-forecast "${task.title}"${note ? ` (${note})` : ''}`, task.id, '/my-day');
            if (action === 'REASSIGN') get().updateTask(task.id, { ownerIds: [opts!.ownerId!] });
            if (action === 'ACCEPT_DATE' && task.committedDate !== task.forecastDate) {
              const c = change({ entity: 'task', entityId: task.id, field: 'committed', from: task.committedDate, to: task.forecastDate, reasonCode: 'ACCEPTED_NEW_DATE', note });
              patchTask(task.id, (t) => ({ ...t, committedDate: t.forecastDate, lastUpdatedAt: s.demoToday }));
              set((st) => ({ dateChanges: [...st.dateChanges, c] }));
            }
          } else if (entity.includes(':') && action === 'ACCEPT_DATE') {
            const [projectId, activityId] = entity.split(':');
            const p = s.projects.find((x) => x.id === projectId);
            const a = p?.plan?.find((x) => x.activityId === activityId);
            if (a && a.committedEnd !== a.forecastEnd) {
              const c = change({ entity: 'activity', entityId: entity, field: 'committed', from: a.committedEnd, to: a.forecastEnd, reasonCode: 'ACCEPTED_NEW_DATE', note });
              set((st) => ({
                projects: st.projects.map((x) => x.id !== projectId || !x.plan ? x
                  : { ...x, plan: x.plan.map((y) => (y.activityId === activityId ? { ...y, committedEnd: y.forecastEnd } : y)) }),
                dateChanges: [...st.dateChanges, c],
              }));
            }
          }
          set((st) => ({ clearedExceptions: { ...st.clearedExceptions, [ex.id]: { action, note, byId: st.currentPersonId, at: st.demoToday } } }));
          log(`EXCEPTION_${action}`, ex.id, note);
          return true;
        },

        instantiateProjectPlan: (projectId) => {
          const s = get();
          const p = s.projects.find((x) => x.id === projectId);
          if (!p || p.plan) return;
          const team = s.people.filter((x) => x.teamId === p.teamId && x.role === 'ENGINEER' && !x.deckNoTasksLogged).map((x) => x.id);
          const fromTasks = s.tasks.find((t) => t.projectId === projectId)?.ownerIds[0];
          const inchargeId = fromTasks ?? team[0] ?? p.ownerId;
          const plan = instantiatePlan(template, p, { leaderId: p.ownerId, inchargeId, memberIds: team, sourcingId: 'p-sourcing-lead' }, s.demoToday);
          set((st) => ({ projects: st.projects.map((x) => (x.id === projectId ? { ...x, plan, templateId: template.templateId } : x)) }));
          log('PLAN_INSTANTIATE', projectId);
        },

        createProject: (input) => {
          const s = get();
          const leaderId = s.teams.find((t) => t.id === input.teamId)?.leaderId ?? s.currentPersonId;
          const start = nextWorkingDay(input.startDate);
          const ceEnd = addWorkingDays(start, template.stages[0].plannedDays - 1);
          const owners = { leaderId, inchargeId: input.engineerIds[0] ?? leaderId, memberIds: input.engineerIds, sourcingId: 'p-sourcing-lead' };
          const plan = applyProgress(scheduleTemplate(template, { stage: 'CE', endDate: ceEnd }, owners), 'CE', s.demoToday);
          const id = nextId('prj');
          const project: Project = {
            id, name: input.name, teamId: input.teamId, customer: input.customer || null, stage: 'CE', onHold: false,
            nextMilestone: 'CE closure', nextMilestoneDate: ceEnd, rag: 'green', ownerId: leaderId, templateId: template.templateId, plan,
          };
          set((st) => ({ projects: [project, ...st.projects] }));
          for (const e of input.engineerIds) {
            const mine = plan.filter((a) => a.ownerId === e);
            get().notify(e, 'ASSIGNMENT', `You are on ${input.name}: ${mine.length} activities`, id, `/projects/${id}`);
          }
          if (input.engineerIds.length) get().sendEmail({
            kind: 'ASSIGNMENT', toIds: input.engineerIds, ccIds: [s.currentPersonId], relatedId: id,
            subject: `New project: ${input.name} (CE closure ${fmtShort(ceEnd)})`,
            html: `<p>You have been assigned to <b>${input.name}</b>${input.customer ? ` for ${input.customer}` : ''}.</p><p>The stage-gate plan (CE → Proto → DV → PP → MP, ${plan.length} activities) starts ${fmtShort(start)}. CE closes ${fmtShort(ceEnd)}.</p>`,
          });
          log('PROJECT_CREATE', id, input.name);
          return id;
        },

        raiseRequest: (input) => {
          const taskId = get().createTask({ title: input.title, ownerIds: [input.ownerId], teamId: input.teamId, projectId: input.projectId ?? null, stage: input.stage, forecastDate: input.neededBy });
          const rid = get().createRequest({
            toId: input.toId, toKind: input.toKind, title: input.title, blocks: input.title, fromTeamId: input.teamId,
            projectId: input.projectId ?? null, taskId, activityId: input.activityId ?? null, requestedDate: input.neededBy,
          });
          patchTask(taskId, (x) => ({ ...x, waitingOn: { kind: input.toKind, id: input.toId, requestId: rid }, status: 'BLOCKED' }));
          log('REQUEST_RAISE', rid, input.title);
          return rid;
        },

        assignActivity: (projectId, activityId, ownerId) => {
          const p = get().projects.find((x) => x.id === projectId);
          const a = p?.plan?.find((x) => x.activityId === activityId);
          if (!p || !a || a.ownerId === ownerId) return;
          set((st) => ({ projects: st.projects.map((x) => x.id !== projectId || !x.plan ? x : { ...x, plan: x.plan.map((y) => (y.activityId === activityId ? { ...y, ownerId } : y)) }) }));
          get().notify(ownerId, 'ASSIGNMENT', `Assigned: ${a.sNo} ${a.name}`, projectId, `/projects/${projectId}`);
          get().sendEmail({ kind: 'ASSIGNMENT', toIds: [ownerId], ccIds: [get().currentPersonId], relatedId: projectId,
            subject: `Assigned: ${a.sNo} ${a.name} · ${p.name}`, html: `<p>You now own <b>${a.sNo} ${a.name}</b> on <b>${p.name}</b>, due ${fmtShort(a.forecastEnd)}.</p>` });
          log('ACTIVITY_ASSIGN', `${projectId}:${activityId}`, ownerId);
        },
      };
    },
    {
      name: 'rd-control-tower',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Data only; a schema bump simply restarts from the seed.
      partialize: (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function')) as AppData,
      migrate: () => initialData() as unknown as Store,
    },
  ),
);

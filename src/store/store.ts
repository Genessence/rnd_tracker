// The one Zustand store, persisted to localStorage. Domain logic stays in src/domain; actions call it.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { buildInitialState, template, type SeedState } from '../domain/seed';
import { cascadePlan, headId, leaderOf, propagateRequestDate } from '../domain/rules';
import { applyProgress, instantiatePlan, scheduleTemplate } from '../domain/scheduler';
import { addWorkingDays, fmtShort, nextWorkingDay } from '../lib/dates';
import type {
  ActionLogEntry,
  DateChange,
  DateEntity,
  Decision,
  Email,
  Exception,
  ExceptionAction,
  Meeting,
  Mom,
  Notification,
  Project,
  Request,
  Settings,
  Size,
  StageCode,
  Task,
  WaitingOn,
} from '../domain/types';

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
  counterRequest: (id: string, proposedDate: string, note: string) => void;
  commentRequest: (id: string, text: string) => void;

  decideDecision: (id: string, status: Exclude<Decision['status'], 'PENDING'>, outcome: string) => void;
  /** Clears an exception with an action (always logged). PUSH_BACK needs a note; REASSIGN takes ownerId. */
  decideException: (ex: Exception, action: ExceptionAction, note: string, opts?: { ownerId?: string }) => boolean;

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
      };
      const patchTask = (id: string, fn: (t: Task) => Task) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? fn(t) : t)) }));
      const patchRequest = (id: string, fn: (r: Request) => Request) =>
        set((s) => ({ requests: s.requests.map((r) => (r.id === id ? fn(r) : r)) }));
      const change = (c: Omit<DateChange, 'id' | 'byId' | 'at'>): DateChange => ({ ...c, id: nextId('dc'), byId: me(), at: today() });

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
          patchTask(id, (t) => ({ ...t, ...patch, lastUpdatedAt: today() }));
          log('TASK_UPDATE', id, Object.keys(patch).join(','));
        },

        completeTask: (id) => {
          patchTask(id, (t) => ({ ...t, status: 'DONE', doneDate: today(), lastUpdatedAt: today() }));
          log('TASK_COMPLETE', id);
        },

        moveForecast: (entity, id, newDate, reasonCode, note, attributedTo) => {
          if (!reasonCode?.trim() || !newDate) return false;
          const s = get();
          if (entity === 'request') return get().commitRequest(id, newDate, reasonCode, note, attributedTo);
          if (entity === 'task') {
            const t = s.tasks.find((x) => x.id === id);
            if (!t || t.forecastDate === newDate) return false;
            const c = change({ entity, entityId: id, field: 'forecast', from: t.forecastDate, to: newDate, reasonCode, note, attributedTo });
            patchTask(id, (x) => ({ ...x, forecastDate: newDate, lastUpdatedAt: s.demoToday }));
            set((st) => ({ dateChanges: [...st.dateChanges, c] }));
            log('FORECAST_MOVE', id, `${fmtShort(t.forecastDate)} → ${fmtShort(newDate)} (${reasonCode})`);
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
          return true;
        },

        acceptRequest: (id) => {
          patchRequest(id, (r) => ({ ...r, status: 'ACCEPTED', history: [...r.history, { at: today(), byId: me(), type: 'ACCEPTED' }] }));
          log('REQUEST_ACCEPT', id);
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
            if (action === 'DECIDE' || action === 'PUSH_BACK') {
              get().decideDecision(entity, action === 'DECIDE' ? 'DECIDED' : 'PUSHED_BACK', note);
              const d = s.decisions.find((x) => x.id === entity)!;
              const verb = action === 'DECIDE' ? 'Decided' : 'Pushed back';
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

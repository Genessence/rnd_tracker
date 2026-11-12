// Simulated Microsoft Teams: meetings, invites, transcript and MOM publishing. Nothing leaves the browser.
import transcriptVtt from '../../seed/demo-meeting-transcript.vtt?raw';
import { extractMom, ownerFromText, parseVtt, resolveDate } from '../domain/mom-extractor';
import { isOpen, isOverdue } from '../domain/metrics';
import { parseMom } from '../domain/mom-upload';
import type { AgendaItem, Meeting, Mom, StageCode } from '../domain/types';
import { fmtDay, fmtShort } from '../lib/dates';
import { isRequestLive, shortTeam } from '../store/selectors';
import { useStore } from '../store/store';
import { sendEmail } from './mailer';
import { notify } from './notifications';

export const joinUrl = (id: string) => `https://teams.microsoft.com/l/meetup-join/DEMO-${id}`;
export const meetingDate = (m: Pick<Meeting, 'start'>) => m.start.slice(0, 10);
export const meetingTime = (m: Pick<Meeting, 'start'>) => m.start.slice(11, 16);

const name = (id: string) => useStore.getState().people.find((p) => p.id === id)?.name ?? id;
const teamName = (id: string) => shortTeam(useStore.getState().teams.find((t) => t.id === id)?.name ?? id);

/** Auto agenda: open requests, blocked and overdue items in scope. Text is "<Kind>: <detail>". */
export function buildAgenda(scope: Meeting['scope']): AgendaItem[] {
  const s = useStore.getState();
  if (!scope.projectId) return [];
  const items: AgendaItem[] = [];
  const tasks = s.tasks.filter((t) => t.projectId === scope.projectId && isOpen(t) && (!scope.stage || !t.stage || t.stage === scope.stage));
  for (const t of tasks) {
    const w = t.waitingOn;
    if (t.status === 'BLOCKED' || w?.kind === 'TEAM' || w?.kind === 'DEPT' || w?.kind === 'HEAD')
      items.push({ text: `Blocked: ${t.title}${w && w.kind !== 'NOTE' ? ` ⟶ ${w.kind === 'HEAD' ? 'R&D head' : teamName(w.id)}` : ''}`, refId: t.id });
  }
  for (const t of tasks) if (isOverdue(t, s.demoToday)) items.push({ text: `Overdue: ${t.title} (since ${fmtShort(t.forecastDate)})`, refId: t.id });
  for (const r of s.requests.filter((r) => r.projectId === scope.projectId && isRequestLive(r)))
    items.push({ text: `Open request: ${r.title} ⟶ ${teamName(r.toId)} (${r.status.toLowerCase()})`, refId: r.id });
  const plan = s.projects.find((p) => p.id === scope.projectId)?.plan ?? [];
  const late = plan.filter((a) => (!scope.stage || a.stage === scope.stage) && a.status !== 'DONE' && a.forecastEnd < s.demoToday && a.status !== 'BLOCKED');
  // ponytail: cap plan activities so the agenda stays readable; show "+N more" if someone asks
  for (const a of late.slice(0, 3)) items.push({ text: `Overdue: ${a.sNo} ${a.name} (since ${fmtShort(a.forecastEnd)})`, refId: `${scope.projectId}:${a.activityId}` });
  return items;
}

export interface NewMeeting {
  title: string;
  projectId?: string;
  stage?: StageCode;
  attendeeIds: string[];
  date: string;
  time: string;
  durationMin?: number;
  weekly: boolean;
}

/** Creates the meeting, its agenda and the INVITE email. Returns the meeting id. */
export function scheduleMeeting(input: NewMeeting): string {
  const s = useStore.getState();
  const id = `mtg-${s.meetings.length + 1}`;
  const scope = { projectId: input.projectId || undefined, stage: input.projectId ? input.stage : undefined };
  const m: Meeting = {
    id, title: input.title, scope, organiserId: s.currentPersonId, attendeeIds: input.attendeeIds,
    start: `${input.date}T${input.time}`, durationMin: input.durationMin ?? 60, recurrence: input.weekly ? 'weekly' : null,
    teamsJoinUrl: joinUrl(id), agenda: buildAgenda(scope), status: 'SCHEDULED',
  };
  useStore.setState((st) => ({ meetings: [...st.meetings, m] }));
  sendEmail({
    kind: 'INVITE', toIds: m.attendeeIds, ccIds: [m.organiserId], relatedId: id,
    subject: `Invitation: ${m.title} · ${fmtDay(input.date)} ${input.time}${input.weekly ? ' (weekly)' : ''}`,
    html: `<p>${name(m.organiserId)} invited you to a Microsoft Teams meeting.</p>
<p><b>${m.title}</b><br/>${fmtDay(input.date)}, ${input.time} (${m.durationMin} min)${input.weekly ? ', repeats weekly' : ''}</p>
<p><a href="${m.teamsJoinUrl}">Join the meeting now</a></p>
${m.agenda.length ? `<p><b>Agenda</b></p><ol>${m.agenda.map((a) => `<li>${a.text}</li>`).join('')}</ol>` : ''}`,
  });
  for (const a of m.attendeeIds) if (a !== m.organiserId) notify(a, `Meeting invite: ${m.title}`, `/meetings/${id}`);
  useStore.getState().logAction('MEETING_SCHEDULE', id);
  return id;
}

const patchMeeting = (id: string, patch: Partial<Meeting>) =>
  useStore.setState((s) => ({ meetings: s.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
const patchMom = (id: string, patch: Partial<Mom>) =>
  useStore.setState((s) => ({ moms: s.moms.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

/** "Simulate: meeting ended": loads the seed transcript. */
export function endMeeting(id: string) {
  patchMeeting(id, { status: 'ENDED', transcript: parseVtt(transcriptVtt) });
  useStore.getState().logAction('MEETING_END', id);
}

/** Runs the rule-based extractor and stores a DRAFT MOM. */
export function draftMom(meetingId: string): string {
  const s = useStore.getState();
  const m = s.meetings.find((x) => x.id === meetingId)!;
  const id = `mom-${s.moms.length + 1}`;
  const mom: Mom = { id, meetingId, status: 'DRAFT', points: m.agenda.map((a) => a.text), ...extractMom(m.transcript ?? [], meetingDate(m), s) };
  useStore.setState((st) => ({ moms: [...st.moms, mom] }));
  patchMeeting(meetingId, { momId: id });
  return id;
}

/** An ended meeting's MOM from an uploaded file (domain/mom-upload format) -> a draft to review and publish. */
export function uploadMom(meetingId: string, text: string, fileName = 'MOM.txt'): string[] {
  const s = useStore.getState();
  const m = s.meetings.find((x) => x.id === meetingId)!;
  const p = parseMom(s, text);
  if (!p.actions.length && !p.decisions.length) return p.errors.length ? p.errors : ['Nothing to import.'];
  const id = `mom-${s.moms.length + 1}`;
  const date = meetingDate(m);
  const mom: Mom = {
    id, meetingId, status: 'DRAFT',
    points: p.points.length ? p.points : m.agenda.map((a) => a.text),
    decisions: p.decisions.map((text) => ({ text })),
    actions: p.actions.map((a) => ({ text: a.text, ownerId: a.ownerId, dueDate: a.dueDate && a.dueDate >= date ? a.dueDate : undefined })),
    upload: { fileName, text, at: s.demoToday, byId: s.currentPersonId },
  };
  useStore.setState((st) => ({ moms: [...st.moms, mom] }));
  patchMeeting(meetingId, { momId: id });
  s.logAction('MOM_UPLOADED', id, fileName);
  return [];
}

export const updateMom = patchMom;

/** A decision that names a team and a date gets a follow-up task for that team's leader (e.g. Electronics, by the 19th). */
export function decisionFollowUp(text: string, m: Pick<Meeting, 'start'>) {
  const ownerId = ownerFromText(useStore.getState(), text);
  const due = resolveDate(text, meetingDate(m));
  return ownerId && due ? { ownerId, due } : null;
}

/** Publishes: one task per action (and per decision with an owner), the MOM record, an email and a notification to attendees. */
export function publishMom(momId: string) {
  const s = useStore.getState();
  const mom = s.moms.find((x) => x.id === momId)!;
  const m = s.meetings.find((x) => x.id === mom.meetingId)!;
  const { projectId, stage } = m.scope;
  const actions = mom.actions.map((a) => ({
    ...a,
    taskId: a.taskId ?? s.createTask({ title: a.text, ownerIds: a.ownerId ? [a.ownerId] : undefined, forecastDate: a.dueDate, projectId, stage, source: 'mom', momId, size: 'S' }),
  }));
  for (const d of mom.decisions) {
    const f = decisionFollowUp(d.text, m);
    if (f) s.createTask({ title: d.text, ownerIds: [f.ownerId], forecastDate: f.due, projectId, stage, source: 'mom', momId, size: 'S' });
  }
  patchMom(momId, { actions, status: 'PUBLISHED', publishedAt: useStore.getState().demoToday });
  const row = (a: Mom['actions'][number]) =>
    `<tr><td>${a.text}</td><td>${a.ownerId ? name(a.ownerId) : 'Unassigned'}</td><td>${a.dueDate ? fmtShort(a.dueDate) : '-'}</td></tr>`;
  sendEmail({
    kind: 'MOM', toIds: m.attendeeIds, ccIds: [m.organiserId], relatedId: momId,
    subject: `MOM: ${m.title} · ${fmtDay(meetingDate(m))}`,
    html: `<p>Minutes of the meeting held on ${fmtDay(meetingDate(m))}.</p>
<p><b>Decisions</b></p><ul>${mom.decisions.map((d) => `<li>${d.text}</li>`).join('')}</ul>
<p><b>Actions</b> (added as tasks in the Control Tower)</p>
<table><thead><tr><th>Action</th><th>Owner</th><th>Due</th></tr></thead><tbody>${actions.map(row).join('')}</tbody></table>`,
  });
  for (const a of m.attendeeIds) notify(a, `MOM published: ${m.title}`, `/meetings/${m.id}`, 'MOM', momId);
  useStore.getState().logAction('MOM_PUBLISH', momId, `${actions.length} tasks`);
}

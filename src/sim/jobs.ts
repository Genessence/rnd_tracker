// Scheduled jobs and simulated email replies. The 08:30 digest goes out once per person per working day.
import { isOpen, isOverdue } from '../domain/metrics';
import type { Task } from '../domain/types';
import { fmtShort, isWorkingDay, weekEnd } from '../lib/dates';
import { useStore } from '../store/store';
import { sendEmail } from './mailer';
import { notify } from './notifications';

const li = (t: Task, s = useStore.getState()) => {
  const project = s.projects.find((p) => p.id === t.projectId)?.name;
  const late = t.forecastDate !== t.committedDate ? ` <span style="color:var(--late)">(forecast ${fmtShort(t.forecastDate)})</span>` : '';
  return `<li data-task="${t.id}"><b>${t.title}</b>${project && !t.title.includes(project) ? ` · ${project}` : ''}<br/><span style="color:var(--ink-2)">Committed ${fmtShort(t.committedDate)}</span>${late}</li>`;
};

/** Sends the 08:30 digest for demoToday to everyone with overdue or this-week items, skipping people already sent. */
export function run0830() {
  const s = useStore.getState();
  const today = s.demoToday;
  if (!isWorkingDay(today)) return;
  const at = `${today} 08:30`;
  const sent = new Set(s.emails.filter((e) => e.kind === 'DIGEST' && e.at === at).map((e) => e.relatedId));
  const eow = weekEnd(today);
  let n = 0;
  for (const p of s.people) {
    if (sent.has(p.id)) continue;
    const mine = s.tasks.filter((t) => isOpen(t) && t.ownerIds.includes(p.id) && t.forecastDate <= eow);
    if (!mine.length) continue;
    const overdue = mine.filter((t) => isOverdue(t, today));
    const dueToday = mine.filter((t) => t.forecastDate === today);
    const week = mine.filter((t) => t.forecastDate > today);
    const section = (label: string, list: Task[]) => (list.length ? `<h4>${label} (${list.length})</h4><ul>${list.map((t) => li(t, s)).join('')}</ul>` : '');
    sendEmail({
      kind: 'DIGEST', toIds: [p.id], at, relatedId: p.id,
      subject: `Your 08:30 digest: ${overdue.length} overdue, ${dueToday.length} due today, ${week.length} later this week`,
      html: `<p>Good morning ${p.name.split(' ')[0]},</p><p>Here is what is on your plate today.</p>${section('Overdue', overdue)}${section('Due today', dueToday)}${section('Later this week', week)}`,
    });
    n++;
  }
  s.logAction('DIGEST_RUN', today, `${n} digests`);
}

/** Task ids an email lets the recipient reply on: digest items, or the task of an assignment. */
export function replyableTasks(e: { kind: string; html: string; relatedId?: string }): string[] {
  if (e.kind === 'DIGEST') return [...e.html.matchAll(/data-task="([^"]+)"/g)].map((m) => m[1]);
  if (e.kind === 'ASSIGNMENT' && e.relatedId) return [e.relatedId];
  return [];
}

export const replyKey = (emailId: string, taskId: string) => `${emailId}:${taskId}`;

/** Runs fn as the email's recipient so the change is attributed to them, then restores the presenter's persona. */
function asRecipient<T>(emailId: string, fn: () => T): T {
  const s = useStore.getState();
  const prev = s.currentPersonId;
  const to = s.emails.find((e) => e.id === emailId)?.toIds[0] ?? prev;
  s.setPersona(to);
  try {
    return fn();
  } finally {
    useStore.getState().setPersona(prev);
  }
}

function afterReply(emailId: string, taskId: string, reply: 'DONE' | 'NEW_DATE', text: string) {
  const s = useStore.getState();
  const email = s.emails.find((e) => e.id === emailId)!;
  const task = s.tasks.find((t) => t.id === taskId)!;
  const from = s.people.find((p) => p.id === email.toIds[0]);
  useStore.setState((st) => ({ emails: st.emails.map((e) => (e.id === emailId ? { ...e, replied: reply } : e)) }));
  asRecipient(emailId, () => useStore.getState().logAction('EMAIL_REPLY', replyKey(emailId, taskId), text));
  const leader = s.teams.find((t) => t.id === task.teamId)?.leaderId;
  if (leader && leader !== from?.id) notify(leader, `${from?.name ?? 'Someone'} replied by email: ${task.title}: ${text}`, '/my-day', 'INFO', taskId);
}

/** Reply "Done": closes the task. */
export function replyDone(emailId: string, taskId: string) {
  asRecipient(emailId, () => useStore.getState().completeTask(taskId));
  afterReply(emailId, taskId, 'DONE', 'Done');
}

/** Reply with new date: moves the forecast (needs a reason, like everywhere else). Returns false if refused. */
export function replyNewDate(emailId: string, taskId: string, date: string, reasonCode: string, note?: string, attributedTo?: string) {
  const ok = asRecipient(emailId, () => useStore.getState().moveForecast('task', taskId, date, reasonCode, note ?? 'Replied by email', attributedTo));
  if (ok) afterReply(emailId, taskId, 'NEW_DATE', `New date ${fmtShort(date)} (${useStore.getState().reasonCodes.find((r) => r.code === reasonCode)?.label ?? reasonCode})`);
  return ok;
}

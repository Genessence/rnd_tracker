// Demo clock. Rules are derived from demoToday, so moving the date re-runs them; this also tells people what changed.
import { evaluate } from '../domain/rules';
import { isOpen, isOverdue } from '../domain/metrics';
import { addDays, fmtShort, nextWorkingDay } from '../lib/dates';
import { useStore } from '../store/store';
import { sendEmail } from './mailer';
import { notify } from './notifications';

/** Moves the demo date and notifies/emails each person about exceptions that are new on that date. */
export function setDate(date: string) {
  const before = useStore.getState();
  const known = new Set(evaluate(before, before.demoToday).map((e) => e.id));
  before.setDemoToday(date);
  const s = useStore.getState();
  const fresh = evaluate(s, date).filter((e) => !known.has(e.id) && !s.clearedExceptions[e.id]);
  const byPerson = new Map<string, typeof fresh>();
  for (const e of fresh) byPerson.set(e.routedToId, [...(byPerson.get(e.routedToId) ?? []), e]);
  for (const [personId, list] of byPerson) {
    notify(personId, `${list.length} new exception${list.length > 1 ? 's' : ''}: ${list[0].title}`, '/tower', 'ESCALATION');
    sendEmail({
      kind: 'ESCALATION', toIds: [personId], relatedId: list[0].entityId,
      subject: `Escalation (${list.map((e) => e.ruleId).join(', ')}): ${list[0].title}${list.length > 1 ? ` +${list.length - 1} more` : ''}`,
      html: `<ul>${list.map((e) => `<li><b>${e.ruleId}</b> ${e.title}<br/>${e.detail}</li>`).join('')}</ul>`,
    });
  }
  s.logAction('CLOCK_SET', date, `${fresh.length} new exceptions`);
}

export const advanceDays = (n: number) => setDate(nextWorkingDay(addDays(useStore.getState().demoToday, n)));

/** The 08:30 digest: one mail per person with overdue or due-today items. */
export function run0830() {
  const s = useStore.getState();
  const today = s.demoToday;
  for (const p of s.people) {
    const mine = s.tasks.filter((t) => isOpen(t) && t.ownerIds.includes(p.id) && t.forecastDate <= today);
    if (!mine.length) continue;
    const overdue = mine.filter((t) => isOverdue(t, today));
    const row = (t: (typeof mine)[number]) => `<li data-task="${t.id}">${t.title} <span>(${fmtShort(t.forecastDate)})</span></li>`;
    sendEmail({
      kind: 'DIGEST', toIds: [p.id], at: `${today} 08:30`, relatedId: p.id,
      subject: `Your 08:30 digest: ${overdue.length} overdue, ${mine.length - overdue.length} due today`,
      html: `<p>Good morning ${p.name.split(' ')[0]},</p>${overdue.length ? `<p><b>Overdue</b></p><ul>${overdue.map(row).join('')}</ul>` : ''}${mine.length > overdue.length ? `<p><b>Due today</b></p><ul>${mine.filter((t) => !isOverdue(t, today)).map(row).join('')}</ul>` : ''}`,
    });
  }
  s.logAction('DIGEST_RUN', today);
}

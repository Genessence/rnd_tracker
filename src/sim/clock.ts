// Demo clock. Rules are derived from demoToday, so moving the date re-runs them; this also tells people what changed.
import { evaluate } from '../domain/rules';
import { addDays, nextWorkingDay } from '../lib/dates';
import { useStore } from '../store/store';
import { sendEmail } from './mailer';
import { notify } from './notifications';
import { run0830 } from './jobs';

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
  run0830();
}

export const advanceDays = (n: number) => setDate(nextWorkingDay(addDays(useStore.getState().demoToday, n)));

// The 08:30 digest lives in jobs.ts (once per person per working day); clock moves send it too.
export { run0830 };

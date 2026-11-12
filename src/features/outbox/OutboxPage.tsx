// Simulated Outlook: every email the tower sent, as a mail client. Digest and assignment mails can be replied to.
import { Mail } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../app/Shell';
import { cx, SimulatedTag } from '../../design';
import type { Email, Person } from '../../domain/types';
import { fmtDay, fmtLong } from '../../lib/dates';
import { HERO_TASK_ID } from '../../domain/seed';
import { addWorkingDays, fmtShort } from '../../lib/dates';
import { useStore } from '../../store/store';

const KINDS: Email['kind'][] = ['DIGEST', 'ASSIGNMENT', 'REQUEST', 'COMMITMENT', 'ESCALATION', 'MOM', 'INVITE', 'REMINDER', 'WEEKLY'];
const KIND_LABEL: Record<Email['kind'], string> = {
  DIGEST: '08:30 digest', ASSIGNMENT: 'Assignment', REQUEST: 'Request', COMMITMENT: 'Commitment', REMINDER: 'Reminder',
  ESCALATION: 'Escalation', MOM: 'MOM', INVITE: 'Invite', WEEKLY: 'Weekly',
};
const KIND_TONE: Record<Email['kind'], string> = {
  DIGEST: 'border-accent text-accent bg-accent-soft', ASSIGNMENT: 'border-ink-2 text-ink bg-canvas',
  REQUEST: 'border-wait text-wait bg-wait-soft', COMMITMENT: 'border-ok text-ok bg-ok-soft',
  ESCALATION: 'border-late text-late bg-late-soft', MOM: 'border-accent text-accent bg-surface',
  INVITE: 'border-wait text-wait bg-surface', REMINDER: 'border-risk text-risk bg-risk-soft', WEEKLY: 'border-ink-2 text-ink-2 bg-surface',
};
const SENDER = { name: 'R&D Control Tower', email: 'control-tower.demo@example.com' };

const when = (at: string) => {
  const [d, t] = at.split(' ');
  return `${fmtDay(d)}${t ? ` · ${t}` : ''}`;
};

export function OutboxPage() {
  const emails = useStore((s) => s.emails);
  const people = useStore((s) => s.people);
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') as Email['kind'] | null;
  const person = params.get('to') ?? '';
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'id') next.delete('id');
    setParams(next, { replace: true });
  };

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const recipients = useMemo(() => {
    const ids = new Set(emails.flatMap((e) => [...e.toIds, ...(e.ccIds ?? [])]));
    return people.filter((p) => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [emails, people]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of emails) m.set(e.kind, (m.get(e.kind) ?? 0) + 1);
    return m;
  }, [emails]);
  const list = useMemo(
    () => emails
      .filter((e) => (!kind || e.kind === kind) && (!person || e.toIds.includes(person) || e.ccIds?.includes(person)))
      .slice().reverse(),
    [emails, kind, person],
  );
  const catalogue = useCatalogue();
  const selected = [...catalogue, ...list].find((e) => e.id === params.get('id')) ?? catalogue[0];

  return (
    <>
      <PageHeader
        title="Outbox"
        subtitle={<>One sample of every email the tower sends, with when it goes and who gets it, followed by the emails sent during this demo. <SimulatedTag label="Simulated Outlook" className="ml-1 align-middle" /></>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip active={!kind} onClick={() => set('kind', null)} label="All" n={emails.length} />
        {KINDS.filter((k) => counts.get(k)).map((k) => (
          <Chip key={k} active={kind === k} onClick={() => set('kind', kind === k ? null : k)} label={KIND_LABEL[k]} n={counts.get(k) ?? 0} />
        ))}
        <label className="ml-auto flex items-center gap-2 text-table text-ink-2">
          Person
          <select
            value={person}
            onChange={(e) => set('to', e.target.value || null)}
            className="h-8 rounded-input border border-line bg-surface px-2 text-[12px] text-ink"
          >
            <option value="">Everyone ({recipients.length})</option>
            {recipients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      <div className="card grid h-[calc(100vh-13rem)] min-h-[520px] grid-cols-[380px_1fr] overflow-hidden">
        <ul className="overflow-y-auto border-r border-line" aria-label="Emails">
          <li className="border-b border-line bg-canvas px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">Email types · {catalogue.length}</li>
          {catalogue.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => set('id', e.id)}
                className={cx('flex w-full flex-col gap-1 border-b border-l-2 border-b-line px-4 py-2.5 text-left', e.id === selected?.id ? 'border-l-accent bg-accent-soft' : 'border-l-transparent hover:bg-canvas')}>
                <span className="flex items-center gap-2"><KindTag kind={e.kind} /><span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{e.label}</span></span>
                <span className="truncate text-[12px] text-ink-2">{e.trigger}</span>
              </button>
            </li>
          ))}
          <li className="border-b border-line bg-canvas px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">Sent in this demo · {list.length}</li>
          {list.length === 0 && (
            <li className="px-6 py-16 text-center text-ink-2">
              <Mail size={22} className="mx-auto mb-2" aria-hidden />
              {emails.length ? 'No email matches these filters.' : 'Actions in the demo (assigning a task, publishing a MOM, moving the clock) add emails here.'}
            </li>
          )}
          {list.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => set('id', e.id)}
                className={cx(
                  'flex w-full flex-col gap-1 border-b border-l-2 border-b-line px-4 py-2.5 text-left',
                  e.id === selected?.id ? 'border-l-accent bg-accent-soft' : 'border-l-transparent hover:bg-canvas',
                )}
              >
                <span className="flex items-center gap-2">
                  <KindTag kind={e.kind} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{names(e.toIds, byId)}</span>
                  <span className="num shrink-0 text-[11px] text-ink-2">{when(e.at)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px]">{e.subject}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="overflow-y-auto bg-canvas">
          {selected ? <EmailView key={selected.id} email={selected} byId={byId} /> : <div className="grid h-full place-items-center text-ink-2">Select an email.</div>}
        </div>
      </div>
    </>
  );
}

function names(ids: string[], byId: Map<string, Person>) {
  return ids.map((id) => byId.get(id)?.name ?? id).join(', ');
}

function Chip({ active, onClick, label, n }: { active: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx('inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium', active ? 'border-accent bg-accent text-surface' : 'border-line bg-surface text-ink hover:border-accent')}
    >
      {label}
      <span className={cx('num text-[11px]', active ? 'text-surface' : 'text-ink-2')}>{n}</span>
    </button>
  );
}

function KindTag({ kind }: { kind: Email['kind'] }) {
  return <span className={cx('shrink-0 rounded border px-1.5 font-mono text-[10px] uppercase leading-4 tracking-wide', KIND_TONE[kind])}>{KIND_LABEL[kind]}</span>;
}

function EmailView({ email, byId }: { email: Email; byId: Map<string, Person> }) {
  const addr = (ids: string[]) => ids.map((id) => {
    const p = byId.get(id);
    return p ? `${p.name} <${p.email}>` : id;
  }).join('; ');
  return (
    <article className="mx-auto max-w-[760px] p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="text-[17px] font-semibold leading-6">{email.subject}</h2>
        <KindTag kind={email.kind} />
      </div>
      <div className="mb-4 flex gap-3 border-b border-line pb-4">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink">
          <span className="block h-2.5 w-2.5 rotate-45 bg-accent" />
        </span>
        <dl className="grid flex-1 grid-cols-[40px_1fr] gap-x-2 text-table">
          <dt className="text-ink-2">From</dt><dd><b className="font-medium">{SENDER.name}</b> <span className="text-ink-2">&lt;{SENDER.email}&gt;</span></dd>
          <dt className="text-ink-2">To</dt><dd>{addr(email.toIds)}</dd>
          {!!email.ccIds?.length && <><dt className="text-ink-2">Cc</dt><dd>{addr(email.ccIds)}</dd></>}
          <dt className="text-ink-2">Sent</dt><dd className="num">{fmtLong(email.at.split(' ')[0])}{email.at.includes(' ') ? ` · ${email.at.split(' ')[1]}` : ''}</dd>
        </dl>
        <SimulatedTag label="Simulated Outlook" className="self-start" />
      </div>
      <div
        className="card px-6 py-5 text-[13px] leading-[21px] [&_a]:text-accent [&_a]:underline [&_h4]:mb-1 [&_h4]:mt-4 [&_h4]:text-[12px] [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-wide [&_h4]:text-ink-2 [&_li]:mb-1.5 [&_p]:mb-2 [&_table]:my-2 [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:bg-canvas [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        // Self-generated by src/sim and the store, never user HTML from outside the demo.
        dangerouslySetInnerHTML={{ __html: email.html }}
      />
      {'trigger' in email && <p className="mt-3 rounded-input border border-line bg-surface px-3 py-2 text-table text-ink-2"><b className="text-ink">When it is sent:</b> {(email as Sample).trigger}</p>}
    </article>
  );
}

type Sample = Email & { label: string; trigger: string };

/** One sample of every email type, built from the live demo data so the client sees real names and dates. */
function useCatalogue(): Sample[] {
  const st = useStore();
  return useMemo(() => {
    const today = st.demoToday, P = (id: string) => st.people.find((p) => p.id === id);
    const head = 'p-mahender', lead = 'p-satbir-singh', eng = 'p-jatin-sharma';
    const t = st.tasks.find((x) => x.id === HERO_TASK_ID) ?? st.tasks[0];
    const proj = st.projects.find((p) => p.id === t.projectId) ?? st.projects[0];
    const mine = st.tasks.filter((x) => x.status !== 'DONE' && x.ownerIds.includes(eng)).slice(0, 4);
    const first = (id: string) => P(id)?.name.split(' ')[0] ?? '';
    const row = (k: string, v: string) => `<tr><th>${k}</th><td>${v}</td></tr>`;
    const at = (time: string) => `${today} ${time}`;
    const mk = (id: string, kind: Email['kind'], label: string, trigger: string, toIds: string[], ccIds: string[], subject: string, html: string, time = '09:00'): Sample =>
      ({ id: `sample-${id}`, kind, label, trigger, toIds, ccIds, subject, html, at: at(time) });
    return [
      mk('assign', 'ASSIGNMENT', 'Task assigned', 'As soon as a team leader submits a new task for someone. To the assignee, copy to the leader.', [eng], [lead],
        `New task: ${t.title} (due ${fmtShort(t.forecastDate)})`,
        `<p>Hi ${first(eng)},</p><p>${P(lead)?.name} has assigned you a task.</p><table>${row('Task', t.title)}${row('Project', proj.name)}${row('Stage', t.stage ?? proj.stage)}${row('Due', fmtShort(t.forecastDate))}</table><p>It is on your My Day now.</p>`),
      mk('project', 'ASSIGNMENT', 'Added to a new project', 'When a team leader starts a project. To every engineer picked for it.', [eng], [lead],
        `New project: ${proj.name}`,
        `<p>Hi ${first(eng)},</p><p>You have been added to <b>${proj.name}</b>${proj.customer ? ` for ${proj.customer}` : ''}.</p><p>The stage-gate plan (CE → Proto → DV → PP → MP) is set up and your activities are on My Day.</p>`),
      mk('reminder', 'REMINDER', 'Due-date reminder', 'Two working days before a task is due, if it is still open. To the owner.', [eng], [],
        `Reminder: ${t.title} is due ${fmtShort(addWorkingDays(today, 2))}`,
        `<p>Hi ${first(eng)},</p><p>This task is due in 2 working days.</p><table>${row('Task', t.title)}${row('Due', fmtShort(addWorkingDays(today, 2)))}</table><p>If the date will move, update it on My Day with a reason.</p>`, '08:00'),
      mk('digest', 'DIGEST', 'Daily 08:30 digest', 'Every working day at 08:30. To each person with open tasks.', [eng], [],
        `Your 08:30 digest: ${mine.length} open tasks`,
        `<p>Good morning ${first(eng)},</p><p>Here is what is on your plate today.</p><ul>${mine.map((x) => `<li>${x.title} · due ${fmtShort(x.forecastDate)}</li>`).join('')}</ul>`, '08:30'),
      mk('moved', 'REMINDER', 'Date moved', 'When someone moves a task date. Always with the reason and the department the delay is booked to. To the team leader.', [lead], [],
        `Date moved: ${t.title} ${fmtShort(t.committedDate)} → ${fmtShort(addWorkingDays(t.committedDate, 3))}`,
        `<p>Hi ${first(lead)},</p><p>${P(eng)?.name} moved a date.</p><table>${row('Task', t.title)}${row('From → to', `${fmtShort(t.committedDate)} → ${fmtShort(addWorkingDays(t.committedDate, 3))}`)}${row('Reason', 'Waiting on another department')}${row('Booked to', 'DQA')}</table>`),
      mk('escalation', 'ESCALATION', 'Escalation', 'When a rule fires, e.g. a date slips more than 7 days or lands after the project milestone. To the team leader, and the head for red projects.', [head], [lead],
        `Needs you: ${t.title} lands after ${proj.nextMilestone ?? 'the milestone'}`,
        `<p>Hi ${first(head)},</p><p>A forecast now lands after the project's milestone.</p><table>${row('Task', t.title)}${row('Project', proj.name)}${row('Milestone', `${proj.nextMilestone ?? ''} ${proj.nextMilestoneDate ? fmtShort(proj.nextMilestoneDate) : ''}`)}${row('Owner', P(eng)?.name ?? '')}</table><p>Open the Control Tower to decide, push back or accept the new date.</p>`),
      mk('invite', 'INVITE', 'Meeting invite', 'When a meeting is scheduled from a project stage. To every attendee, with the agenda and the Teams link.', [eng, lead], [],
        `Invitation: Weekly review · ${proj.name}`,
        `<p>You are invited to the weekly review for <b>${proj.name}</b>.</p><p>Agenda: overdue and blocked items for the current stage.</p><p><a href="#">Join Microsoft Teams meeting</a> (simulated)</p>`, '10:00'),
      mk('mom', 'MOM', 'Minutes of meeting', 'When the organiser publishes the MOM. To every attendee, with decisions and the tasks created.', [eng, lead, head], [],
        `MOM: Weekly review · ${proj.name}`,
        `<p>The minutes are published.</p><h4>Decisions</h4><ul><li>Electronics releases the final 15K3S build to DQA by Monday the 19th</li></ul><h4>Actions (now tasks)</h4><ul><li>R&amp;D Head: Megmeet escalation</li><li>Sourcing: PO terms by 20 Oct</li><li>RAC: Thailand dispatch date by Monday</li></ul>`, '16:00'),
      mk('weekly', 'WEEKLY', 'Weekly summary', 'Every Monday at 09:00. To the head of R&D, copy to all team leaders.', [head], [lead],
        'R&D weekly summary',
        `<p>Hi ${first(head)},</p><p>The week in numbers.</p><table>${row('Open tasks', String(st.tasks.filter((x) => x.status !== 'DONE').length))}${row('Projects', String(st.projects.length))}${row('Projects at red', String(st.projects.filter((p) => p.rag === 'red').length))}</table>`),
    ];
  }, [st]);
}

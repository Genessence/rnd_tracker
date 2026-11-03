// Simulated Outlook: every email the tower sent, as a mail client. Digest and assignment mails can be replied to.
import { Check, CalendarClock, Mail, Reply, Sun } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../app/Shell';
import { cx, DatePair, SimulatedTag } from '../../design';
import type { Email, Person, Task } from '../../domain/types';
import { fmtDay, fmtLong } from '../../lib/dates';
import { replyableTasks, replyDone, replyKey, replyNewDate, run0830 } from '../../sim/jobs';
import { shortTeam } from '../../store/selectors';
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
const btn = 'inline-flex h-8 items-center gap-1.5 rounded-input border border-line bg-surface px-2.5 text-[12px] font-medium text-ink hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-50';

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
  const selected = list.find((e) => e.id === params.get('id')) ?? list[0];

  return (
    <>
      <PageHeader
        title="Outbox"
        subtitle={<>Every email the tower sent. Nothing leaves the browser. <SimulatedTag label="Simulated Outlook" className="ml-1 align-middle" /></>}
        actions={
          <button type="button" className={btn} onClick={run0830} title="Send today's 08:30 digest (once per person per day)">
            <Sun size={14} aria-hidden /> Run 08:30
          </button>
        }
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
          {list.length === 0 && (
            <li className="px-6 py-16 text-center text-ink-2">
              <Mail size={22} className="mx-auto mb-2" aria-hidden />
              {emails.length ? 'No email matches these filters.' : 'No email yet. Press Run 08:30 or move the demo clock.'}
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
                  {e.replied && <Reply size={12} className="shrink-0 text-ok" aria-label="Replied" />}
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
  const taskIds = replyableTasks(email);
  const addr = (ids: string[]) => ids.map((id) => {
    const p = byId.get(id);
    return p ? `${p.name} <${p.email}>` : id;
  }).join('; ');
  const to = byId.get(email.toIds[0]);
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
      {taskIds.length > 0 && <ReplyPanel email={email} taskIds={taskIds} name={to?.name.split(' ')[0] ?? 'Recipient'} />}
    </article>
  );
}

function ReplyPanel({ email, taskIds, name }: { email: Email; taskIds: string[]; name: string }) {
  const tasks = useStore((s) => s.tasks);
  const log = useStore((s) => s.actionLog);
  const replies = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of log) if (a.action === 'EMAIL_REPLY' && a.entityId.startsWith(`${email.id}:`)) m.set(a.entityId, a.note ?? '');
    return m;
  }, [log, email.id]);
  return (
    <section className="mt-4 rounded-card border border-accent bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Reply size={15} className="text-accent" aria-hidden />
        <span className="text-[13px] font-semibold">Reply as {name} to update the tracker</span>
        <SimulatedTag className="ml-auto" />
      </header>
      <ul>
        {taskIds.map((id) => {
          const t = tasks.find((x) => x.id === id);
          return t ? <ReplyRow key={id} emailId={email.id} task={t} reply={replies.get(replyKey(email.id, id))} /> : null;
        })}
      </ul>
    </section>
  );
}

function ReplyRow({ emailId, task, reply }: { emailId: string; task: Task; reply?: string }) {
  const reasonCodes = useStore((s) => s.reasonCodes);
  const teams = useStore((s) => s.teams);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(task.forecastDate);
  const [reason, setReason] = useState('');
  const [dept, setDept] = useState('');
  const [note, setNote] = useState('');
  const done = task.status === 'DONE';
  const canSend = !!reason && !!date && date !== task.forecastDate && (reason !== 'WAITING_DEPT' || !!dept);
  const send = () => {
    if (replyNewDate(emailId, task.id, date, reason, note || undefined, dept || undefined)) setOpen(false);
  };
  const field = 'h-8 rounded-input border border-line bg-surface px-2 text-[12px]';
  return (
    <li className="border-b border-line px-4 py-3 last:border-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className={cx('truncate text-[13px] font-medium', done && 'text-ink-2 line-through')}>{task.title}</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="num text-[11px] text-ink-2">{task.id}</span>
            <DatePair committed={task.committedDate} forecast={task.forecastDate} />
          </div>
        </div>
        {reply ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-[12px] font-medium text-ok">
            <Check size={13} aria-hidden /> Replied: {reply}
          </span>
        ) : done ? (
          <span className="text-[12px] text-ink-2">Already done</span>
        ) : (
          <>
            <button type="button" className={btn} onClick={() => replyDone(emailId, task.id)}>
              <Check size={14} aria-hidden /> Reply “Done”
            </button>
            <button type="button" className={cx(btn, open && 'border-accent text-accent')} onClick={() => setOpen(!open)} aria-expanded={open}>
              <CalendarClock size={14} aria-hidden /> Reply with new date
            </button>
          </>
        )}
      </div>
      {open && !reply && !done && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-input bg-canvas p-3">
          <label className="flex flex-col gap-1 text-[11px] text-ink-2">New date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cx(field, 'num')} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-ink-2">Reason (required)
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={field}>
              <option value="">Pick a reason…</option>
              {reasonCodes.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </label>
          {reason === 'WAITING_DEPT' && (
            <label className="flex flex-col gap-1 text-[11px] text-ink-2">Which department
              <select value={dept} onChange={(e) => setDept(e.target.value)} className={field}>
                <option value="">Pick…</option>
                {teams.filter((t) => t.id !== task.teamId).map((t) => <option key={t.id} value={t.id}>{shortTeam(t.name)}</option>)}
              </select>
            </label>
          )}
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-[11px] text-ink-2">Note
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className={field} />
          </label>
          <button type="button" className={cx(btn, 'border-accent bg-accent text-surface hover:text-surface')} disabled={!canSend} onClick={send}>
            <Reply size={14} aria-hidden /> Send reply
          </button>
        </div>
      )}
    </li>
  );
}


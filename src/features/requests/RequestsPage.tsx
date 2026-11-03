// #/requests: Incoming queue (departments / support teams) and Outgoing (model teams), with a detail drawer.
// Flow: raised -> acknowledged -> committed -> accepted (or countered). Moving a commitment needs a reason + blame.
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Check, CornerUpLeft, MessageSquare, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Avatar, PageHeader } from '../../app/Shell';
import { cx, DatePair } from '../../design';
import { leaderOf } from '../../domain/rules';
import type { Request, RequestStatus } from '../../domain/types';
import { addWorkingDays, daysBetween, fmtDay, fmtShort } from '../../lib/dates';
import { sendEmail } from '../../sim/mailer';
import { notify } from '../../sim/notifications';
import { shortTeam } from '../../store/selectors';
import { useStore } from '../../store/store';

export const STATUS_TONE: Record<RequestStatus, string> = {
  OPEN: 'bg-late-soft text-late',
  ACKNOWLEDGED: 'bg-risk-soft text-risk',
  COMMITTED: 'bg-wait-soft text-wait',
  ACCEPTED: 'bg-ok-soft text-ok',
  DONE: 'bg-ok-soft text-ok',
  REJECTED: 'bg-hold-soft text-ink-2',
};

export function StatusPill({ status }: { status: RequestStatus }) {
  return <span className={cx('rounded px-1.5 py-px font-mono text-[11px] font-medium', STATUS_TONE[status])}>{status.toLowerCase()}</span>;
}

type Tab = 'incoming' | 'outgoing' | 'all';
const btn = 'inline-flex h-8 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-input border border-line bg-surface px-3 text-[12px] font-medium text-ink hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink';
const primary = 'inline-flex h-8 items-center gap-1.5 rounded-input bg-accent px-3 text-[12px] font-medium text-surface hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';
const field = 'h-8 rounded-input border border-line bg-surface px-2 text-[12px] focus:border-accent focus:outline-none';

export function RequestsPage() {
  const [params, setParams] = useSearchParams();
  const requests = useStore((s) => s.requests);
  const teams = useStore((s) => s.teams);
  const people = useStore((s) => s.people);
  const meId = useStore((s) => s.currentPersonId);
  const today = useStore((s) => s.demoToday);
  const me = people.find((p) => p.id === meId);
  const myTeam = me?.teamId ?? '';
  const isHead = me?.role === 'HEAD';
  const isModel = teams.find((t) => t.id === myTeam)?.kind === 'model';

  const toFilter = params.get('to');
  const openId = params.get('id');
  // The chosen tab sticks per persona; switching persona falls back to that persona's natural queue.
  const [picked, setPicked] = useState<{ by: string; tab: Tab } | null>(null);
  const tab: Tab = picked?.by === meId ? picked.tab : isHead || toFilter ? 'all' : isModel ? 'outgoing' : 'incoming';
  const setTab = (t: Tab) => setPicked({ by: meId, tab: t });
  const [showClosed, setShowClosed] = useState(false);

  const counts = useMemo(() => ({
    incoming: requests.filter((r) => r.toId === myTeam && isActive(r)).length,
    outgoing: requests.filter((r) => r.fromTeamId === myTeam && isActive(r)).length,
    all: requests.filter(isActive).length,
  }), [requests, myTeam]);

  const rows = useMemo(() => requests
    .filter((r) => (tab === 'incoming' ? r.toId === myTeam : tab === 'outgoing' ? r.fromTeamId === myTeam : true))
    .filter((r) => !toFilter || r.toId === toFilter)
    .filter((r) => showClosed || isActive(r))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.raisedAt.localeCompare(b.raisedAt)),
  [requests, tab, myTeam, toFilter, showClosed]);

  const team = (id: string) => shortTeam(teams.find((t) => t.id === id)?.name ?? id);
  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('id', id); else next.delete('id');
    setParams(next);
  };
  const selected = requests.find((r) => r.id === openId);

  return (
    <>
      <PageHeader
        title="Requests"
        subtitle={<>Every blocker has an address. Viewing as <b className="text-ink">{me?.name}</b> · {team(myTeam)}</>}
      />
      <div className="mb-3 flex items-center gap-2">
        <div role="tablist" className="flex rounded-input border border-line bg-surface p-0.5">
          {(['incoming', 'outgoing', 'all'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cx('flex items-center gap-2 rounded-[4px] px-3 py-1 text-[12px] font-medium capitalize',
                tab === t ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:text-ink')}
            >
              {t === 'all' ? 'All departments' : t}
              <span className="num rounded bg-canvas px-1 text-[11px] text-ink-2">{counts[t]}</span>
            </button>
          ))}
        </div>
        {toFilter && (
          <button className={btn} onClick={() => { const n = new URLSearchParams(params); n.delete('to'); setParams(n); }}>
            To: {team(toFilter)} <X size={12} />
          </button>
        )}
        <label className="ml-auto flex items-center gap-2 text-table text-ink-2">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="accent-[var(--accent)]" />
          Show done / rejected
        </label>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-table">
          <thead className="border-b border-line bg-canvas text-left text-[11px] uppercase tracking-wide text-ink-2">
            <tr>
              <th className="px-4 py-2 font-medium">ID</th>
              <th className="px-2 py-2 font-medium">Request</th>
              <th className="px-2 py-2 font-medium">From → To</th>
              <th className="px-2 py-2 text-right font-medium">Age</th>
              <th className="px-2 py-2 text-right font-medium">TAT</th>
              <th className="px-2 py-2 font-medium">Needed by</th>
              <th className="px-2 py-2 font-medium">Committed</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-2">Nothing in this queue.</td></tr>
            )}
            {rows.map((r) => {
              const age = daysBetween(r.raisedAt, today);
              return (
                <tr
                  key={r.id}
                  onClick={() => open(r.id)}
                  className={cx('cursor-pointer border-b border-line last:border-0 hover:bg-canvas', r.id === openId && 'bg-accent-soft')}
                >
                  <td className="num px-4 py-2 text-ink-2">{r.id}</td>
                  <td className="px-2 py-2">
                    <div className="font-medium text-ink">{r.title}</div>
                    <div className="text-[11px] text-ink-2">Blocks: {r.blocks}</div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">{team(r.fromTeamId)} <span className="text-ink-2">→</span> <b className="font-medium text-wait">{team(r.toId)}</b></td>
                  <td className={cx('num px-2 py-2 text-right', age > 14 && 'text-late')}>{age}d</td>
                  <td className="num px-2 py-2 text-right">{r.plannedTatDays ? `${r.plannedTatDays}d` : '–'}</td>
                  <td className="num px-2 py-2">{r.requestedDate ? fmtShort(r.requestedDate) : '–'}</td>
                  <td className="num px-2 py-2">{r.committedDate ? fmtShort(r.committedDate) : <span className="text-ink-2">–</span>}</td>
                  <td className="px-4 py-2"><StatusPill status={r.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Non-modal and below the top bar, so the presenter can switch persona or move the clock with it open. */}
      <Dialog.Root modal={false} open={!!selected} onOpenChange={(o) => !o && open(null)}>
        <Dialog.Portal>
          <Dialog.Content
            aria-describedby={undefined}
            onInteractOutside={(e) => e.preventDefault()}
            className="fixed bottom-0 right-0 top-14 z-20 flex w-[560px] flex-col border-l border-line bg-surface shadow-popover outline-none"
          >
            {selected && <RequestDetail r={selected} />}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

// Accepted commitments stay in the queue: the department still owes the date.
const isActive = (r: Request) => r.status !== 'DONE' && r.status !== 'REJECTED';
const statusRank = (s: RequestStatus) => ['OPEN', 'ACKNOWLEDGED', 'COMMITTED', 'ACCEPTED', 'DONE', 'REJECTED'].indexOf(s);

// ---- detail drawer -------------------------------------------------------------------------------------------

const STEPS: { status: RequestStatus; label: string }[] = [
  { status: 'OPEN', label: 'Raised' },
  { status: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { status: 'COMMITTED', label: 'Committed' },
  { status: 'ACCEPTED', label: 'Accepted' },
];

function RequestDetail({ r }: { r: Request }) {
  const s = useStore();
  const { teams, people, currentPersonId: meId, demoToday: today, reasonCodes } = s;
  const me = people.find((p) => p.id === meId);
  const team = (id: string) => shortTeam(teams.find((t) => t.id === id)?.name ?? id);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const isReceiver = me?.teamId === r.toId || leaderOf(s, r.toId) === meId;
  const isRequester = r.raisedById === meId || me?.teamId === r.fromTeamId;
  const project = s.projects.find((p) => p.id === r.projectId);
  const task = s.tasks.find((t) => t.id === r.taskId);
  const activity = project?.plan?.find((a) => a.requestId === r.id || a.activityId === r.activityId);
  const stepIdx = STEPS.findIndex((x) => x.status === r.status);
  // "2026-10-15 -> 2026-10-20 (WAITING_DEPT)" -> "15 Oct → 20 Oct · Waiting on another department · booked to Electronics"
  const historyDetail = (d: string) => {
    const m = d.match(/^(\d{4}-\d\d-\d\d) -> (\d{4}-\d\d-\d\d) \((\w+)\)$/);
    if (!m) return /^\d{4}-\d\d-\d\d$/.test(d) ? fmtShort(d) : d;
    const dc = s.dateChanges.find((c) => c.entity === 'request' && c.entityId === r.id && c.from === m[1] && c.to === m[2]);
    const label = reasonCodes.find((c) => c.code === m[3])?.label ?? m[3];
    return `${fmtShort(m[1])} → ${fmtShort(m[2])} · ${label}${dc?.attributedTo ? ` · booked to ${team(dc.attributedTo)}` : ''}`;
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-table text-ink-2">
            <span className="num">{r.id}</span>
            <StatusPill status={r.status} />
          </div>
          <Dialog.Title className="mt-1 text-[16px] font-semibold leading-snug">{r.title}</Dialog.Title>
          <p className="mt-0.5 text-table text-ink-2">
            {team(r.fromTeamId)} <ArrowRight size={11} className="inline" /> <b className="font-medium text-wait">{team(r.toId)}</b>
            {' '}· raised by {name(r.raisedById)} on <span className="num">{fmtShort(r.raisedAt)}</span>
          </p>
        </div>
        <Dialog.Close className="rounded-input p-1 text-ink-2 hover:bg-canvas hover:text-ink" aria-label="Close"><X size={16} /></Dialog.Close>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* stepper */}
        <ol className="flex items-center gap-1">
          {STEPS.map((st, i) => (
            <li key={st.status} className="flex flex-1 items-center gap-1">
              <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-mono',
                i < stepIdx || r.status === 'ACCEPTED' || r.status === 'DONE' ? 'border-ink bg-ink text-surface'
                  : i === stepIdx ? 'border-accent bg-accent text-surface' : 'border-line text-ink-2')}>
                {i < stepIdx || r.status === 'ACCEPTED' || r.status === 'DONE' ? <Check size={11} /> : i + 1}
              </span>
              <span className={cx('text-[11px] font-medium', i === stepIdx ? 'text-accent' : 'text-ink-2')}>{st.label}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px flex-1 bg-line" />}
            </li>
          ))}
        </ol>

        <dl className="grid grid-cols-4 gap-3 rounded-card border border-line bg-canvas p-3">
          <Fact label="Blocks">{r.blocks}</Fact>
          <Fact label="Planned TAT"><span className="num">{r.plannedTatDays ? `${r.plannedTatDays} days` : '–'}</span></Fact>
          <Fact label="Needed by"><span className="num">{r.requestedDate ? fmtDay(r.requestedDate) : '–'}</span></Fact>
          <Fact label="Committed"><span className={cx('num', r.committedDate && 'font-semibold text-wait')}>{r.committedDate ? fmtDay(r.committedDate) : 'not yet'}</span></Fact>
        </dl>

        {(task || activity) && (
          <section>
            <H>What this unblocks</H>
            <div className="divide-y divide-line rounded-card border border-line">
              {task && (
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{task.title}</div>
                    <div className="text-[11px] text-ink-2">Task · {task.ownerIds.map(name).join(', ')}</div>
                  </div>
                  <DatePair committed={task.committedDate} forecast={task.forecastDate} />
                </div>
              )}
              {activity && project && (
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <Link to={`/projects/${project.id}`} className="truncate font-medium hover:text-accent">
                      <span className="num text-ink-2">{activity.sNo}</span> {activity.name}
                    </Link>
                    <div className="text-[11px] text-ink-2">Plan activity · {project.name}</div>
                  </div>
                  <DatePair committed={activity.committedEnd} forecast={activity.forecastEnd} />
                </div>
              )}
            </div>
          </section>
        )}

        <Actions key={r.id} r={r} isReceiver={isReceiver} isRequester={isRequester} today={today} reasonCodes={reasonCodes} />

        <section>
          <H>Comments</H>
          <Comments r={r} />
        </section>

        <section>
          <H>History</H>
          <ol className="relative space-y-2 border-l border-line pl-4">
            {[...r.history].reverse().map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border border-surface bg-ink-2" />
                <div className="text-[12px]">
                  <b className="font-medium">{h.type.toLowerCase()}</b> by {name(h.byId)}
                  {h.detail && <span className="num text-ink-2"> · {historyDetail(h.detail)}</span>}
                </div>
                <div className="num text-[11px] text-ink-2">{fmtDay(h.at)}</div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

const H = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-2">{children}</h3>
);
const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[10px] uppercase tracking-wide text-ink-2">{label}</dt>
    <dd className="mt-0.5 text-[12px]">{children}</dd>
  </div>
);

function Actions({ r, isReceiver, isRequester, today, reasonCodes }: {
  r: Request; isReceiver: boolean; isRequester: boolean; today: string; reasonCodes: { code: string; label: string }[];
}) {
  const st = useStore();
  const [date, setDate] = useState(r.committedDate ? addWorkingDays(r.committedDate, 3) : r.requestedDate ?? addWorkingDays(today, r.plannedTatDays ?? 3));
  const [reason, setReason] = useState('');
  const [blame, setBlame] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'none' | 'move' | 'counter'>('none');
  const team = (id: string) => shortTeam(st.teams.find((t) => t.id === id)?.name ?? id);
  const blameTeams = st.teams.filter((t) => t.kind !== 'model' || t.id === r.fromTeamId);

  const mailRequester = (subject: string, html: string) => {
    sendEmail({ kind: 'COMMITMENT', toIds: [r.raisedById], ccIds: [st.currentPersonId], relatedId: r.id, subject, html });
    notify(r.raisedById, subject, `/requests?id=${r.id}`, 'COMMITMENT', r.id);
  };
  const mailReceiver = (subject: string, html: string) => {
    const lead = leaderOf(st, r.toId);
    sendEmail({ kind: 'COMMITMENT', toIds: [lead], ccIds: [st.currentPersonId], relatedId: r.id, subject, html });
    notify(lead, subject, `/requests?id=${r.id}`, 'COMMITMENT', r.id);
  };

  const card = (title: string, body: ReactNode, tone = 'border-accent') => (
    <section className={cx('rounded-card border bg-surface p-3', tone)}>
      <H>{title}</H>
      {body}
    </section>
  );

  if (!isReceiver && !isRequester) {
    return card('Your move', <p className="text-table text-ink-2">
      Switch persona to <b>{team(r.toId)}</b> to acknowledge or commit, or to the requester to accept.
    </p>, 'border-line');
  }

  // Receiving department
  if (isReceiver) {
    if (r.status === 'OPEN') {
      return card('Your move · acknowledge', <div className="flex items-center justify-between gap-3">
        <p className="text-table text-ink-2">Acknowledge so {team(r.fromTeamId)} knows it has landed. Unacknowledged after 2 working days escalates (R6).</p>
        <button className={primary} onClick={() => {
          st.acknowledgeRequest(r.id);
          mailRequester(`Acknowledged: ${r.title}`, `<p><b>${team(r.toId)}</b> has acknowledged <b>${r.title}</b> and will commit a date.</p>`);
        }}><Check size={14} /> Acknowledge</button>
      </div>);
    }
    if (r.status === 'ACKNOWLEDGED') {
      return card('Your move · commit a date', <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-ink-2">Committed date
          <input type="date" className={cx(field, 'num')} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <span className="pb-2 text-table text-ink-2">{date && fmtDay(date)}{r.plannedTatDays ? ` · TAT ${r.plannedTatDays}d` : ''}</span>
        <button className={cx(primary, 'ml-auto')} disabled={!date} onClick={() => st.commitRequest(r.id, date)}>
          Commit {date ? fmtShort(date) : ''}
        </button>
      </div>);
    }
    if (r.status === 'COMMITTED' || r.status === 'ACCEPTED') {
      return mode !== 'move'
        ? card('Commitment', <div className="flex items-center justify-between gap-3">
          <p className="text-table text-ink-2">
            Committed for <b className="num text-ink">{fmtDay(r.committedDate!)}</b>
            {r.status === 'ACCEPTED' ? ', accepted by the requester.' : ', waiting for the requester to accept.'}
          </p>
          <button className={btn} onClick={() => { setMode('move'); setDate(addWorkingDays(r.committedDate!, 3)); }}>Move commitment…</button>
        </div>, 'border-line')
        : card('Move commitment · a reason is required', <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-ink-2">New date
              <input type="date" className={cx(field, 'num')} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-ink-2">Reason
              <select className={field} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Choose a reason…</option>
                {reasonCodes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-ink-2">Days lost are booked to
              <select className={field} value={blame} onChange={(e) => setBlame(e.target.value)}>
                <option value="">Choose a department…</option>
                {blameTeams.map((t) => <option key={t.id} value={t.id}>{shortTeam(t.name)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-ink-2">Note (optional)
              <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. final build not yet released" />
            </label>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="num text-table text-ink-2">
              {fmtShort(r.committedDate!)} → <span className="text-late">{date ? fmtShort(date) : '?'}</span>
              {date && <span className="text-late"> (+{daysBetween(r.committedDate!, date)}d)</span>}
            </span>
            <div className="flex gap-2">
              <button className={btn} onClick={() => setMode('none')}>Cancel</button>
              <button
                className={primary}
                disabled={!date || !reason || !blame || date === r.committedDate}
                onClick={() => { if (st.commitRequest(r.id, date, reason, note || undefined, blame)) { setMode('none'); setReason(''); setBlame(''); setNote(''); } }}
              >Move to {date ? fmtShort(date) : '…'}</button>
            </div>
          </div>
        </div>, 'border-late');
    }
  }

  // Requester (R&D owner)
  if (r.status === 'COMMITTED') {
    return mode !== 'counter'
      ? card('Your move · accept the date', <div className="flex items-center justify-between gap-3">
        <p className="text-table text-ink-2">{team(r.toId)} committed <b className="num text-ink">{fmtDay(r.committedDate!)}</b>. Accept it, or counter with the date you need.</p>
        <div className="flex shrink-0 gap-2">
          <button className={btn} onClick={() => { setMode('counter'); setDate(r.requestedDate ?? today); }}><CornerUpLeft size={14} /> Counter</button>
          <button className={primary} onClick={() => {
            st.acceptRequest(r.id);
            mailReceiver(`Accepted: ${r.title} by ${r.committedDate}`, `<p>${team(r.fromTeamId)} accepted your commitment of <b>${r.committedDate}</b> for <b>${r.title}</b>.</p>`);
          }}><Check size={14} /> Accept</button>
        </div>
      </div>)
      : card('Counter-propose', <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-ink-2">Needed by
          <input type="date" className={cx(field, 'num')} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-[11px] text-ink-2">Why
          <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. customer sample ships Friday" />
        </label>
        <button className={btn} onClick={() => setMode('none')}>Cancel</button>
        <button className={primary} disabled={!date || !note.trim()} onClick={() => {
          st.counterRequest(r.id, date, note);
          mailReceiver(`Counter-proposal: ${r.title} needed by ${date}`, `<p>${team(r.fromTeamId)} needs <b>${r.title}</b> by <b>${date}</b>: ${note}</p>`);
          setMode('none'); setNote('');
        }}>Send</button>
      </div>);
  }
  const waiting = r.status === 'OPEN' ? 'acknowledge' : r.status === 'ACKNOWLEDGED' ? 'commit a date' : null;
  return card('Status', <p className="text-table text-ink-2">
    {waiting ? <>Waiting for <b className="text-wait">{team(r.toId)}</b> to {waiting}.</>
      : <>Agreed for <b className="num text-ink">{r.committedDate ? fmtDay(r.committedDate) : '–'}</b>.</>}
  </p>, 'border-line');
}

function Comments({ r }: { r: Request }) {
  const comment = useStore((s) => s.commentRequest);
  const people = useStore((s) => s.people);
  const [text, setText] = useState('');
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  return (
    <div className="space-y-2">
      {r.comments.length === 0 && <p className="text-table text-ink-2">No comments yet.</p>}
      {r.comments.map((c) => (
        <div key={c.id} className="flex gap-2">
          <Avatar name={name(c.byId)} />
          <div className="flex-1 rounded-card border border-line bg-canvas px-3 py-2">
            <div className="text-[11px] text-ink-2"><b className="font-medium text-ink">{name(c.byId)}</b> · <span className="num">{fmtShort(c.at)}</span></div>
            <div className="text-[12px]">{c.text}</div>
          </div>
        </div>
      ))}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { comment(r.id, text.trim()); setText(''); } }}>
        <input className={cx(field, 'flex-1')} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" />
        <button className={btn} disabled={!text.trim()}><MessageSquare size={14} /> Comment</button>
      </form>
    </div>
  );
}

// #/my-day: an engineer's whole update in three taps. ✓ Done · ↷ Move forecast (reason required) · ⚑ Waiting on…
// `?phone=1` renders it inside a 390 px device frame for presenting on a laptop.
import { Check, CornerUpRight, Flag, Mail, Plus, Smartphone, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, PageHeader } from '../../app/Shell';
import { cx, DatePair, WaitingChip } from '../../design';
import { isDueThisWeek, isOverdue } from '../../domain/metrics';
import type { Task, WaitingOn } from '../../domain/types';
import { addDays, daysBetween, fmtDay, fmtLong, fmtShort } from '../../lib/dates';
import { headId } from '../../domain/rules';
import { selectExceptions, selectMyTasks } from '../../store/selectors';
import { useStore } from '../../store/store';
import { requestIdOf, unitLabel, waitingLabel } from './labels';

interface Flash { lines: ReactNode[]; link?: { to: string; label: string }; undo?: () => void }

export function MyDayPage() {
  const [params, setParams] = useSearchParams();
  const phone = params.get('phone') === '1';
  const me = useStore((s) => s.people.find((p) => p.id === s.currentPersonId));
  const teams = useStore((s) => s.teams);
  const today = useStore((s) => s.demoToday);

  return (
    <>
      <PageHeader
        title="My Day"
        subtitle={<>{me?.name} · {unitLabel(teams, me?.teamId ?? '')} · <span className="font-mono text-ink">{fmtLong(today)}</span></>}
        actions={
          <button
            type="button"
            aria-pressed={phone}
            onClick={() => setParams(phone ? {} : { phone: '1' }, { replace: true })}
            className={cx(
              'inline-flex h-8 items-center gap-1.5 rounded-input border px-2.5 text-[12px] font-medium',
              phone ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink hover:border-accent hover:text-accent',
            )}
          >
            <Smartphone size={14} aria-hidden /> Phone frame {phone ? 'on' : 'off'}
          </button>
        }
      />
      <div className={cx('grid gap-6', phone ? 'grid-cols-[430px_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)_380px]')}>
        {phone ? (
          <div className="mx-auto w-[414px] rounded-[44px] border border-ink bg-ink p-3">
            <div className="relative h-[800px] w-[390px] overflow-hidden rounded-[34px] bg-canvas">
              <div aria-hidden className="absolute left-1/2 top-2 z-30 h-6 w-28 -translate-x-1/2 rounded-full bg-ink" />
              <MyDayApp phone />
            </div>
          </div>
        ) : (
          <div className="relative min-w-0"><MyDayApp phone={false} /></div>
        )}
        <SidePanel />
      </div>
    </>
  );
}

// ---- The app itself (same component in the phone frame and on desktop) -----------------------------------

function MyDayApp({ phone }: { phone: boolean }) {
  const s = useStore();
  const { tasks, demoToday: today, currentPersonId } = s;
  const mine = useMemo(
    () => selectMyTasks(useStore.getState(), currentPersonId).sort((a, b) => a.forecastDate.localeCompare(b.forecastDate)),
    [tasks, currentPersonId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const doneToday = tasks.filter((t) => t.status === 'DONE' && t.doneDate === today && t.ownerIds.includes(currentPersonId));
  const groups: { id: string; label: string; tone: string; items: Task[] }[] = [
    { id: 'overdue', label: 'Overdue', tone: 'text-late', items: mine.filter((t) => isOverdue(t, today)) },
    { id: 'today', label: 'Today', tone: 'text-ink', items: mine.filter((t) => t.forecastDate === today) },
    { id: 'week', label: 'This week', tone: 'text-ink', items: mine.filter((t) => isDueThisWeek(t, today) && t.forecastDate > today) },
    { id: 'later', label: 'Later', tone: 'text-ink-2', items: mine.filter((t) => t.forecastDate > today && !isDueThisWeek(t, today)) },
  ];
  const [sheet, setSheet] = useState<{ kind: 'move' | 'wait'; task: Task } | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 8000);
    return () => clearTimeout(t);
  }, [flash]);

  const done = (t: Task) => {
    s.completeTask(t.id);
    setFlash({
      lines: [<><b>Done:</b> {t.title}</>, 'Logged; your team leader sees it on the team page now.'],
      undo: () => { useStore.getState().updateTask(t.id, { status: t.status }); setFlash(null); },
    });
  };

  const me = s.people.find((p) => p.id === currentPersonId);
  const counts = groups.slice(0, 3);

  return (
    <div className={cx('flex flex-col', phone && 'h-full')}>
      {phone && (
        <div className="flex items-center gap-2.5 border-b border-line bg-surface px-4 pb-3 pt-10">
          <Avatar name={me?.name ?? '?'} />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold">My Day</div>
            <div className="font-mono text-[11px] text-ink-2">{fmtDay(today)}</div>
          </div>
        </div>
      )}
      <div className={cx('flex flex-col gap-4', phone ? 'flex-1 overflow-y-auto px-3 pb-24 pt-3' : '')}>
        <div className={cx('grid grid-cols-3 gap-2')}>
          {counts.map((g) => (
            <a key={g.id} href={`#mdg-${g.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`mdg-${g.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              className="card px-3 py-2 hover:border-accent">
              <div className="text-[11px] font-medium uppercase tracking-wide text-ink-2">{g.label}</div>
              <div className={cx('num font-medium', phone ? 'text-[22px]' : 'text-kpi', g.items.length && g.id === 'overdue' ? 'text-late' : 'text-ink')}>{g.items.length}</div>
            </a>
          ))}
        </div>
        <QuickAdd onAdded={(title, date) => setFlash({ lines: [<><b>Added:</b> {title}</>, `Forecast ${fmtShort(date)}. Shows on your team's to-do.`] })} />
        {mine.length === 0 && (
          <div className="card px-4 py-10 text-center text-ink-2">No open tasks for you. Switch to Jatin Sharma to see an engineer's day.</div>
        )}
        {groups.filter((g) => g.items.length).map((g) => (
          <section key={g.id} id={`mdg-${g.id}`} aria-label={g.label} className="scroll-mt-4">
            <h2 className={cx('mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide', g.tone)}>
              {g.label}<span className="num rounded bg-surface px-1.5 font-normal text-ink-2">{g.items.length}</span>
            </h2>
            <ul className="flex flex-col gap-2">
              {g.items.map((t) => (
                <TaskCard key={t.id} task={t} phone={phone} onDone={() => done(t)} onMove={() => setSheet({ kind: 'move', task: t })} onWait={() => setSheet({ kind: 'wait', task: t })} />
              ))}
            </ul>
          </section>
        ))}
        {doneToday.length > 0 && (
          <section aria-label="Done today">
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ok">Done today <span className="num font-normal">{doneToday.length}</span></h2>
            <ul className="flex flex-col gap-1">
              {doneToday.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-input border border-line bg-surface px-3 py-2 text-table text-ink-2">
                  <Check size={14} className="text-ok" aria-hidden /><span className="line-through">{t.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {sheet?.kind === 'move' && <MoveSheet phone={phone} task={sheet.task} onClose={() => setSheet(null)} onDone={(f) => { setSheet(null); setFlash(f); }} />}
      {sheet?.kind === 'wait' && <WaitSheet phone={phone} task={sheet.task} onClose={() => setSheet(null)} onDone={(f) => { setSheet(null); setFlash(f); }} />}
      {flash && <Toast phone={phone} flash={flash} onClose={() => setFlash(null)} />}
    </div>
  );
}

function TaskCard({ task: t, phone, onDone, onMove, onWait }: { task: Task; phone: boolean; onDone: () => void; onMove: () => void; onWait: () => void }) {
  const teams = useStore((s) => s.teams);
  const project = useStore((s) => s.projects.find((p) => p.id === t.projectId));
  const today = useStore((s) => s.demoToday);
  const navigate = useNavigate();
  const w = waitingLabel(teams, t.waitingOn);
  const rid = requestIdOf(t.waitingOn);
  const req = useStore((s) => s.requests.find((r) => r.id === rid));
  const late = isOverdue(t, today);
  const act = 'flex flex-1 items-center justify-center gap-1.5 rounded-input border py-2 text-[12px] font-medium';
  return (
    <li className={cx('card overflow-hidden', late && 'border-l-[3px] border-l-late')}>
      <div className={cx('flex gap-3 px-3 pt-3', phone ? 'flex-col gap-1.5' : 'items-start justify-between')}>
        <div className="min-w-0">
          <div className="text-[14px] font-medium leading-snug">{t.title}</div>
          <div className="mt-0.5 truncate text-[11px] text-ink-2">{project?.name ?? 'No project'}</div>
        </div>
        <div className={cx('flex shrink-0 flex-col gap-1', phone ? 'items-start' : 'items-end')}>
          <DatePair committed={t.committedDate} forecast={t.forecastDate} />
          {late && <span className="text-[11px] font-medium text-late">{daysBetween(t.forecastDate, today)}d overdue</span>}
        </div>
      </div>
      {w && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <WaitingChip to={w} onClick={rid ? () => navigate(`/requests?id=${rid}`) : undefined} />
          {req && (
            <span className="font-mono text-[11px] text-ink-2">
              {req.id} · raised {fmtShort(req.raisedAt)} · {req.committedDate ? `committed ${fmtShort(req.committedDate)}` : req.status === 'OPEN' ? 'not acknowledged' : req.status.toLowerCase()}
            </span>
          )}
        </div>
      )}
      <div className="mt-3 flex gap-1.5 border-t border-line bg-canvas/60 px-3 py-2">
        <button type="button" onClick={onDone} className={cx(act, 'border-line bg-surface text-ok hover:border-ok')}>
          <Check size={14} aria-hidden /> Done
        </button>
        <button type="button" onClick={onMove} className={cx(act, 'border-line bg-surface text-ink hover:border-accent hover:text-accent')}>
          <CornerUpRight size={14} aria-hidden /> Move
        </button>
        <button type="button" onClick={onWait} className={cx(act, 'border-line bg-surface text-wait hover:border-wait')}>
          <Flag size={14} aria-hidden /> Waiting on…
        </button>
      </div>
    </li>
  );
}

function QuickAdd({ onAdded }: { onAdded: (title: string, date: string) => void }) {
  const today = useStore((s) => s.demoToday);
  const createTask = useStore((s) => s.createTask);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  useEffect(() => setDate(today), [today]);
  const submit = () => {
    if (!title.trim()) return;
    createTask({ title: title.trim(), forecastDate: date });
    onAdded(title.trim(), date);
    setTitle('');
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="card flex items-center gap-2 p-1.5">
      <Plus size={16} className="ml-1.5 shrink-0 text-accent" aria-hidden />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Quick add a task…"
        aria-label="Quick add task"
        className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] outline-none placeholder:text-ink-2"
      />
      <input type="date" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Forecast date"
        className="w-[118px] shrink-0 rounded-input border border-line bg-surface px-1.5 py-1 font-mono text-[11px]" />
      <button type="submit" disabled={!title.trim()} className="shrink-0 rounded-input bg-accent px-3 py-1.5 text-[12px] font-medium text-surface disabled:opacity-40">Add</button>
    </form>
  );
}

// ---- Sheets ------------------------------------------------------------------------------------------------

function Sheet({ phone, title, onClose, children }: { phone: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className={cx(phone ? 'absolute' : 'fixed', 'inset-0 z-40 flex bg-ink/30', phone ? 'items-end' : 'items-center justify-center')} onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cx('flex max-h-[88%] flex-col bg-surface shadow-popover', phone ? 'w-full rounded-t-[20px]' : 'w-[480px] rounded-card border border-line')}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-input p-1 text-ink-2 hover:bg-canvas"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

const label = 'mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-ink-2';

function MoveSheet({ phone, task: t, onClose, onDone }: { phone: boolean; task: Task; onClose: () => void; onDone: (f: Flash) => void }) {
  const reasonCodes = useStore((s) => s.reasonCodes);
  const teams = useStore((s) => s.teams);
  const moveForecast = useStore((s) => s.moveForecast);
  const w = t.waitingOn;
  const [date, setDate] = useState(addDays(t.forecastDate, 7));
  const [reason, setReason] = useState('');
  const [blame, setBlame] = useState(w && (w.kind === 'TEAM' || w.kind === 'DEPT') ? w.id : t.teamId);
  const [note, setNote] = useState('');
  const ok = !!reason && !!date && date !== t.forecastDate;

  const submit = () => {
    if (!ok) return;
    const before = new Set(selectExceptions(useStore.getState()).map((e) => e.id));
    if (!moveForecast('task', t.id, date, reason, note.trim() || undefined, blame)) return;
    const s = useStore.getState();
    const fresh = selectExceptions(s).filter((e) => !before.has(e.id) && e.entityId === t.id);
    const name = (id: string) => s.people.find((p) => p.id === id)?.name ?? id;
    const slip = daysBetween(t.forecastDate, date);
    onDone({
      lines: [
        <><b>Forecast moved</b> {fmtShort(t.forecastDate)} → {fmtShort(date)} ({slip > 0 ? '+' : ''}{slip}d)</>,
        <>Reason: {reasonCodes.find((r) => r.code === reason)?.label}. Days booked to <b>{unitLabel(teams, blame)}</b> in the delay ledger.</>,
        ...[...new Set(fresh.map((e) => e.routedToId))].map((to) => {
          const ex = fresh.filter((e) => e.routedToId === to);
          return (
            <span key={to} className="text-late-soft">
              ⚠ {[...new Set(ex.map((e) => e.ruleId))].join(' + ')} → <b>{name(to)}</b>{to === headId(s) ? "'s exceptions inbox" : ''}: {ex.at(-1)!.detail}
            </span>
          );
        }),
      ],
      link: fresh.length ? { to: '/tower', label: "Open the head's inbox" } : { to: '/ledger', label: 'Open the ledger' },
    });
  };

  const units = teams.filter((x) => x.id !== 'management');
  return (
    <Sheet phone={phone} title="Move forecast" onClose={onClose}>
      <p className="font-medium">{t.title}</p>
      <p className="mb-3 mt-1 text-table text-ink-2">Now <DatePair committed={t.committedDate} forecast={t.forecastDate} />. Dates never move silently: pick a reason.</p>

      <span className={label}>New forecast</span>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="New forecast date"
          className="rounded-input border border-line px-2 py-1.5 font-mono text-[12px]" />
        {[1, 3, 7].map((n) => (
          <button key={n} type="button" onClick={() => setDate(addDays(t.forecastDate, n))}
            className={cx('rounded-full border px-2.5 py-1 font-mono text-[11px]', date === addDays(t.forecastDate, n) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2')}>
            +{n}d
          </button>
        ))}
      </div>

      <span className={label}>Reason <span className="text-late">(required)</span></span>
      <div role="radiogroup" aria-label="Reason" className="mb-3 grid grid-cols-2 gap-1.5">
        {reasonCodes.map((r) => (
          <button key={r.code} type="button" role="radio" aria-checked={reason === r.code} onClick={() => setReason(r.code)}
            className={cx('rounded-input border px-2 py-1.5 text-left text-[12px]', reason === r.code ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line hover:border-ink-2')}>
            {r.label}
          </button>
        ))}
      </div>

      <label className={label} htmlFor="md-blame">Book the lost days to</label>
      <select id="md-blame" value={blame} onChange={(e) => setBlame(e.target.value)} className="mb-3 w-full rounded-input border border-line bg-surface px-2 py-1.5 text-[12px]">
        {units.map((u) => <option key={u.id} value={u.id}>{unitLabel(teams, u.id)}</option>)}
      </select>

      <label className={label} htmlFor="md-note">Note (optional)</label>
      <input id="md-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Final 15K3S build not released"
        className="mb-4 w-full rounded-input border border-line px-2 py-1.5 text-[12px]" />

      <button type="button" disabled={!ok} onClick={submit}
        className="w-full rounded-input bg-accent py-2.5 text-[13px] font-medium text-surface disabled:cursor-not-allowed disabled:opacity-40">
        {reason ? 'Move forecast' : 'Pick a reason to move'}
      </button>
    </Sheet>
  );
}

type WaitTab = 'DEPT' | 'TEAM' | 'PERSON' | 'HEAD';

function WaitSheet({ phone, task: t, onClose, onDone }: { phone: boolean; task: Task; onClose: () => void; onDone: (f: Flash) => void }) {
  const teams = useStore((s) => s.teams);
  const people = useStore((s) => s.people);
  const me = useStore((s) => s.currentPersonId);
  const setWaitingOn = useStore((s) => s.setWaitingOn);
  const notify = useStore((s) => s.notify);
  const [tab, setTab] = useState<WaitTab>('DEPT');
  const cur = t.waitingOn;
  const curId = cur && (cur.kind === 'TEAM' || cur.kind === 'DEPT') ? cur.id : cur?.kind;

  const pick = (w: WaitingOn, who: string, notifyId?: string) => {
    const rid = setWaitingOn(t.id, w);
    const s = useStore.getState();
    if (notifyId) notify(notifyId, 'INFO', `${s.people.find((p) => p.id === me)?.name} is waiting on you: ${t.title}`, t.id, '/my-day');
    const lead = w.kind === 'TEAM' || w.kind === 'DEPT' ? s.people.find((p) => p.id === s.teams.find((x) => x.id === w.id)?.leaderId) : undefined;
    onDone({
      lines: [
        <><b>{t.title}</b> is now waiting on <b>{who}</b>.</>,
        rid ? <>Request <span className="font-mono">{rid}</span> raised in {who}'s queue. {lead?.name} notified <Mail size={11} className="inline" aria-hidden /> email in Outbox.</>
          : w.kind === 'HEAD' ? "Routed to the R&D head's exceptions inbox." : `${who} has been notified.`,
      ],
      link: rid ? { to: `/requests?id=${rid}`, label: 'Open the request' } : w.kind === 'HEAD' ? { to: '/tower', label: 'Open the tower' } : undefined,
    });
  };

  const units = (kinds: string[]) => teams.filter((x) => kinds.includes(x.kind) && x.id !== t.teamId);
  const myTeam = people.find((p) => p.id === me)?.teamId;
  const colleagues = people.filter((p) => p.id !== me && p.role !== 'HEAD' && (p.teamId === myTeam || p.role === 'TEAM_LEADER'));
  const row = (active: boolean) => cx('flex w-full items-center justify-between rounded-input border px-3 py-2.5 text-left text-[13px]',
    active ? 'border-wait bg-wait-soft font-medium text-wait' : 'border-line hover:border-wait hover:text-wait');

  return (
    <Sheet phone={phone} title="Waiting on…" onClose={onClose}>
      <p className="mb-3 font-medium">{t.title}</p>
      <div role="tablist" className="mb-3 grid grid-cols-4 gap-1 rounded-input border border-line bg-canvas p-0.5">
        {([['DEPT', 'Department'], ['TEAM', 'R&D team'], ['PERSON', 'Person'], ['HEAD', 'Head']] as const).map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cx('rounded-[4px] py-1 text-[12px] font-medium', tab === id ? 'bg-surface text-wait shadow-[0_0_0_1px_var(--line)]' : 'text-ink-2')}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {tab === 'DEPT' && units(['cross-functional', 'external']).filter((x) => x.id !== 'management').map((u) => (
          <button key={u.id} type="button" className={row(curId === u.id)} onClick={() => pick({ kind: 'DEPT', id: u.id }, unitLabel(teams, u.id))}>
            {unitLabel(teams, u.id)}<span className="text-[11px] text-ink-2">{curId === u.id ? (requestIdOf(cur) ?? 'no request yet') : 'raises a request'}</span>
          </button>
        ))}
        {tab === 'TEAM' && units(['model', 'support-rnd']).map((u) => (
          <button key={u.id} type="button" className={row(curId === u.id)} onClick={() => pick({ kind: 'TEAM', id: u.id }, unitLabel(teams, u.id))}>
            {unitLabel(teams, u.id)}<span className="text-[11px] text-ink-2">raises a request</span>
          </button>
        ))}
        {tab === 'PERSON' && colleagues.map((p) => (
          <button key={p.id} type="button" className={row(false)} onClick={() => pick({ kind: 'NOTE', note: `Waiting on ${p.name}` }, p.name, p.id)}>
            <span className="flex items-center gap-2"><Avatar name={p.name} />{p.name}</span><span className="text-[11px] text-ink-2">{p.title}</span>
          </button>
        ))}
        {tab === 'HEAD' && (
          <button type="button" className={row(curId === 'HEAD')} onClick={() => pick({ kind: 'HEAD' }, 'R&D head')}>
            R&amp;D head<span className="text-[11px] text-ink-2">goes to the exceptions inbox</span>
          </button>
        )}
      </div>
      {cur && (
        <button type="button" onClick={() => { setWaitingOn(t.id, null); onDone({ lines: [<><b>{t.title}</b> is no longer waiting.</>] }); }}
          className="mt-3 w-full rounded-input border border-line py-2 text-[12px] text-ink-2 hover:text-ink">
          Clear: not waiting any more
        </button>
      )}
    </Sheet>
  );
}

function Toast({ phone, flash, onClose }: { phone: boolean; flash: Flash; onClose: () => void }) {
  return (
    <div role="status" className={cx(phone ? 'absolute inset-x-3 bottom-4' : 'fixed bottom-6 left-1/2 w-[560px] -translate-x-1/2', 'z-50 rounded-card bg-ink px-4 py-3 text-[12px] text-surface shadow-popover')}>
      <div className="flex gap-3">
        <Check size={16} className="mt-0.5 shrink-0 text-accent-soft" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {flash.lines.map((l, i) => <div key={i}>{l}</div>)}
          {(flash.link || flash.undo) && (
            <div className="mt-1 flex gap-3">
              {flash.link && <Link to={flash.link.to} className="font-medium text-accent-soft underline underline-offset-2">{flash.link.label}</Link>}
              {flash.undo && <button type="button" onClick={flash.undo} className="inline-flex items-center gap-1 font-medium text-accent-soft"><Undo2 size={12} aria-hidden /> Undo</button>}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Dismiss" className="self-start text-surface/60 hover:text-surface"><X size={14} /></button>
      </div>
    </div>
  );
}

// ---- Side panel: what the system did with your taps -------------------------------------------------------

const ACTION_TEXT: Record<string, string> = {
  TASK_COMPLETE: 'Marked done', TASK_CREATE: 'Added task', TASK_UPDATE: 'Updated task', FORECAST_MOVE: 'Moved forecast',
  WAITING_ON: 'Flagged waiting on', REQUEST_RAISE: 'Raised request', REQUEST_ACCEPT: 'Accepted commitment',
};

function SidePanel() {
  const me = useStore((s) => s.currentPersonId);
  const log = useStore((s) => s.actionLog);
  const requests = useStore((s) => s.requests);
  const tasks = useStore((s) => s.tasks);
  const teams = useStore((s) => s.teams);
  const emails = useStore((s) => s.emails);
  const navigate = useNavigate();
  const mine = useMemo(() => log.filter((l) => l.byId === me).slice(-8).reverse(), [log, me]);
  const myReqs = useMemo(() => requests.filter((r) => r.raisedById === me).slice(-6).reverse(), [requests, me]);
  const myMail = emails.filter((e) => e.ccIds?.includes(me) || e.toIds.includes(me)).length;
  const titleOf = (id: string) => tasks.find((t) => t.id === id)?.title ?? requests.find((r) => r.id === id)?.title ?? id;

  return (
    <aside className="flex flex-col gap-6">
      <section className="card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold">What your taps did</h2>
          <p className="text-table text-ink-2">Every update is logged and reaches the team page and the tower at once.</p>
        </div>
        <ul>
          {mine.length === 0 && <li className="px-4 py-6 text-center text-table text-ink-2">Nothing yet today. Tap ✓, ↷ or ⚑ on a task.</li>}
          {mine.map((l) => (
            <li key={l.id} className="border-b border-line px-4 py-2 last:border-0">
              <div className="text-table"><span className="font-medium">{ACTION_TEXT[l.action] ?? l.action.toLowerCase().replace(/_/g, ' ')}</span> · {titleOf(l.entityId)}</div>
              {l.note && <div className="font-mono text-[11px] text-ink-2">{l.note}</div>}
            </li>
          ))}
        </ul>
        <Link to="/outbox" className="flex items-center gap-1.5 border-t border-line px-4 py-2 text-table text-accent hover:underline">
          <Mail size={13} aria-hidden /> <span className="num">{myMail}</span> emails involving you in the Outbox
        </Link>
      </section>
      <section className="card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold">Requests you raised</h2>
          <p className="text-table text-ink-2">Each blocker has an address and a committed date both sides see.</p>
        </div>
        <ul>
          {myReqs.length === 0 && <li className="px-4 py-6 text-center text-table text-ink-2">No requests raised.</li>}
          {myReqs.map((r) => (
            <li key={r.id} className="border-b border-line last:border-0">
              <button type="button" onClick={() => navigate(`/requests?id=${r.id}`)} className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-canvas">
                <WaitingChip to={unitLabel(teams, r.toId)} />
                <span className="min-w-0 flex-1 truncate text-table">{r.title}</span>
                <span className="shrink-0 text-right font-mono text-[11px] text-ink-2">
                  {r.id}<br />{r.committedDate ? `committed ${fmtShort(r.committedDate)}` : r.status.toLowerCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

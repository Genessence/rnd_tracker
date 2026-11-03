// #/tower: the head's one screen. KPIs, exceptions inbox, blocker heatmap, load and the portfolio board.
import * as HoverCard from '@radix-ui/react-hover-card';
import { ArrowRight, Check, CornerUpLeft, CalendarCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../app/Shell';
import { cx, DatePair, KpiTile, RagDot, WaitingChip, type KpiTileProps } from '../../design';
import { countTasks, isOpen, needsHead, projectsAtRed } from '../../domain/metrics';
import { headId } from '../../domain/rules';
import type { Exception, ExceptionAction, Project, RuleId } from '../../domain/types';
import { fmtLong, fmtShort } from '../../lib/dates';
import { AGE_BUCKETS, blockerHeatmap, isRequestLive, shortTeam, topLoad, useExceptions, useKpis } from '../../store/selectors';
import { useStore } from '../../store/store';

export function TowerPage() {
  const today = useStore((s) => s.demoToday);
  return (
    <>
      <PageHeader
        title="Control Tower"
        subtitle={<>Portfolio as of <span className="font-mono text-ink">{fmtLong(today)}</span>. Only what needs you.</>}
      />
      <KpiStrip />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_440px] gap-6">
        <ExceptionsInbox />
        <div className="flex flex-col gap-6">
          <BlockerHeatmap />
          <LoadTop10 />
        </div>
      </div>
      <PortfolioBoard />
    </>
  );
}

// ---- KPI strip with per-team breakdown on hover ------------------------------------------------------------

type KpiKey = 'open' | 'overdue' | 'dueThisWeek' | 'waiting' | 'needsHead' | 'projectsAtRed';
const KPIS: { key: KpiKey; deck: keyof DeckRow; label: string; tone: KpiTileProps['tone'] }[] = [
  { key: 'open', deck: 'openItems', label: 'Open items', tone: 'default' },
  { key: 'overdue', deck: 'overdue', label: 'Overdue', tone: 'late' },
  { key: 'dueThisWeek', deck: 'dueThisWeek', label: 'Due this week', tone: 'default' },
  { key: 'waiting', deck: 'waitingOnOthers', label: 'Waiting on others', tone: 'wait' },
  { key: 'needsHead', deck: 'needsHead', label: 'Needs head', tone: 'accent' },
  { key: 'projectsAtRed', deck: 'projectsAtRed', label: 'Projects at red', tone: 'late' },
];
type DeckRow = { openItems: number; overdue: number; dueThisWeek: number; waitingOnOthers: number; needsHead: number; projectsAtRed: number };

function KpiStrip() {
  const total = useKpis();
  const tasks = useStore((s) => s.tasks);
  const decisions = useStore((s) => s.decisions);
  const projects = useStore((s) => s.projects);
  const teams = useStore((s) => s.teams);
  const deckKpis = useStore((s) => s.deckKpis) as Record<string, DeckRow>;
  const today = useStore((s) => s.demoToday);
  const perTeam = useMemo(
    () => Object.keys(deckKpis).map((teamId) => ({
      teamId,
      name: shortTeam(teams.find((t) => t.id === teamId)?.name ?? teamId),
      k: { ...countTasks(tasks, today, teamId), needsHead: needsHead(tasks, decisions, teamId), projectsAtRed: projectsAtRed(projects, teamId) },
    })),
    [deckKpis, teams, tasks, decisions, projects, today],
  );
  const deckTotal = (k: keyof DeckRow) => Object.values(deckKpis).reduce((n, r) => n + r[k], 0);

  return (
    <section aria-label="Headline numbers" className="grid grid-cols-6 gap-3">
      {KPIS.map(({ key, deck, label, tone }) => (
        <HoverCard.Root key={key} openDelay={150} closeDelay={50}>
          <HoverCard.Trigger asChild>
            <div tabIndex={0} className="outline-none">
              <KpiTile
                label={label}
                value={total[key]}
                tone={tone}
                delta={total[key] - deckTotal(deck)}
                hint={<span>vs 13 Oct deck <span className="num">{deckTotal(deck)}</span></span>}
                className="w-full"
              />
            </div>
          </HoverCard.Trigger>
          <HoverCard.Portal>
            <HoverCard.Content sideOffset={6} className="z-40 w-64 rounded-card border border-line bg-surface p-3 shadow-popover">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-2">{label} by team</div>
              <table className="w-full text-table">
                <tbody>
                  {perTeam.map((t) => (
                    <tr key={t.teamId} className="border-t border-line first:border-0">
                      <td className="py-1"><Link to={`/team/${t.teamId}`} className="hover:text-accent">{t.name}</Link></td>
                      <td className="num py-1 text-right">{t.k[key]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </HoverCard.Content>
          </HoverCard.Portal>
        </HoverCard.Root>
      ))}
    </section>
  );
}

// ---- Exceptions inbox --------------------------------------------------------------------------------------

const RULE_LABEL: Record<RuleId, string> = {
  R1: 'Slip', R2: 'Past milestone', R3: 'Needs decision', R4: 'Stale', R5: 'Overload', R6: 'Not acknowledged',
};
const RULE_TONE: Record<RuleId, string> = {
  R1: 'bg-late-soft text-late', R2: 'bg-late-soft text-late', R3: 'bg-accent-soft text-accent',
  R4: 'bg-hold-soft text-ink-2', R5: 'bg-risk-soft text-risk', R6: 'bg-wait-soft text-wait',
};

function ExceptionsInbox() {
  const all = useExceptions();
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const decisions = useStore((s) => s.decisions);
  const log = useStore((s) => s.actionLog);
  const head = headId({ people });
  const [filter, setFilter] = useState<RuleId | 'ALL'>('ALL');
  const inbox = useMemo(
    () => all.filter((e) => e.routedToId === head).sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.since.localeCompare(b.since)),
    [all, head],
  );
  const rules = [...new Set(inbox.map((e) => e.ruleId))].sort();
  const shown = filter === 'ALL' ? inbox : inbox.filter((e) => e.ruleId === filter);
  const cleared = log.filter((l) => l.action.startsWith('EXCEPTION_')).slice(-4).reverse();
  const teamName = (id: string) => shortTeam(teams.find((t) => t.id === id)?.name ?? id);
  const person = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const tasks = useStore((s) => s.tasks);
  const titleOf = (id: string) => decisions.find((d) => d.id === id)?.title ?? tasks.find((t) => t.id === id)?.title ?? id;

  return (
    <section className="card flex flex-col" aria-label="Exceptions inbox">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Exceptions inbox</h2>
          <p className="text-table text-ink-2">Routed to you by the rules engine. Clear each one with an action; every action is logged.</p>
        </div>
        <span className="num text-kpi font-medium text-accent">{inbox.length}</span>
      </div>
      <div className="flex gap-1.5 border-b border-line px-4 py-2">
        {(['ALL', ...rules] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setFilter(r)}
            className={cx('rounded-full border px-2.5 py-0.5 text-[12px]', filter === r ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:text-ink')}
          >
            {r === 'ALL' ? 'All' : `${r} · ${RULE_LABEL[r]}`}
            <span className="num ml-1.5">{r === 'ALL' ? inbox.length : inbox.filter((e) => e.ruleId === r).length}</span>
          </button>
        ))}
      </div>
      <ul className="relative max-h-[560px] flex-1 overflow-y-auto">
        {shown.length === 0 && <li className="px-4 py-12 text-center text-ink-2">Inbox clear. Nothing needs you right now.</li>}
        {shown.map((e) => (
          <ExceptionRow key={e.id} ex={e} team={teamName(e.teamId)} raisedBy={decisions.find((d) => d.id === e.entityId)?.raisedById} person={person} />
        ))}
      </ul>
      {cleared.length > 0 && (
        <div className="border-t border-line bg-canvas px-4 py-2.5">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-2">Recently cleared · logged</div>
          <ul className="flex flex-col gap-0.5">
            {cleared.map((l) => (
              <li key={l.id} className="flex items-center gap-2 text-table">
                <Check size={12} className="text-ok" aria-hidden />
                <span className="font-mono text-ink-2">{l.at}</span>
                <span className="font-medium">{l.action.replace('EXCEPTION_', '').replace('_', ' ').toLowerCase()}</span>
                <span className="truncate text-ink-2">{titleOf(l.entityId.split(':')[1])}{l.note ? ` · “${l.note}”` : ''}</span>
                <span className="ml-auto shrink-0 text-ink-2">{person(l.byId)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ExceptionRow({ ex, team, raisedBy, person }: { ex: Exception; team: string; raisedBy?: string; person: (id: string) => string }) {
  const decide = useStore((s) => s.decideException);
  const [mode, setMode] = useState<ExceptionAction | null>(null);
  const [note, setNote] = useState('');
  const needsNote = mode === 'PUSH_BACK';
  const dateRule = ex.ruleId === 'R1' || ex.ruleId === 'R2';
  const submit = () => { if (mode && (!needsNote || note.trim())) decide(ex, mode, note.trim()); };
  const href = useStore((s) => {
    const id = ex.entityId;
    if (id.includes(':')) return `/projects/${id.split(':')[0]}`;
    if (s.requests.some((r) => r.id === id)) return `/requests?id=${id}`;
    const t = s.tasks.find((x) => x.id === id);
    if (t) return t.projectId ? `/projects/${t.projectId}` : `/team/${t.teamId}`;
    return `/team/${ex.teamId}`;
  });
  const allChanges = useStore((s) => s.dateChanges);
  const trail = useMemo(() => allChanges.filter((c) => c.entityId === ex.entityId).slice(-3), [allChanges, ex.entityId]);
  const projectId = useStore((s) => s.tasks.find((t) => t.id === ex.entityId)?.projectId);
  const meetings = useStore((s) => s.meetings);
  const moms = useStore((s) => s.moms);
  const mom = useMemo(() => {
    const m = [...moms].reverse().find((x) => x.status === 'PUBLISHED' && meetings.find((mt) => mt.id === x.meetingId)?.scope.projectId === projectId);
    return m && projectId ? { mom: m, meeting: meetings.find((mt) => mt.id === m.meetingId)! } : null;
  }, [moms, meetings, projectId]);
  const reasons = useStore((s) => s.reasonCodes);
  const teams = useStore((s) => s.teams);
  const reasonLabel = (code: string) => reasons.find((r) => r.code === code)?.label ?? code;
  const teamLabel = (id?: string) => (id ? shortTeam(teams.find((t) => t.id === id)?.name ?? id) : '');
  const primary: { action: ExceptionAction; label: string; icon: JSX.Element } = dateRule
    ? { action: 'ACCEPT_DATE', label: 'Accept date', icon: <CalendarCheck size={13} aria-hidden /> }
    : { action: 'DECIDE', label: 'Decide', icon: <Check size={13} aria-hidden /> };

  return (
    <li className={cx('border-b border-line px-4 py-3 last:border-0', mode && 'bg-accent-soft/40')}>
      <div className="flex items-start gap-3">
        <span className={cx('mt-0.5 shrink-0 rounded px-1.5 py-px font-mono text-[11px] font-medium', RULE_TONE[ex.ruleId])} title={RULE_LABEL[ex.ruleId]}>
          {ex.ruleId}
        </span>
        <div className="min-w-0 flex-1">
          <Link to={href} className="font-medium hover:text-accent hover:underline">{ex.title}</Link>
          <div className="text-table text-ink-2">{ex.detail}</div>
          {(trail.length > 0 || (mom && dateRule)) && (
            <ul className="mt-1.5 flex flex-col gap-0.5 border-l-2 border-line pl-2 text-[11px] text-ink-2" aria-label="Trail">
              {trail.map((c) => (
                <li key={c.id}>
                  <span className="font-mono">{fmtShort(c.at)}</span> · {person(c.byId)} moved {c.field} <span className="font-mono text-ink">{fmtShort(c.from)} → {fmtShort(c.to)}</span> · {reasonLabel(c.reasonCode)}{c.attributedTo ? ` · booked to ${teamLabel(c.attributedTo)}` : ''}
                </li>
              ))}
              {mom && dateRule && mom.mom.decisions.map((d, i) => (
                <li key={i}>
                  <span className="font-mono">{fmtShort(mom.meeting.start.slice(0, 10))}</span> · <Link to={`/meetings/${mom.meeting.id}`} className="text-accent hover:underline">{mom.meeting.title}</Link> decided: “{d.text}”
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-2">
            <span className="rounded border border-line px-1">{team}</span>
            {raisedBy && <span>raised by {person(raisedBy)}</span>}
            <span className="font-mono">since {fmtShort(ex.since)}</span>
          </div>
        </div>
        {!mode && (
          <div className="flex shrink-0 gap-1.5">
            <button type="button" onClick={() => setMode(primary.action)} className="inline-flex h-7 items-center gap-1 rounded-input bg-accent px-2.5 text-[12px] font-medium text-surface hover:brightness-110">
              {primary.icon}{primary.label}
            </button>
            <button type="button" onClick={() => setMode('PUSH_BACK')} className="inline-flex h-7 items-center gap-1 rounded-input border border-line bg-surface px-2.5 text-[12px] font-medium hover:border-accent">
              <CornerUpLeft size={13} aria-hidden />Push back
            </button>
          </div>
        )}
      </div>
      {mode && (
        <form className="ml-9 mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={needsNote ? 'Why are you pushing back? (required)' : 'One-line note (optional)'}
            className="h-8 flex-1 rounded-input border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-accent"
          />
          <button type="submit" disabled={needsNote && !note.trim()} className="h-8 rounded-input bg-accent px-3 text-[12px] font-medium text-surface disabled:opacity-40">
            {mode === 'PUSH_BACK' ? 'Push back' : primary.label}
          </button>
          <button type="button" onClick={() => { setMode(null); setNote(''); }} className="h-8 rounded-input px-2 text-[12px] text-ink-2 hover:text-ink">Cancel</button>
        </form>
      )}
    </li>
  );
}

// ---- Department blocker heatmap ----------------------------------------------------------------------------

function BlockerHeatmap() {
  const navigate = useNavigate();
  const requests = useStore((s) => s.requests);
  const teams = useStore((s) => s.teams);
  const today = useStore((s) => s.demoToday);
  const rows = useMemo(() => blockerHeatmap(requests, today), [requests, today]);
  const max = Math.max(1, ...rows.flatMap((r) => r.cells));
  const name = (id: string) => shortTeam(teams.find((t) => t.id === id)?.name ?? id);
  const top = rows[0];

  return (
    <section className="card p-4" aria-label="Department blocker heatmap">
      <h2 className="text-[15px] font-semibold">Who is holding work</h2>
      <p className="mb-3 text-table text-ink-2">
        Open requests by receiving team, by age.{top && <> <span className="font-medium text-wait">{name(top.toId)}</span> holds the most: <span className="num text-ink">{top.total}</span>.</>}
      </p>
      <table className="w-full table-fixed text-table">
        <thead>
          <tr className="text-[11px] text-ink-2">
            <th className="w-[38%] pb-1 text-left font-medium">Receiving</th>
            {AGE_BUCKETS.map((b) => <th key={b} className="pb-1 font-mono font-medium">{b}d</th>)}
            <th className="pb-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.toId} className="cursor-pointer hover:bg-canvas" onClick={() => navigate(`/requests?to=${r.toId}`)} title={`Open ${name(r.toId)} queue`}>
              <td className="truncate py-0.5 pr-2">{name(r.toId)}</td>
              {r.cells.map((n, i) => {
                const pct = n ? 12 + Math.round((n / max) * 78) : 0;
                return (
                  <td key={i} className="p-0.5">
                    <div
                      className={cx('num grid h-7 place-items-center rounded-[4px] text-[12px]', pct > 50 ? 'text-surface' : n ? 'text-wait' : 'text-line')}
                      style={{ background: n ? `color-mix(in srgb, var(--wait) ${pct}%, var(--surface))` : 'var(--canvas)' }}
                    >
                      {n || '·'}
                    </div>
                  </td>
                );
              })}
              <td className="num py-0.5 text-right font-medium">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---- Load per person ---------------------------------------------------------------------------------------

function LoadTop10() {
  const tasks = useStore((s) => s.tasks);
  const people = useStore((s) => s.people);
  const today = useStore((s) => s.demoToday);
  const cap = useStore((s) => s.settings.r5WeeklyCapacity);
  const rows = useMemo(() => topLoad({ tasks, people, demoToday: today }), [tasks, people, today]);
  const scale = Math.max(cap * 1.5, ...rows.map((r) => r.load));
  return (
    <section className="card p-4" aria-label="Load per person">
      <h2 className="text-[15px] font-semibold">Load this week · top 10</h2>
      <p className="mb-3 text-table text-ink-2">Load points against a capacity of <span className="num">{cap}</span>.</p>
      <ul className="flex flex-col gap-1.5">
        {rows.map(({ person, load }) => (
          <li key={person.id} className="grid grid-cols-[130px_1fr_32px] items-center gap-2 text-table">
            <span className="truncate">{person.name}</span>
            <span className="relative h-2.5 rounded-full bg-canvas">
              <span className={cx('absolute inset-y-0 left-0 rounded-full', load > cap * 1.2 ? 'bg-late' : load > cap ? 'bg-risk' : 'bg-accent')} style={{ width: `${(load / scale) * 100}%` }} />
              <span aria-hidden className="absolute -top-0.5 h-3.5 w-px bg-ink" style={{ left: `${(cap / scale) * 100}%` }} />
            </span>
            <span className="num text-right">{load}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- Portfolio board ---------------------------------------------------------------------------------------

const COLUMNS = [
  { id: 'CE', label: 'Concept' }, { id: 'PROTO', label: 'Proto' }, { id: 'DV', label: 'Design validation' },
  { id: 'PP', label: 'Pilot production' }, { id: 'MP', label: 'Mass production' }, { id: 'OTHER', label: 'Tooling, infra, on hold' },
] as const;
const RAG_ORDER = { red: 0, amber: 1, green: 2 } as const;

function PortfolioBoard() {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const requests = useStore((s) => s.requests);
  const teams = useStore((s) => s.teams);
  const [team, setTeam] = useState<string>('ALL');
  const cards = useMemo(() => projects.map((p) => {
    const open = tasks.filter((t) => t.projectId === p.id && isOpen(t));
    const forecast = open.reduce((m, t) => (t.forecastDate > m ? t.forecastDate : m), p.nextMilestoneDate ?? '');
    const waitingOn = requests.find((r) => r.projectId === p.id && isRequestLive(r))?.toId;
    return { p, forecast, waitingOn, open: open.length };
  }), [projects, tasks, requests]);
  const modelTeams = teams.filter((t) => projects.some((p) => p.teamId === t.id));
  const visible = cards.filter((c) => team === 'ALL' || c.p.teamId === team);
  const col = (p: Project) => (['CE', 'PROTO', 'DV', 'PP', 'MP'].includes(p.stage) && !p.onHold ? p.stage : 'OTHER');
  const name = (id: string) => shortTeam(teams.find((t) => t.id === id)?.name ?? id);

  return (
    <section className="mt-6" aria-label="Portfolio board">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">Portfolio by stage</h2>
          <p className="text-table text-ink-2"><span className="num">{visible.length}</span> projects · next milestone shown as committed → forecast from open tasks</p>
        </div>
        <div className="flex gap-1">
          {[{ id: 'ALL', name: 'All teams' }, ...modelTeams].map((t) => (
            <button key={t.id} type="button" onClick={() => setTeam(t.id)}
              className={cx('rounded-full border px-2.5 py-0.5 text-[12px]', team === t.id ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2 hover:text-ink')}>
              {t.id === 'ALL' ? t.name : shortTeam(t.name)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-6 gap-3">
        {COLUMNS.map((c) => {
          const list = visible.filter((x) => col(x.p) === c.id).sort((a, b) => RAG_ORDER[a.p.rag] - RAG_ORDER[b.p.rag]);
          return (
            <div key={c.id} className="flex flex-col rounded-card border border-line bg-canvas">
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="text-[12px] font-semibold">{c.label}</span>
                <span className="num text-[12px] text-ink-2">{list.length}</span>
              </div>
              <div className="relative flex max-h-[560px] flex-col gap-2 overflow-y-auto p-2">
                {list.length === 0 && <div className="py-6 text-center text-table text-ink-2">No projects</div>}
                {list.map(({ p, forecast, waitingOn }) => (
                  <Link key={p.id} to={`/projects/${p.id}`} className={cx('group block rounded-input border bg-surface p-2.5 hover:border-accent', p.rag === 'red' ? 'border-l-[3px] border-line border-l-late' : 'border-line')}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-[12px] font-medium leading-4">{p.name}</span>
                      <RagDot rag={p.rag} className="mt-1" />
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-2">
                      <span>{name(p.teamId)}</span>
                      {p.customer && <><span aria-hidden>·</span><span>{p.customer}</span></>}
                      {c.id === 'OTHER' && <span className="ml-auto font-mono uppercase">{p.onHold ? 'hold' : p.stage.toLowerCase()}</span>}
                    </div>
                    {p.nextMilestoneDate && (
                      <div className="mt-2 border-t border-line pt-1.5">
                        <div className="truncate text-[11px] text-ink-2">{p.nextMilestone}</div>
                        <DatePair committed={p.nextMilestoneDate} forecast={forecast} className="text-[11px]" />
                      </div>
                    )}
                    {waitingOn && <WaitingChip to={name(waitingOn)} className="mt-1.5" />}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Link to="/projects" className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">All projects <ArrowRight size={12} aria-hidden /></Link>
    </section>
  );
}

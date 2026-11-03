// #/team/:teamId: the team leader's page. Same building blocks as the deck's team page, live.
import { ArrowRight, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Avatar, PageHeader } from '../../app/Shell';
import { cx, DatePair, KpiTile, RagDot, StageRail, WaitingChip, type KpiTileProps } from '../../design';
import { isDueThisWeek, isOpen, isOverdue, isWaitingOnHead, personLoad } from '../../domain/metrics';
import type { DeckKpi, Task } from '../../domain/types';
import { daysBetween, fmtLong, fmtShort, weekStart } from '../../lib/dates';
import { blockerHeatmap, isRequestLive, useKpis } from '../../store/selectors';
import { useStore } from '../../store/store';
import { requestIdOf, unitLabel, waitingLabel } from '../myday/labels';

export function TeamPage() {
  const { teamId = 'rac' } = useParams();
  const teams = useStore((s) => s.teams);
  const people = useStore((s) => s.people);
  const today = useStore((s) => s.demoToday);
  const navigate = useNavigate();
  const team = teams.find((t) => t.id === teamId);
  if (!team) return <Navigate to="/team/rac" replace />;
  const leader = people.find((p) => p.id === team.leaderId);
  const rdTeams = teams.filter((t) => t.kind === 'model' || t.kind === 'support-rnd');

  return (
    <>
      <PageHeader
        title={team.name}
        subtitle={<>Led by {leader?.name ?? '—'} · live as of <span className="font-mono text-ink">{fmtLong(today)}</span></>}
        actions={
          <label className="flex items-center gap-2 text-table text-ink-2">
            Team
            <select
              value={teamId}
              onChange={(e) => navigate(`/team/${e.target.value}`)}
              className="h-8 rounded-input border border-line bg-surface px-2 text-[12px] text-ink"
            >
              {rdTeams.map((t) => <option key={t.id} value={t.id}>{unitLabel(teams, t.id)}</option>)}
            </select>
          </label>
        }
      />
      <KpiStrip teamId={teamId} />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_400px] gap-6">
        <div className="flex min-w-0 flex-col gap-6">
          <ProjectTable teamId={teamId} />
          <TeamTodo teamId={teamId} />
        </div>
        <div className="flex flex-col gap-6">
          <TeamLoad teamId={teamId} />
          <WaitingOnOthers teamId={teamId} />
          <GoesToHead teamId={teamId} />
        </div>
      </div>
    </>
  );
}

// ---- KPI strip ---------------------------------------------------------------------------------------------

const KPIS: { key: keyof ReturnType<typeof useKpis>; deck: keyof DeckKpi; label: string; tone: KpiTileProps['tone'] }[] = [
  { key: 'open', deck: 'openItems', label: 'Open items', tone: 'default' },
  { key: 'overdue', deck: 'overdue', label: 'Overdue', tone: 'late' },
  { key: 'dueThisWeek', deck: 'dueThisWeek', label: 'Due this week', tone: 'default' },
  { key: 'waiting', deck: 'waitingOnOthers', label: 'Waiting on others', tone: 'wait' },
  { key: 'needsHead', deck: 'needsHead', label: 'Goes to head', tone: 'accent' },
  { key: 'projectsAtRed', deck: 'projectsAtRed', label: 'Projects at red', tone: 'late' },
];

function KpiStrip({ teamId }: { teamId: string }) {
  const k = useKpis(teamId);
  const deck = useStore((s) => (s.deckKpis as Record<string, DeckKpi | undefined>)[teamId]);
  return (
    <section aria-label="Team numbers" className="grid grid-cols-6 gap-3">
      {KPIS.map(({ key, deck: dk, label, tone }) => {
        const ref = deck?.[dk] as number | undefined;
        return (
          <KpiTile
            key={key}
            label={label}
            value={k[key]}
            tone={tone}
            delta={ref === undefined ? undefined : k[key] - ref}
            hint={ref === undefined ? undefined : <span>vs 13 Oct deck <span className="num">{ref}</span></span>}
            className="w-full"
          />
        );
      })}
    </section>
  );
}

// ---- Projects ----------------------------------------------------------------------------------------------

function ProjectTable({ teamId }: { teamId: string }) {
  const allProjects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const people = useStore((s) => s.people);
  const projects = useMemo(() => allProjects.filter((p) => p.teamId === teamId), [allProjects, teamId]);
  const rows = useMemo(
    () => projects.map((p) => {
      const open = tasks.filter((t) => t.projectId === p.id && isOpen(t));
      return { p, open: open.length, waiting: open.filter((t) => t.waitingOn && t.waitingOn.kind !== 'NOTE').length };
    }),
    [projects, tasks],
  );
  return (
    <section className="card" aria-label="Projects">
      <SectionHead title="Projects" count={projects.length} hint="Stage, next milestone and live task counts" />
      <table className="w-full text-table">
        <thead className="text-left text-[11px] uppercase tracking-wide text-ink-2">
          <tr className="border-b border-line">
            <th className="px-4 py-2 font-medium">Project</th>
            <th className="px-2 py-2 font-medium">Stage</th>
            <th className="px-2 py-2 font-medium">Next milestone</th>
            <th className="px-2 py-2 text-right font-medium">Open</th>
            <th className="px-2 py-2 text-right font-medium">Waiting</th>
            <th className="px-4 py-2 font-medium">Owner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, open, waiting }) => (
            <tr key={p.id} className="border-b border-line last:border-0 hover:bg-canvas">
              <td className="px-4 py-2.5">
                <Link to={`/projects/${p.id}`} className="flex items-center gap-2 font-medium hover:text-accent">
                  <RagDot rag={p.rag} />
                  <span className="truncate">{p.name}</span>
                </Link>
                {p.note && <div className="mt-0.5 truncate pl-4 text-[11px] text-ink-2">{p.note}</div>}
              </td>
              <td className="px-2 py-2.5"><StageRail stage={p.stage} onHold={p.onHold} size="sm" /></td>
              <td className="px-2 py-2.5">
                {p.nextMilestone ? (
                  <>
                    <div>{p.nextMilestone}</div>
                    {p.nextMilestoneDate && <div className="num text-[11px] text-ink-2">{fmtShort(p.nextMilestoneDate)}</div>}
                  </>
                ) : <span className="text-ink-2">—</span>}
              </td>
              <td className="num px-2 py-2.5 text-right">{open}</td>
              <td className={cx('num px-2 py-2.5 text-right', waiting > 0 ? 'text-wait' : 'text-ink-2')}>{waiting}</td>
              <td className="px-4 py-2.5 text-ink-2">{people.find((x) => x.id === p.ownerId)?.name ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---- Team to-do with tabs ----------------------------------------------------------------------------------

type Tab = 'today' | 'week' | 'month' | 'all';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All open' },
];

function TeamTodo({ teamId }: { teamId: string }) {
  const allTasks = useStore((s) => s.tasks);
  const today = useStore((s) => s.demoToday);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const projects = useStore((s) => s.projects);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('today');
  const monthEnd = today.slice(0, 8) + '31'; // string compare: any day of this month sorts <= "yyyy-MM-31"
  const filters: Record<Tab, (t: Task) => boolean> = {
    today: (t) => t.forecastDate <= today,
    week: (t) => isDueThisWeek(t, today),
    month: (t) => t.forecastDate >= today && t.forecastDate <= monthEnd,
    all: () => true,
  };
  const open = useMemo(
    () => allTasks.filter((t) => t.teamId === teamId && isOpen(t)).sort((a, b) => a.forecastDate.localeCompare(b.forecastDate)),
    [allTasks, teamId],
  );
  const shown = open.filter(filters[tab]);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;

  return (
    <section className="card" aria-label="Team to-do">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Team to-do</h2>
          <p className="text-table text-ink-2">Every open item, nearest first. “Today” includes anything overdue.</p>
        </div>
        <div role="tablist" className="flex gap-1 rounded-input border border-line bg-canvas p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cx('rounded-[4px] px-2.5 py-1 text-[12px] font-medium', tab === t.id ? 'bg-surface text-accent shadow-[0_0_0_1px_var(--line)]' : 'text-ink-2 hover:text-ink')}
            >
              {t.label}<span className="num ml-1.5">{open.filter(filters[t.id]).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-table">
          <tbody>
            {shown.length === 0 && <tr><td className="px-4 py-10 text-center text-ink-2">Nothing in this window.</td></tr>}
            {shown.map((t) => {
              const w = waitingLabel(teams, t.waitingOn);
              const rid = requestIdOf(t.waitingOn);
              const late = isOverdue(t, today);
              return (
                <tr key={t.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="w-2 py-2 pl-4">
                    <span aria-hidden className={cx('block h-2 w-2 rounded-full', late ? 'bg-late' : t.forecastDate === today ? 'bg-risk' : 'bg-line')} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-[11px] text-ink-2">
                      {projects.find((p) => p.id === t.projectId)?.name ?? 'No project'}
                      {late && <span className="ml-2 font-medium text-late">Overdue</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {w && <WaitingChip className="max-w-[200px]" to={w} onClick={rid ? () => navigate(`/requests?id=${rid}`) : undefined} />}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-ink-2">{t.ownerIds.map(name).join(', ')}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right"><DatePair committed={t.committedDate} forecast={t.forecastDate} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---- Team load ---------------------------------------------------------------------------------------------

function TeamLoad({ teamId }: { teamId: string }) {
  const allPeople = useStore((s) => s.people);
  const tasks = useStore((s) => s.tasks);
  const today = useStore((s) => s.demoToday);
  const cap = useStore((s) => s.settings.r5WeeklyCapacity);
  const rows = useMemo(() => {
    const ws = weekStart(today);
    return allPeople
      .filter((p) => p.teamId === teamId && p.role !== 'HEAD')
      .map((p) => ({ p, load: personLoad(tasks, p.id, ws), owns: tasks.some((t) => t.ownerIds.includes(p.id)) }))
      .sort((a, b) => Number(b.owns) - Number(a.owns) || b.load - a.load);
  }, [allPeople, tasks, today, teamId]);
  const none = rows.filter((r) => !r.owns).length;

  return (
    <section className="card" aria-label="Team load">
      <SectionHead title="Team load this week" hint={`Load points vs capacity ${cap}`} />
      <ul className="flex flex-col gap-2 px-4 py-3">
        {rows.map(({ p, load, owns }) => {
          const pct = Math.min(100, (load / (cap * 1.5)) * 100);
          const over = load > cap;
          return (
            <li key={p.id} className="flex items-center gap-2.5">
              <Avatar name={p.name} className={cx(!owns && 'bg-canvas text-ink-2')} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12px] font-medium">{p.name}</span>
                  {owns
                    ? <span className={cx('num text-[12px]', over ? 'text-late' : 'text-ink-2')}>{load}/{cap}</span>
                    : <span className="text-[11px] text-ink-2">—</span>}
                </div>
                {owns ? (
                  <div className="relative mt-1 h-1.5 rounded-full bg-canvas">
                    <div className={cx('h-full rounded-full', over ? 'bg-late' : load > cap * 0.8 ? 'bg-risk' : 'bg-accent')} style={{ width: `${pct}%` }} />
                    <div aria-hidden className="absolute -top-0.5 h-2.5 w-px bg-ink-2" style={{ left: `${(1 / 1.5) * 100}%` }} />
                  </div>
                ) : (
                  <div className="mt-1 inline-flex items-center gap-1 rounded border border-dashed border-risk px-1.5 py-px text-[11px] font-medium text-risk">
                    <UserX size={11} aria-hidden /> no tasks logged
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {none > 0 && (
        <div className="border-t border-line bg-risk-soft px-4 py-2 text-table text-risk">
          <span className="num font-medium">{none}</span> {none === 1 ? 'person has' : 'people have'} no tasks logged. Work you can't see can't be planned.
        </div>
      )}
    </section>
  );
}

// ---- Waiting on other teams --------------------------------------------------------------------------------

function WaitingOnOthers({ teamId }: { teamId: string }) {
  const requests = useStore((s) => s.requests);
  const teams = useStore((s) => s.teams);
  const today = useStore((s) => s.demoToday);
  const navigate = useNavigate();
  const rows = useMemo(() => blockerHeatmap(requests, today, teamId), [requests, today, teamId]);
  const live = useMemo(
    () => requests.filter((r) => r.fromTeamId === teamId && isRequestLive(r)).sort((a, b) => a.raisedAt.localeCompare(b.raisedAt)),
    [requests, teamId],
  );
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <section className="card" aria-label="Waiting on other teams">
      <SectionHead title="Waiting on other teams" count={live.length} hint="Live requests this team raised, by receiver" />
      <ul className="flex flex-col gap-1.5 px-4 py-3">
        {rows.length === 0 && <li className="py-4 text-center text-ink-2">Nobody is holding this team up.</li>}
        {rows.map((r) => (
          <li key={r.toId}>
            <button type="button" onClick={() => navigate(`/requests?to=${r.toId}`)} className="flex w-full items-center gap-2 text-left hover:text-wait">
              <span className="w-24 shrink-0 truncate text-[12px] font-medium">{unitLabel(teams, r.toId)}</span>
              <span className="h-2 flex-1 rounded-full bg-canvas">
                <span className="block h-full rounded-full bg-wait" style={{ width: `${(r.total / max) * 100}%` }} />
              </span>
              <span className="num w-6 text-right text-[12px]">{r.total}</span>
            </button>
          </li>
        ))}
      </ul>
      {live.length > 0 && (
        <ul className="max-h-56 overflow-y-auto border-t border-line">
          {live.slice(0, 8).map((r) => (
            <li key={r.id} className="border-b border-line last:border-0">
              <button type="button" onClick={() => navigate(`/requests?id=${r.id}`)} className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-canvas">
                <WaitingChip to={unitLabel(teams, r.toId)} />
                <span className="min-w-0 flex-1 truncate text-table">{r.title}</span>
                <span className="num shrink-0 text-[11px] text-ink-2">{daysBetween(r.raisedAt, today)}d · {r.status.toLowerCase()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- Goes to head ------------------------------------------------------------------------------------------

function GoesToHead({ teamId }: { teamId: string }) {
  const decisions = useStore((s) => s.decisions);
  const tasks = useStore((s) => s.tasks);
  const people = useStore((s) => s.people);
  const items = useMemo(() => [
    ...decisions.filter((d) => d.teamId === teamId).map((d) => ({ id: d.id, title: d.title, detail: d.ask, by: d.raisedById, status: d.status, outcome: d.outcome })),
    ...tasks.filter((t) => t.teamId === teamId && isWaitingOnHead(t)).map((t) => ({ id: t.id, title: t.title, detail: 'Task waiting on the R&D head', by: t.ownerIds[0], status: 'PENDING' as const, outcome: undefined })),
  ], [decisions, tasks, teamId]);
  const pending = items.filter((i) => i.status === 'PENDING').length;
  return (
    <section className="card" aria-label="Goes to head">
      <SectionHead title="Goes to head" count={pending} hint="Decisions and support asked of the R&D head" />
      <ul>
        {items.length === 0 && <li className="px-4 py-6 text-center text-ink-2">Nothing waiting on the head.</li>}
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-2.5 border-b border-line px-4 py-2.5 last:border-0">
            <ArrowRight size={14} className={cx('mt-0.5 shrink-0', i.status === 'PENDING' ? 'text-accent' : 'text-ok')} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className={cx('font-medium', i.status !== 'PENDING' && 'text-ink-2 line-through decoration-ink-2/40')}>{i.title}</div>
              <div className="text-table text-ink-2">
                {i.status === 'PENDING' ? i.detail : `${i.status === 'DECIDED' ? 'Decided' : 'Pushed back'}${i.outcome ? `: “${i.outcome}”` : ''}`}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-2">Raised by {people.find((p) => p.id === i.by)?.name ?? '—'}</div>
            </div>
            <span className={cx('shrink-0 rounded px-1.5 py-px font-mono text-[10px] font-medium', i.status === 'PENDING' ? 'bg-accent-soft text-accent' : 'bg-ok-soft text-ok')}>
              {i.status === 'PENDING' ? 'PENDING' : i.status === 'DECIDED' ? 'DECIDED' : 'PUSHED BACK'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionHead({ title, count, hint }: { title: string; count?: number; hint?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-3">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {hint && <p className="text-table text-ink-2">{hint}</p>}
      </div>
      {count !== undefined && <span className="num text-[20px] font-medium">{count}</span>}
    </div>
  );
}

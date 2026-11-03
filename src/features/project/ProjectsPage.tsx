// #/projects: portfolio list with team / stage / RAG / customer filters.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../app/Shell';
import { cx, RagDot, RAG_LABEL, StageRail } from '../../design';
import { isOpen } from '../../domain/metrics';
import type { Rag, StageCode } from '../../domain/types';
import { fmtShort } from '../../lib/dates';
import { isRequestLive, shortTeam } from '../../store/selectors';
import { useStore } from '../../store/store';

const STAGES: { code: StageCode; label: string }[] = [
  { code: 'CE', label: 'CE' }, { code: 'PROTO', label: 'Proto' }, { code: 'DV', label: 'DV' }, { code: 'PP', label: 'PP' },
  { code: 'MP', label: 'MP' }, { code: 'TOOLING', label: 'Tooling' }, { code: 'INFRA', label: 'Infra' }, { code: 'ON_HOLD', label: 'On hold' },
];
const field = 'h-8 rounded-input border border-line bg-surface px-2 text-[12px] focus:border-accent focus:outline-none';

export function ProjectsPage() {
  const navigate = useNavigate();
  const projects = useStore((s) => s.projects);
  const teams = useStore((s) => s.teams);
  const people = useStore((s) => s.people);
  const tasks = useStore((s) => s.tasks);
  const requests = useStore((s) => s.requests);
  const [team, setTeam] = useState('');
  const [stage, setStage] = useState('');
  const [rag, setRag] = useState<Rag | ''>('');
  const [customer, setCustomer] = useState('');

  const stats = useMemo(() => {
    const m = new Map<string, { open: number; waiting: number }>();
    for (const t of tasks) if (t.projectId && isOpen(t)) {
      const x = m.get(t.projectId) ?? { open: 0, waiting: 0 };
      x.open++;
      m.set(t.projectId, x);
    }
    for (const r of requests) if (r.projectId && isRequestLive(r)) {
      const x = m.get(r.projectId) ?? { open: 0, waiting: 0 };
      x.waiting++;
      m.set(r.projectId, x);
    }
    return m;
  }, [tasks, requests]);

  const modelTeams = teams.filter((t) => projects.some((p) => p.teamId === t.id));
  const customers = [...new Set(projects.map((p) => p.customer).filter(Boolean) as string[])].sort();
  const rows = projects.filter((p) =>
    (!team || p.teamId === team)
    && (!stage || (stage === 'ON_HOLD' ? p.onHold || p.stage === 'ON_HOLD' : p.stage === stage))
    && (!rag || p.rag === rag)
    && (!customer || p.customer === customer));
  const teamName = (id: string) => shortTeam(teams.find((t) => t.id === id)?.name ?? id);
  const filtered = team || stage || rag || customer;

  return (
    <>
      <PageHeader title="Projects" subtitle={<><span className="num text-ink">{rows.length}</span> of <span className="num">{projects.length}</span> projects across the model teams</>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select aria-label="Team" className={field} value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">All teams</option>
          {modelTeams.map((t) => <option key={t.id} value={t.id}>{shortTeam(t.name)}</option>)}
        </select>
        <select aria-label="Stage" className={field} value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
        <div role="group" aria-label="RAG" className="flex rounded-input border border-line bg-surface p-0.5">
          {(['', 'red', 'amber', 'green'] as const).map((r) => (
            <button
              key={r || 'all'}
              onClick={() => setRag(r)}
              aria-pressed={rag === r}
              className={cx('flex items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-[12px] font-medium',
                rag === r ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:text-ink')}
            >
              {r ? <><RagDot rag={r} />{RAG_LABEL[r]}</> : 'Any RAG'}
            </button>
          ))}
        </div>
        <select aria-label="Customer" className={field} value={customer} onChange={(e) => setCustomer(e.target.value)}>
          <option value="">All customers</option>
          {customers.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {filtered && (
          <button className="text-[12px] font-medium text-accent hover:underline" onClick={() => { setTeam(''); setStage(''); setRag(''); setCustomer(''); }}>
            Clear filters
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-table">
          <thead className="whitespace-nowrap border-b border-line bg-canvas text-left text-[11px] uppercase tracking-wide text-ink-2">
            <tr>
              <th className="px-4 py-2 font-medium">Project</th>
              <th className="px-2 py-2 font-medium">Team</th>
              <th className="px-2 py-2 font-medium">Customer</th>
              <th className="px-2 py-2 font-medium">Stage</th>
              <th className="px-2 py-2 font-medium">Next milestone</th>
              <th className="px-2 py-2 font-medium">Owner</th>
              <th className="px-2 py-2 text-right font-medium">Open tasks</th>
              <th className="px-2 py-2 text-right font-medium">Waiting</th>
              <th className="px-4 py-2 font-medium">RAG</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-ink-2">No projects match these filters.</td></tr>}
            {rows.map((p) => {
              const st = stats.get(p.id);
              return (
                <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 font-medium">
                      {p.name}
                      {p.plan && <span className="rounded bg-accent-soft px-1.5 text-[10px] font-medium uppercase tracking-wide text-accent">Full plan</span>}
                    </div>
                    {p.note && <div className="max-w-[420px] truncate text-[11px] text-ink-2">{p.note}</div>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">{teamName(p.teamId)}</td>
                  <td className="px-2 py-2">{p.customer ?? <span className="text-ink-2">–</span>}</td>
                  <td className="px-2 py-2"><StageRail stage={p.stage} onHold={p.onHold} size="sm" /></td>
                  <td className="px-2 py-2">
                    {p.nextMilestone ? <><div>{p.nextMilestone}</div>{p.nextMilestoneDate && <div className="num text-[11px] text-ink-2">{fmtShort(p.nextMilestoneDate)}</div>}</> : <span className="text-ink-2">–</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2">{people.find((x) => x.id === p.ownerId)?.name ?? '–'}</td>
                  <td className="num px-2 py-2 text-right">{st?.open ?? 0}</td>
                  <td className={cx('num px-2 py-2 text-right', st?.waiting && 'text-wait')}>{st?.waiting ?? 0}</td>
                  <td className="whitespace-nowrap px-4 py-2"><RagDot rag={p.rag} showLabel /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Delay ledger (plan section 9): where the lost days went, by reason and by department, plus every date change.
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '../../app/Shell';
import { cx, KpiTile } from '../../design';
import { daysLostByDepartment, daysLostByReason, deliveryScorecard, type Bucket } from '../../domain/ledger';
import type { DateChange } from '../../domain/types';
import { DEFAULT_DEMO_TODAY, daysBetween, fmtShort } from '../../lib/dates';
import { shortTeam } from '../../store/selectors';
import { useStore } from '../../store/store';

const field = 'h-8 rounded-input border border-line bg-surface px-2 text-[12px] text-ink';

export function LedgerPage() {
  const allChanges = useStore((s) => s.dateChanges);
  const reasonCodes = useStore((s) => s.reasonCodes);
  const teams = useStore((s) => s.teams);
  const people = useStore((s) => s.people);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const requests = useStore((s) => s.requests);
  const [params, setParams] = useSearchParams();
  const reason = params.get('reason') ?? '';
  const dept = params.get('dept') ?? '';
  const entity = params.get('entity') ?? '';
  const q = params.get('q') ?? '';
  const sinceDemo = params.get('period') === 'demo';
  const changes = useMemo(() => (sinceDemo ? allChanges.filter((c) => c.at >= DEFAULT_DEMO_TODAY) : allChanges), [allChanges, sinceDemo]);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const reasonLabel = (c: string) => reasonCodes.find((r) => r.code === c)?.label ?? c.replace(/_/g, ' ').toLowerCase();
  const deptLabel = (id: string) => (id === 'unattributed' ? 'Unattributed' : shortTeam(teams.find((t) => t.id === id)?.name ?? id));
  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? id;

  const byReason = useMemo(() => daysLostByReason(changes), [changes]);
  const byDept = useMemo(() => daysLostByDepartment(changes), [changes]);
  const total = byReason.reduce((n, b) => n + b.days, 0);

  const itemOf = (c: DateChange): { label: string; sub?: string; to?: string } => {
    if (c.entity === 'task') {
      const t = tasks.find((x) => x.id === c.entityId);
      return { label: t?.title ?? c.entityId, sub: c.entityId, to: t?.projectId ? `/projects/${t.projectId}` : undefined };
    }
    if (c.entity === 'request') {
      const r = requests.find((x) => x.id === c.entityId);
      return { label: r?.title ?? c.entityId, sub: c.entityId, to: `/requests?id=${c.entityId}` };
    }
    const [pid, aid] = c.entityId.split(':');
    const p = projects.find((x) => x.id === pid);
    const a = p?.plan?.find((x) => x.activityId === aid);
    return { label: a ? `${a.sNo} ${a.name}` : aid, sub: p?.name, to: `/projects/${pid}` };
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return changes
      .filter((c) => (!reason || c.reasonCode === reason) && (!dept || (c.attributedTo ?? 'unattributed') === dept) && (!entity || c.entity === entity))
      .filter((c) => !needle || JSON.stringify(itemOf(c)).toLowerCase().includes(needle) || c.note?.toLowerCase().includes(needle))
      .slice()
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  }, [changes, reason, dept, entity, q, tasks, requests, projects]);

  const topDept = byDept[0];
  const topReason = byReason[0];
  const filtered = !!(reason || dept || entity || q);

  return (
    <>
      <PageHeader
        title="Delay ledger"
        subtitle="Every date that moved, who moved it and why. Days lost are booked to the cause, not to whoever reported it."
        actions={
          <div className="flex rounded-input border border-line bg-surface p-0.5" role="group" aria-label="Period">
            {[['', 'All history'], ['demo', `Since ${fmtShort(DEFAULT_DEMO_TODAY)}`]].map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={(v === 'demo') === sinceDemo}
                onClick={() => set('period', v)}
                className={cx('h-7 rounded-[4px] px-3 text-[12px] font-medium', (v === 'demo') === sinceDemo ? 'bg-accent text-surface' : 'text-ink-2 hover:text-ink')}
              >
                {l}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-4 gap-3">
        <KpiTile label="Days lost" value={total} tone="late" hint="calendar days, tasks + plan activities" />
        <KpiTile label="Date changes logged" value={changes.length} hint="each one has a reason code" />
        <KpiTile
          label="Most days booked to"
          value={topDept ? `${topDept.days} d` : '—'}
          tone="wait"
          hint={topDept && <span><b className="font-semibold text-wait">{deptLabel(topDept.key)}</b> · <span className="num">{Math.round((100 * topDept.days) / (total || 1))}%</span> of days lost</span>}
          onClick={topDept ? () => set('dept', topDept.key) : undefined}
        />
        <KpiTile
          label="Top reason"
          value={topReason ? `${topReason.days} d` : '—'}
          hint={topReason && <span>{reasonLabel(topReason.key)} · <span className="num">{topReason.count}</span> change{topReason.count === 1 ? "" : "s"}</span>}
          onClick={topReason ? () => set('reason', topReason.key) : undefined}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <ChartCard title="Days lost by reason code" data={byReason} label={reasonLabel} active={reason} onPick={(k) => set('reason', reason === k ? '' : k)} />
        <ChartCard title="Days lost by department" data={byDept} label={deptLabel} active={dept} onPick={(k) => set('dept', dept === k ? '' : k)} />
      </div>

      <BookedToMyTeam />
      <Scorecard />

      <section className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="mr-2 text-[14px] font-semibold">Every date change</h2>
          <span className="num text-table text-ink-2">{rows.length} of {changes.length}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => set('q', e.target.value)} placeholder="Search item or note" className={cx(field, 'w-48')} aria-label="Search" />
            <select value={entity} onChange={(e) => set('entity', e.target.value)} className={field} aria-label="Item type">
              <option value="">All items</option>
              <option value="task">Tasks</option>
              <option value="activity">Plan activities</option>
              <option value="request">Requests</option>
            </select>
            <select value={reason} onChange={(e) => set('reason', e.target.value)} className={field} aria-label="Reason">
              <option value="">All reasons</option>
              {[...new Set(changes.map((c) => c.reasonCode))].sort().map((c) => <option key={c} value={c}>{reasonLabel(c)}</option>)}
            </select>
            <select value={dept} onChange={(e) => set('dept', e.target.value)} className={field} aria-label="Booked to">
              <option value="">All departments</option>
              {[...new Set(changes.map((c) => c.attributedTo ?? 'unattributed'))].sort().map((d) => <option key={d} value={d}>{deptLabel(d)}</option>)}
            </select>
            {filtered && (
              <button type="button" onClick={() => setParams(sinceDemo ? { period: 'demo' } : {}, { replace: true })} className={cx(field, 'inline-flex items-center gap-1 hover:border-accent hover:text-accent')}>
                <X size={13} aria-hidden /> Clear
              </button>
            )}
          </div>
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          <table className="w-full text-table">
            <thead className="sticky top-0 bg-canvas text-left text-[11px] uppercase tracking-wide text-ink-2">
              <tr>
                {['Logged', 'Item', 'Field', 'From → to', 'Moved', 'Reason', 'Booked to', 'By', 'Note'].map((h) => (
                  <th key={h} className={cx('border-b border-line px-3 py-2 font-medium', h === 'Moved' && 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-ink-2">No date change matches these filters.</td></tr>}
              {rows.map((c) => {
                const item = itemOf(c);
                const d = daysBetween(c.from, c.to);
                return (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-canvas">
                    <td className="num whitespace-nowrap px-3 py-2 text-ink-2">{fmtShort(c.at)}</td>
                    <td className="max-w-[320px] px-3 py-2">
                      {item.to ? <Link to={item.to} className="block truncate font-medium hover:text-accent">{item.label}</Link> : <span className="block truncate font-medium">{item.label}</span>}
                      {item.sub && <span className="num block truncate text-[11px] text-ink-2">{item.sub}</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{c.entity === 'request' ? 'commitment' : c.field}</td>
                    <td className="num whitespace-nowrap px-3 py-2">{fmtShort(c.from)} <span className="text-ink-2">→</span> {fmtShort(c.to)}</td>
                    <td className={cx('num px-3 py-2 text-right font-medium', d > 0 ? 'text-late' : d < 0 ? 'text-ok' : 'text-ink-2')}>{d > 0 ? `+${d}d` : d < 0 ? `−${-d}d` : '0d'}</td>
                    <td className="px-3 py-2">{reasonLabel(c.reasonCode)}</td>
                    <td className="px-3 py-2">
                      {c.attributedTo ? (
                        <button type="button" onClick={() => set('dept', c.attributedTo!)} className="rounded-full border border-wait bg-wait-soft px-2 py-px text-[11px] font-medium text-wait hover:bg-wait hover:text-surface">
                          {deptLabel(c.attributedTo)}
                        </button>
                      ) : <span className="text-ink-2">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{personName(c.byId)}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-ink-2" title={c.note}>{c.note ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-[11px] text-ink-2">
          Request commitment changes are listed for the trail but not counted in the totals: their effect is booked on the tasks and activities they moved.
        </p>
      </section>
    </>
  );
}

// ---- Booked to my team: the lead sees every day booked to their department and can dispute it once ----------------

function BookedToMyTeam() {
  const s = useStore();
  const myTeam = s.teams.find((t) => t.leaderId === s.currentPersonId);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  if (!myTeam) return null;
  const rows = s.dateChanges.filter((c) => (c.attributedTo === myTeam.id || c.dispute) && c.field === 'forecast' && c.entity !== 'request' && daysBetween(c.from, c.to) > 0)
    .filter((c) => c.attributedTo === myTeam.id || s.decisions.find((d) => d.id === c.dispute?.askId)?.raisedById === s.currentPersonId)
    .reverse();
  const what = (c: DateChange) => {
    if (c.entity === 'task') return s.tasks.find((t) => t.id === c.entityId)?.title ?? c.entityId;
    const [pid, aid] = c.entityId.split(':');
    const p = s.projects.find((x) => x.id === pid);
    const a = p?.plan?.find((x) => x.activityId === aid);
    return a ? `${a.name} · ${p!.name}` : c.entityId;
  };
  const reason = (code: string) => s.reasonCodes.find((r) => r.code === code)?.label ?? code;
  const by = (id: string) => s.people.find((p) => p.id === id)?.name ?? id;
  return (
    <section className="card mb-4">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-semibold">Booked to {shortTeam(myTeam.name)} <span className="num font-normal text-ink-2">{rows.length}</span></h2>
        <p className="text-table text-ink-2">Days other teams booked to you. Wrong? Dispute it once: the R&amp;D head decides.</p>
      </div>
      <ul className="max-h-[280px] overflow-y-auto">
        {rows.length === 0 && <li className="px-4 py-6 text-center text-table text-ink-2">Nothing booked to your team.</li>}
        {rows.map((c) => (
          <li key={c.id} className="border-b border-line px-4 py-2 last:border-0">
            <div className="flex items-center gap-3 text-table">
              <span className="num w-12 shrink-0 font-medium text-late">+{daysBetween(c.from, c.to)}d</span>
              <span className="min-w-0 flex-1 truncate">{what(c)} <span className="text-ink-2">· {reason(c.reasonCode)} · by {by(c.byId)} · {fmtShort(c.at)}</span></span>
              {c.dispute ? (
                <span className={cx('shrink-0 rounded px-1.5 py-px text-[11px] font-medium', c.dispute.status === 'OPEN' ? 'bg-risk-soft text-risk' : c.dispute.status === 'UPHELD' ? 'bg-ok-soft text-ok' : 'bg-late-soft text-late')}>
                  {c.dispute.status === 'OPEN' ? 'Disputed · with head' : c.dispute.status === 'UPHELD' ? 'Dispute upheld' : 'Dispute rejected'}
                </span>
              ) : open !== c.id && <button type="button" className="shrink-0 text-[12px] font-medium text-accent hover:underline" onClick={() => { setOpen(c.id); setNote(''); }}>Dispute</button>}
            </div>
            {open === c.id && !c.dispute && (
              <form className="mt-1.5 flex gap-1.5 pl-[60px]" onSubmit={(e) => { e.preventDefault(); if (s.disputeChange(c.id, note)) setOpen(null); }}>
                <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this is not on your team (required)" className={cx(field, 'flex-1')} />
                <button type="submit" disabled={!note.trim()} className="h-8 rounded-input bg-accent px-3 text-[12px] font-medium text-surface disabled:opacity-40">Send to head</button>
                <button type="button" onClick={() => setOpen(null)} className="h-8 px-2 text-[12px] text-ink-2">Cancel</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- Delivery scorecard: did departments deliver what they committed? ----------------------------------------------

function Scorecard() {
  const requests = useStore((s) => s.requests);
  const teams = useStore((s) => s.teams);
  const rows = useMemo(() => deliveryScorecard(requests), [requests]);
  return (
    <section className="card mb-4">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-semibold">Delivery scorecard</h2>
        <p className="text-table text-ink-2">Requests each department marked delivered, against the date it committed. Fills as requests are closed.</p>
      </div>
      <table className="w-full text-table">
        <thead><tr className="text-left text-[11px] text-ink-2"><th className="px-4 py-1.5 font-medium">Department</th><th className="py-1.5 text-right font-medium">Open</th><th className="py-1.5 text-right font-medium">Delivered</th><th className="py-1.5 text-right font-medium">On time</th><th className="px-4 py-1.5 text-right font-medium">Avg days late</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.dept} className="border-t border-line">
              <td className="px-4 py-1.5">{shortTeam(teams.find((t) => t.id === r.dept)?.name ?? r.dept)}</td>
              <td className="num py-1.5 text-right">{r.open}</td>
              <td className="num py-1.5 text-right">{r.delivered}</td>
              <td className={cx('num py-1.5 text-right', r.delivered && r.onTime < r.delivered ? 'text-late' : r.delivered ? 'text-ok' : 'text-ink-2')}>{r.delivered ? `${Math.round((100 * r.onTime) / r.delivered)}%` : '–'}</td>
              <td className="num px-4 py-1.5 text-right">{r.delivered ? r.avgDaysLate : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ChartCard({ title, data, label, active, onPick }: {
  title: string; data: Bucket[]; label: (k: string) => string; active: string; onPick: (key: string) => void;
}) {
  const rows = data.map((b) => ({ ...b, name: label(b.key) }));
  return (
    <section className="card px-4 py-3">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <span className="text-[11px] text-ink-2">Click a bar to filter the table</span>
      </div>
      {rows.length === 0 ? (
        <div className="grid h-[160px] place-items-center text-center text-ink-2">No days lost in this period yet.<br />Move a date with a reason and it lands here.</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34 + 16)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 0 }} barCategoryGap={6}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={170} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--ink)' }} />
            <Tooltip
              cursor={{ fill: 'var(--accent-soft)' }}
              contentStyle={{ border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, boxShadow: '0 8px 24px rgba(27,34,48,0.12)' }}
              formatter={(v: number, _n, p) => [`${v} days · ${(p.payload as Bucket).count} changes`, 'Lost']}
            />
            <Bar isAnimationActive={false} dataKey="days" radius={[0, 4, 4, 0]} barSize={18} onClick={(d: { key?: string }) => d.key && onPick(d.key)} className="cursor-pointer">
              {rows.map((r) => (
                <Cell key={r.key} fill={!active || active === r.key ? 'var(--accent)' : 'var(--line)'} />
              ))}
              <LabelList dataKey="days" position="right" formatter={(v: number) => `${v} d`} style={{ fontSize: 12, fontFamily: 'IBM Plex Mono', fill: 'var(--ink)' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

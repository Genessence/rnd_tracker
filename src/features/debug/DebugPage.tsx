import { useMemo } from 'react';
import { countTasks, needsHead, projectsAtRed } from '../../domain/metrics';
import { headId } from '../../domain/rules';
import { useExceptions, useKpis } from '../../store/selectors';
import { useStore } from '../../store/store';

/** Phase 1 debug view: live counts vs the deck, the head's exceptions and the raw store. */
export function DebugPage() {
  const s = useStore();
  const total = useKpis();
  const exceptions = useExceptions();
  const head = headId(s);
  const rows = useMemo(
    () => Object.entries(s.deckKpis).map(([teamId, k]) => ({
      teamId, k, c: countTasks(s.tasks, s.demoToday, teamId),
      nh: needsHead(s.tasks, s.decisions, teamId), red: projectsAtRed(s.projects, teamId),
    })),
    [s.deckKpis, s.tasks, s.decisions, s.projects, s.demoToday],
  );
  const showcase = s.projects.find((p) => p.id === 'prj-rac-01');
  const { resetDemo, ...data } = s;

  return (
    <main className="mx-auto flex max-w-content flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-title font-semibold">Debug · store at <span className="font-mono">{s.demoToday}</span></h1>
        <button type="button" onClick={resetDemo} className="rounded-input border border-line bg-surface px-3 py-1.5 hover:border-accent">Reset demo</button>
      </header>
      <section className="card overflow-x-auto p-4">
        <table className="w-full text-table">
          <thead className="text-left text-ink-2">
            <tr><th className="py-1">Team</th><th>Open</th><th>Overdue</th><th>Due this week</th><th>Waiting</th><th>Needs head</th><th>At red</th></tr>
          </thead>
          <tbody className="font-mono">
            {rows.map(({ teamId, k, c, nh, red }) => (
              <tr key={teamId} className="border-t border-line">
                <td className="py-1">{teamId}</td>
                <td>{c.open} / {k.openItems}</td><td>{c.overdue} / {k.overdue}</td><td>{c.dueThisWeek} / {k.dueThisWeek}</td>
                <td>{c.waiting} / {k.waitingOnOthers}</td><td>{nh} / {k.needsHead}</td><td>{red} / {k.projectsAtRed}</td>
              </tr>
            ))}
            <tr className="border-t border-ink font-medium">
              <td className="py-1">total</td><td>{total.open}</td><td>{total.overdue}</td><td>{total.dueThisWeek}</td>
              <td>{total.waiting}</td><td>{total.needsHead}</td><td>{total.projectsAtRed}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-ink-2">live / deck</p>
      </section>
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Exceptions: {exceptions.length} total, {exceptions.filter((e) => e.routedToId === head).length} for the head</h2>
        <ul className="max-h-64 overflow-auto font-mono text-table">
          {exceptions.map((e) => <li key={e.id}>{e.ruleId} → {e.routedToId} · {e.title} · {e.detail}</li>)}
        </ul>
      </section>
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Showcase plan ({showcase?.plan?.length} activities)</h2>
        <ul className="max-h-64 overflow-auto font-mono text-table">
          {showcase?.plan?.filter((a) => a.stage === 'DV').map((a) => (
            <li key={a.activityId}>{a.sNo} {a.status} {a.baselineStart}..{a.forecastEnd} {a.requestId ?? ''} {a.name}</li>
          ))}
        </ul>
      </section>
      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Raw store JSON</summary>
        <pre className="mt-2 max-h-[60vh] overflow-auto font-mono text-[11px]">{JSON.stringify(data, null, 1)}</pre>
      </details>
    </main>
  );
}

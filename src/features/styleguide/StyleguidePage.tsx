import type { ReactNode } from 'react';
import { DatePair, KpiTile, RagDot, SimulatedTag, StageRail, WaitingChip } from '../../design';
import type { StageCode } from '../../domain/types';

const TOKENS = ['canvas', 'surface', 'line', 'ink', 'ink-2', 'accent', 'accent-soft', 'ok', 'risk', 'late', 'wait', 'hold'];
const STAGES: StageCode[] = ['CE', 'PROTO', 'DV', 'PP', 'MP', 'TOOLING', 'INFRA', 'ON_HOLD'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="mb-4 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-center gap-4 border-t border-line py-2.5 first:border-t-0">
      <span className="font-mono text-table text-ink-2">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function StyleguidePage() {
  return (
    <main className="mx-auto flex max-w-content flex-col gap-6 px-6 py-8">
      <header>
        <p className="font-mono text-table uppercase tracking-wider text-ink-2">R&amp;D Control Tower · design system</p>
        <h1 className="text-title font-semibold">Styleguide</h1>
        <p className="mt-1 max-w-2xl text-ink-2">
          "Drawing office": warm paper, precise 1 px lines, mono numbers. Teal is the tower, violet always means waiting on someone else.
        </p>
      </header>

      <Section title="Tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {TOKENS.map((t) => (
            <div key={t} className="overflow-hidden rounded-card border border-line">
              <div className="h-12" style={{ background: `var(--${t})` }} />
              <div className="bg-surface px-2 py-1.5 font-mono text-table">--{t}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-baseline gap-6">
          <span className="text-title font-semibold">Page title 20</span>
          <span className="text-body">Body 13 IBM Plex Sans</span>
          <span className="text-table">Table 12</span>
          <span className="font-mono text-kpi">206</span>
          <span className="font-mono text-table">tsk-011 · 2026-10-16</span>
        </div>
      </Section>

      <Section title="StageRail">
        {STAGES.map((s) => (
          <Row key={s} label={s}>
            <StageRail stage={s} />
            <StageRail stage={s} size="sm" />
          </Row>
        ))}
        <Row label="DV, on hold">
          <StageRail stage="DV" onHold />
          <StageRail stage="DV" onHold size="sm" />
        </Row>
      </Section>

      <Section title="DatePair">
        <Row label="on plan"><DatePair committed="2026-10-16" forecast="2026-10-16" /></Row>
        <Row label="slipped +6d"><DatePair committed="2026-10-16" forecast="2026-10-22" /></Row>
        <Row label="early −2d"><DatePair committed="2026-10-16" forecast="2026-10-14" /></Row>
      </Section>

      <Section title="WaitingChip">
        <Row label="static">
          <WaitingChip to="DQA" />
          <WaitingChip to="Electronics" />
          <WaitingChip to="R&D head" />
        </Row>
        <Row label="clickable">
          <WaitingChip to="DQA" onClick={() => undefined} />
          <WaitingChip to="Plant (PPC)" onClick={() => undefined} />
        </Row>
      </Section>

      <Section title="RagDot">
        <Row label="with label">
          <RagDot rag="green" showLabel />
          <RagDot rag="amber" showLabel />
          <RagDot rag="red" showLabel />
        </Row>
        <Row label="dot only (sr label)">
          <RagDot rag="green" />
          <RagDot rag="amber" />
          <RagDot rag="red" />
        </Row>
      </Section>

      <Section title="KpiTile">
        <div className="flex flex-wrap gap-3">
          <KpiTile label="Open" value={206} />
          <KpiTile label="Overdue" value={42} tone="late" delta={3} goodWhen="down" hint="vs last week" />
          <KpiTile label="Due this week" value={59} delta={-4} goodWhen="down" spark={[48, 52, 61, 57, 59]} />
          <KpiTile label="Waiting on others" value={91} tone="wait" spark={[80, 84, 88, 91]} />
          <KpiTile label="Needs head" value={24} tone="accent" delta={0} onClick={() => undefined} />
        </div>
      </Section>

      <Section title="SimulatedTag">
        <Row label="default"><span>Join on Teams</span><SimulatedTag /></Row>
        <Row label="custom"><span>Upload to AQMS</span><SimulatedTag label="Simulated AQMS" /></Row>
      </Section>
    </main>
  );
}

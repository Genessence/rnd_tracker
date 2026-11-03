// Signature components (plan section 4). Use these everywhere; no stock component kit.
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { daysBetween, fmtShort } from '../lib/dates';
import type { Rag, StageCode } from '../domain/types';

export { clsx as cx };

// ---- StageRail ---------------------------------------------------------------------------------------------
const RAIL = ['CE', 'PROTO', 'DV', 'PP', 'MP'] as const;
const RAIL_LABEL: Record<(typeof RAIL)[number], string> = { CE: 'CE', PROTO: 'Proto', DV: 'DV', PP: 'PP', MP: 'MP' };
const HATCH = { backgroundImage: 'repeating-linear-gradient(135deg, var(--hold) 0 2px, var(--hold-soft) 2px 6px)' };

export interface StageRailProps {
  stage: StageCode;
  onHold?: boolean;
  /** sm: thin bar for table rows; md: labelled segments. */
  size?: 'sm' | 'md';
  className?: string;
}

/** CE / Proto / DV / PP / MP with gate diamonds. Done = ink, current = teal, future = outlined, on hold = hatched. */
export function StageRail({ stage, onHold = false, size = 'md', className }: StageRailProps) {
  const idx = RAIL.indexOf(stage as (typeof RAIL)[number]);
  const held = onHold || stage === 'ON_HOLD';
  const offRail = idx < 0 && !held ? (stage === 'TOOLING' ? 'Tooling' : stage === 'INFRA' ? 'Infra' : stage) : null;
  const sm = size === 'sm';
  const label = `Stage: ${offRail ?? (idx >= 0 ? RAIL_LABEL[RAIL[idx]] : 'unknown')}${held ? ' (on hold)' : ''}`;
  return (
    <div className={clsx('flex items-center gap-1', className)} role="img" aria-label={label} title={label}>
      {RAIL.map((s, i) => {
        const state = idx < 0 ? (held ? 'hold' : 'future') : i < idx ? 'done' : i === idx ? (held ? 'hold' : 'current') : 'future';
        return (
          <div key={s} className="flex items-center gap-1">
            {i > 0 && (
              <span
                aria-hidden
                className={clsx(
                  'block rotate-45 border',
                  sm ? 'h-1.5 w-1.5' : 'h-2 w-2',
                  idx >= 0 && i <= idx ? 'border-ink bg-ink' : 'border-ink-2 bg-surface',
                )}
              />
            )}
            <span
              aria-hidden
              style={state === 'hold' ? HATCH : undefined}
              className={clsx(
                'flex items-center justify-center rounded-[3px] border font-mono uppercase',
                sm ? 'h-1.5 w-6' : 'h-6 w-12 text-[11px] font-medium tracking-wide',
                state === 'done' && 'border-ink bg-ink text-surface',
                state === 'current' && 'border-accent bg-accent text-surface',
                state === 'future' && 'border-line bg-surface text-ink-2',
                state === 'hold' && 'border-hold text-ink',
              )}
            >
              {!sm && RAIL_LABEL[s]}
            </span>
          </div>
        );
      })}
      {offRail && <span className="ml-1 rounded-input border border-line px-1.5 font-mono text-[11px] text-ink-2">{offRail}</span>}
      {held && !sm && <span className="ml-1 font-mono text-[11px] text-hold">ON HOLD</span>}
    </div>
  );
}

// ---- DatePair ----------------------------------------------------------------------------------------------
export interface DatePairProps {
  committed: string;
  forecast: string;
  className?: string;
}

/** `committed → forecast` in mono, with a slip badge when they differ. */
export function DatePair({ committed, forecast, className }: DatePairProps) {
  const slip = daysBetween(committed, forecast);
  return (
    <span className={clsx('inline-flex items-center gap-1.5 font-mono text-table tabular-nums', className)}>
      <span className="text-ink-2" title="Committed">{fmtShort(committed)}</span>
      <span aria-hidden className="text-ink-2">→</span>
      <span className={clsx(slip > 0 ? 'text-late' : 'text-ink')} title="Forecast">{fmtShort(forecast)}</span>
      {slip !== 0 && (
        <span
          className={clsx('rounded px-1 text-[11px] font-medium', slip > 0 ? 'bg-late-soft text-late' : 'bg-ok-soft text-ok')}
          aria-label={`${Math.abs(slip)} days ${slip > 0 ? 'late' : 'early'}`}
        >
          {slip > 0 ? `+${slip}d` : `−${-slip}d`}
        </span>
      )}
    </span>
  );
}

// ---- WaitingChip -------------------------------------------------------------------------------------------
export interface WaitingChipProps {
  /** Who it waits on: "DQA", "Electronics", "R&D head". */
  to: string;
  onClick?: () => void;
  title?: string;
  className?: string;
}

/** Violet pill `⟶ DQA`. Clickable when it links to a request. */
export function WaitingChip({ to, onClick, title, className }: WaitingChipProps) {
  const cls = clsx(
    'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border border-wait bg-wait-soft px-2 py-px text-[12px] font-medium text-wait',
    onClick && 'cursor-pointer hover:bg-wait hover:text-surface',
    className,
  );
  const body = (
    <>
      <span aria-hidden>⟶</span>
      <span className="truncate">{to}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} title={title ?? `Waiting on ${to}: open request`} aria-label={`Waiting on ${to}`}>
      {body}
    </button>
  ) : (
    <span className={cls} title={title ?? `Waiting on ${to}`} aria-label={`Waiting on ${to}`}>{body}</span>
  );
}

// ---- RagDot ------------------------------------------------------------------------------------------------
export const RAG_LABEL: Record<Rag, string> = { green: 'On track', amber: 'At risk', red: 'Red' };
const RAG_COLOR: Record<Rag, string> = { green: 'bg-ok', amber: 'bg-risk', red: 'bg-late' };

/** 8 px dot with a text label (visible or screen-reader only). */
export function RagDot({ rag, showLabel = false, className }: { rag: Rag; showLabel?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5', className)} title={RAG_LABEL[rag]}>
      <span aria-hidden className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', RAG_COLOR[rag])} />
      <span className={showLabel ? 'text-table text-ink-2' : 'sr-only'}>{RAG_LABEL[rag]}</span>
    </span>
  );
}

// ---- KpiTile -----------------------------------------------------------------------------------------------
export interface KpiTileProps {
  label: string;
  value: number | string;
  /** Change vs a reference; `goodWhen` decides the colour. */
  delta?: number;
  goodWhen?: 'up' | 'down';
  spark?: number[];
  tone?: 'default' | 'late' | 'risk' | 'wait' | 'accent';
  hint?: ReactNode;
  onClick?: () => void;
  className?: string;
}

const TONE: Record<NonNullable<KpiTileProps['tone']>, string> = {
  default: 'text-ink', late: 'text-late', risk: 'text-risk', wait: 'text-wait', accent: 'text-accent',
};

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 64, h = 20;
  const min = Math.min(...values), max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / (max - min || 1)) * (h - 4)}`);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="text-ink-2">
      <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** Label, big mono number, optional delta and sparkline. */
export function KpiTile({ label, value, delta, goodWhen = 'down', spark, tone = 'default', hint, onClick, className }: KpiTileProps) {
  const good = delta !== undefined && delta !== 0 && (delta < 0) === (goodWhen === 'down');
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={clsx('card flex min-w-[140px] flex-col gap-1 px-4 py-3 text-left', onClick && 'hover:border-accent', className)}
    >
      <span className="text-[12px] font-medium uppercase tracking-wide text-ink-2">{label}</span>
      <span className="flex items-end justify-between gap-3">
        <span className={clsx('font-mono text-kpi font-medium tabular-nums', TONE[tone])}>{value}</span>
        {spark && <Sparkline values={spark} />}
      </span>
      {(delta !== undefined || hint) && (
        <span className="flex items-center gap-2 text-table text-ink-2">
          {delta !== undefined && (
            <span className={clsx('font-mono', delta === 0 ? 'text-ink-2' : good ? 'text-ok' : 'text-late')}>
              {delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '±0'}
            </span>
          )}
          {hint}
        </span>
      )}
    </Tag>
  );
}

// ---- SimulatedTag ------------------------------------------------------------------------------------------
/** Tiny outlined tag next to anything that fakes an integration (Teams, Outlook, transcripts, AQMS, Teamcenter). */
export function SimulatedTag({ label = 'Simulated', className }: { label?: string; className?: string }) {
  return (
    <span
      className={clsx('inline-flex items-center rounded border border-dashed border-ink-2 px-1 font-mono text-[10px] uppercase leading-4 tracking-wider text-ink-2', className)}
      title="No real service is called: this integration is simulated for the demo"
    >
      {label}
    </span>
  );
}

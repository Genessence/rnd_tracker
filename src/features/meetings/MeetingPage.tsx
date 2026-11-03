// #/meetings/:id: agenda, Teams link, "Simulate: meeting ended", transcript by speaker, draft MOM editor, Publish.
import { ArrowRight, Check, CircleDot, Copy, FileText, Gavel, ListChecks, Mail, Play, Send, Sparkles, Trash2, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, PageHeader } from '../../app/Shell';
import { cx, SimulatedTag } from '../../design';
import type { Meeting, Mom, TranscriptLine } from '../../domain/types';
import { fmtDay, fmtShort } from '../../lib/dates';
import { decisionFollowUp, draftMom, endMeeting, meetingDate, meetingTime, publishMom, updateMom } from '../../sim/teams';
import { useStore } from '../../store/store';
import { btn, btnPrimary, STAGE_LABEL, StatusBadge } from './MeetingsPage';

export function MeetingPage() {
  const { id } = useParams();
  const m = useStore((s) => s.meetings.find((x) => x.id === id));
  const mom = useStore((s) => s.moms.find((x) => x.id === m?.momId));
  const project = useStore((s) => s.projects.find((p) => p.id === m?.scope.projectId));
  const [hl, setHl] = useState<number | null>(null);

  if (!m) {
    return (
      <>
        <PageHeader title="Meeting not found" />
        <div className="card p-10 text-center text-ink-2">This meeting does not exist (the demo may have been reset). <Link className="text-accent" to="/meetings">Back to meetings</Link></div>
      </>
    );
  }
  const step = mom?.status === 'PUBLISHED' ? 3 : mom ? 2 : m.status === 'ENDED' ? 1 : 0;

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="num text-ink">{fmtDay(meetingDate(m))} · {meetingTime(m)}</span>
            <span>· {m.durationMin} min{m.recurrence === 'weekly' && ', weekly'}</span>
            {project && <>· <Link to={`/projects/${project.id}`} className="text-accent hover:underline">{project.name}</Link>{m.scope.stage && <span>· {STAGE_LABEL[m.scope.stage] ?? m.scope.stage} stage</span>}</>}
            <StatusBadge m={m} />
          </span>
        }
        actions={<Link to="/meetings" className={btn}>All meetings</Link>}
      />
      <Stepper step={step} />
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_340px] gap-6">
        <div className="min-w-0">
          {m.status === 'SCHEDULED' ? (
            <ScheduledPanel m={m} />
          ) : (
            <div className="grid grid-cols-2 gap-5">
              <Transcript lines={m.transcript ?? []} hl={hl} refs={refLines(mom)} />
              {mom ? <MomPanel mom={mom} m={m} hl={hl} setHl={setHl} /> : <DraftCta m={m} />}
            </div>
          )}
        </div>
        <Sidebar m={m} />
      </div>
    </>
  );
}

const refLines = (mom?: Mom) => new Set([...(mom?.decisions ?? []), ...(mom?.actions ?? [])].map((r) => r.sourceLine).filter((n): n is number => !!n));

// ---- stepper --------------------------------------------------------------------------------------------------

const STEPS = ['Scheduled & invited', 'Meeting ended · transcript', 'Draft MOM', 'Published · tasks created'];
function Stepper({ step }: { step: number }) {
  return (
    <ol className="card flex items-center gap-2 px-4 py-2.5" aria-label="Meeting progress">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2 text-[12px]">
          <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full border font-mono text-[10px]',
            i < step || step === 3 ? 'border-ink bg-ink text-surface' : i === step ? 'border-accent bg-accent text-surface' : 'border-line text-ink-2')}>
            {i < step || step === 3 ? <Check size={11} /> : i + 1}
          </span>
          <span className={cx(i === step ? 'font-semibold text-ink' : i < step ? 'text-ink' : 'text-ink-2')}>{label}</span>
          {i < STEPS.length - 1 && <span aria-hidden className={cx('h-px flex-1', i < step ? 'bg-ink' : 'bg-line')} />}
        </li>
      ))}
    </ol>
  );
}

// ---- before the meeting ---------------------------------------------------------------------------------------

function ScheduledPanel({ m }: { m: Meeting }) {
  return (
    <div className="flex flex-col gap-5">
      <Agenda m={m} large />
      <section className="card flex items-center justify-between gap-6 px-5 py-5">
        <div>
          <h2 className="flex items-center gap-2 text-[14px] font-semibold"><Video size={16} className="text-accent" /> The meeting runs in Microsoft Teams <SimulatedTag /></h2>
          <p className="mt-1 max-w-[520px] text-ink-2">When it ends, Teams hands the transcript over. The Control Tower turns it into a draft MOM: decisions, actions, owners and dates.</p>
        </div>
        <button type="button" className={cx(btnPrimary, 'h-10 px-4 text-[13px]')} onClick={() => endMeeting(m.id)}>
          <Play size={14} /> Simulate: meeting ended
        </button>
      </section>
    </div>
  );
}

function Agenda({ m, large = false }: { m: Meeting; large?: boolean }) {
  const kindOf = (t: string) => t.split(': ')[0];
  const tone: Record<string, string> = { Blocked: 'bg-wait-soft text-wait', Overdue: 'bg-late-soft text-late', 'Open request': 'bg-accent-soft text-accent' };
  const link = (ref?: string) => (ref?.startsWith('req-') ? `/requests?id=${ref}` : ref?.includes(':') ? `/projects/${ref.split(':')[0]}` : m.scope.projectId ? `/projects/${m.scope.projectId}` : undefined);
  return (
    <section className="card">
      <h2 className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[14px] font-semibold">
        <span className="flex items-center gap-2"><ListChecks size={15} className="text-accent" /> Auto agenda</span>
        {large && <span className="text-[11px] font-normal text-ink-2">overdue, blocked and open requests in scope</span>}
      </h2>
      {m.agenda.length ? (
        <ol className="divide-y divide-line">
          {m.agenda.map((a, i) => {
            const kind = kindOf(a.text);
            const to = link(a.refId);
            const body = (
              <>
                <span className="num w-5 shrink-0 text-ink-2">{i + 1}.</span>
                <span className={cx('shrink-0 rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wide', tone[kind] ?? 'bg-canvas text-ink-2')}>{kind}</span>
                <span className={cx('min-w-0 flex-1', !large && 'truncate')}>{a.text.slice(kind.length + 2)}</span>
                {a.refId && <span className="num shrink-0 text-[11px] text-ink-2">{a.refId.split(':').pop()}</span>}
              </>
            );
            return (
              <li key={i}>
                {to ? <Link to={to} className={cx('flex items-center gap-2.5 px-4 hover:bg-canvas', large ? 'py-2.5' : 'py-1.5 text-table')}>{body}</Link>
                  : <div className="flex items-center gap-2.5 px-4 py-2">{body}</div>}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="px-4 py-4 text-ink-2">Nothing overdue, blocked or open in scope.</p>
      )}
    </section>
  );
}

// ---- transcript -----------------------------------------------------------------------------------------------

const SPEAKER_TONES = ['text-accent', 'text-wait', 'text-risk', 'text-ok', 'text-late', 'text-ink'];

function Transcript({ lines, hl, refs }: { lines: TranscriptLine[]; hl: number | null; refs: Set<number> }) {
  const speakers = [...new Set(lines.map((l) => l.speaker))];
  const [only, setOnly] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (hl == null) return;
    setOnly(null);
    box.current?.querySelector(`[data-line="${hl}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [hl]);
  const tone = (sp: string) => SPEAKER_TONES[speakers.indexOf(sp) % SPEAKER_TONES.length];
  return (
    <section className="card flex max-h-[680px] min-w-0 flex-col">
      <h2 className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[14px] font-semibold">
        <span className="flex items-center gap-2"><FileText size={15} className="text-accent" /> Transcript</span>
        <SimulatedTag label="Simulated Teams transcript" />
      </h2>
      <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
        <button type="button" onClick={() => setOnly(null)} className={cx('rounded-full border px-2 py-px text-[11px]', !only ? 'border-ink bg-ink text-surface' : 'border-line text-ink-2')}>All speakers</button>
        {speakers.map((sp) => (
          <button key={sp} type="button" onClick={() => setOnly(only === sp ? null : sp)}
            className={cx('rounded-full border px-2 py-px text-[11px]', only === sp ? 'border-ink bg-ink text-surface' : cx('border-line', tone(sp)))}>
            {sp} <span className="num opacity-70">{lines.filter((l) => l.speaker === sp).length}</span>
          </button>
        ))}
      </div>
      <div ref={box} className="flex-1 overflow-y-auto py-1">
        {lines.filter((l) => !only || l.speaker === only).map((l) => (
          <div key={l.n} data-line={l.n}
            className={cx('grid grid-cols-[52px_1fr] gap-2 border-l-[3px] px-3 py-1.5 transition-colors',
              hl === l.n ? 'border-l-accent bg-accent-soft' : refs.has(l.n) ? 'border-l-wait/40' : 'border-l-transparent')}>
            <span className="num pt-0.5 text-[11px] text-ink-2">{l.start.slice(3)}</span>
            <div>
              <div className={cx('text-[11px] font-semibold uppercase tracking-wide', tone(l.speaker))}>{l.speaker}</div>
              <p className="leading-snug">{l.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- MOM -------------------------------------------------------------------------------------------------------

function DraftCta({ m }: { m: Meeting }) {
  return (
    <section className="card flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <Sparkles size={22} className="text-accent" />
      <h2 className="text-[16px] font-semibold">Transcript received: {m.transcript?.length ?? 0} lines</h2>
      <p className="max-w-[360px] text-ink-2">Rule-based extraction: lines with "Decision" become decisions, "Action for …:" become actions with an owner and a due date.</p>
      <button type="button" className={cx(btnPrimary, 'h-10 px-4 text-[13px]')} onClick={() => draftMom(m.id)}><Sparkles size={14} /> Draft MOM</button>
    </section>
  );
}

function MomPanel({ mom, m, hl, setHl }: { mom: Mom; m: Meeting; hl: number | null; setHl: (n: number | null) => void }) {
  const people = useStore((s) => s.people);
  const tasks = useStore((s) => s.tasks);
  const emails = useStore((s) => s.emails);
  const draft = mom.status === 'DRAFT';
  const name = (id?: string) => people.find((p) => p.id === id)?.name ?? 'Unassigned';
  const title = (id?: string) => people.find((p) => p.id === id)?.title;
  const momTasks = tasks.filter((t) => t.momId === mom.id);
  const momMail = emails.find((e) => e.kind === 'MOM' && e.relatedId === mom.id);
  const owners = [...new Set(m.attendeeIds.concat(mom.actions.map((a) => a.ownerId).filter((x): x is string => !!x)))];
  const setAction = (i: number, patch: Partial<Mom['actions'][number]>) => updateMom(mom.id, { actions: mom.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const setDecision = (i: number, text: string) => updateMom(mom.id, { decisions: mom.decisions.map((d, j) => (j === i ? { ...d, text } : d)) });
  const followUps = mom.decisions.filter((d) => decisionFollowUp(d.text, m)).length;
  const FollowUp = ({ text }: { text: string }) => {
    const f = decisionFollowUp(text, m);
    if (!f) return null;
    const task = momTasks.find((t) => t.title === text);
    return (
      <div className={cx('mt-1.5 flex items-center gap-1.5 pl-6 text-[11px]', task ? 'text-ok' : 'text-ink-2')}>
        {task ? <Check size={11} /> : <ArrowRight size={11} />}
        <span>{task ? <>Follow-up task <span className="num">{task.id}</span></> : 'Follow-up task'} for <b className="font-medium">{name(f.ownerId)}</b>, due <span className="num">{fmtShort(f.due)}</span></span>
      </div>
    );
  };
  const rowCls = (n?: number) => cx('group rounded-input border px-3 py-2 transition-colors', hl === n && n ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/60');
  const input = 'w-full rounded-input border border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-line focus:border-accent focus:bg-surface';
  const src = (n?: number) => n && (
    <button type="button" onClick={(e) => { e.stopPropagation(); setHl(n); }} className="num shrink-0 rounded border border-line px-1 text-[10px] text-ink-2 hover:border-accent hover:text-accent" title="Show in transcript">
      line {n}
    </button>
  );

  return (
    <section className="card flex min-w-0 flex-col">
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="flex items-center justify-between text-[14px] font-semibold">
          <span>Minutes of meeting</span>
          {draft ? <span className="rounded bg-risk-soft px-1.5 py-px text-[11px] font-medium text-risk">Draft</span>
            : <span className="rounded bg-ok-soft px-1.5 py-px text-[11px] font-medium text-ok">Published {mom.publishedAt && fmtShort(mom.publishedAt)}</span>}
        </h2>
        {draft && <p className="mt-1 flex items-center gap-1.5 text-[12px] text-risk"><Sparkles size={12} /> Draft MOM, generated from transcript: review before publishing</p>}
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2"><Gavel size={12} /> Decisions <span className="num">{mom.decisions.length}</span></h3>
          <div className="flex flex-col gap-2">
            {mom.decisions.map((d, i) => (
              <div key={i} className={rowCls(d.sourceLine)} onClick={() => setHl(d.sourceLine ?? null)}>
                <div className="flex items-start gap-2">
                  <CircleDot size={13} className="mt-1 shrink-0 text-accent" />
                  {draft ? <textarea rows={2} className={cx(input, 'resize-none font-medium')} value={d.text} onChange={(e) => setDecision(i, e.target.value)} onFocus={() => setHl(d.sourceLine ?? null)} />
                    : <p className="flex-1 font-medium">{d.text}</p>}
                  {src(d.sourceLine)}
                </div>
                <FollowUp text={d.text} />
              </div>
            ))}
            {!mom.decisions.length && <p className="text-ink-2">No decisions found.</p>}
          </div>
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2"><ListChecks size={12} /> Actions <span className="num">{mom.actions.length}</span></h3>
          <div className="flex flex-col gap-2">
            {mom.actions.map((a, i) => {
              const task = tasks.find((t) => t.id === a.taskId);
              return (
                <div key={i} className={rowCls(a.sourceLine)} onClick={() => setHl(a.sourceLine ?? null)}>
                  <div className="flex items-start gap-2">
                    <span className="num mt-0.5 w-4 shrink-0 text-[11px] text-ink-2">A{i + 1}</span>
                    {draft ? <textarea rows={2} className={cx(input, 'resize-none')} value={a.text} onChange={(e) => setAction(i, { text: e.target.value })} onFocus={() => setHl(a.sourceLine ?? null)} />
                      : <p className="flex-1">{a.text}</p>}
                    {src(a.sourceLine)}
                    {draft && (
                      <button type="button" aria-label="Remove action" className="shrink-0 text-ink-2 opacity-0 hover:text-late group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); updateMom(mom.id, { actions: mom.actions.filter((_, j) => j !== i) }); }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 pl-6 text-table">
                    <Avatar name={name(a.ownerId)} className="!h-5 !w-5 !text-[9px]" />
                    {draft ? (
                      <select className="h-7 min-w-0 flex-1 rounded-input border border-line bg-surface px-1" value={a.ownerId ?? ''} onChange={(e) => setAction(i, { ownerId: e.target.value || undefined })} onClick={(e) => e.stopPropagation()}>
                        <option value="">Unassigned</option>
                        {owners.map((id) => <option key={id} value={id}>{name(id)} · {title(id)}</option>)}
                      </select>
                    ) : <span className="flex-1"><b className="font-medium">{name(a.ownerId)}</b> <span className="text-ink-2">· {title(a.ownerId)}</span></span>}
                    {draft ? (
                      <input type="date" className="h-7 rounded-input border border-line bg-surface px-1 font-mono" value={a.dueDate ?? ''} onChange={(e) => setAction(i, { dueDate: e.target.value || undefined })} onClick={(e) => e.stopPropagation()} aria-label="Due date" />
                    ) : <span className="num">due {a.dueDate ? fmtShort(a.dueDate) : '-'}</span>}
                  </div>
                  {task && (
                    <div className="mt-1.5 flex items-center gap-1.5 pl-6 text-[11px] text-ok">
                      <Check size={11} /> Task <span className="num">{task.id}</span> created{m.scope.stage && <> on the {STAGE_LABEL[m.scope.stage] ?? m.scope.stage} stage</>}
                      <Link to={m.scope.projectId ? `/projects/${m.scope.projectId}` : '/my-day'} className="ml-auto text-accent hover:underline" onClick={(e) => e.stopPropagation()}>open <ArrowRight size={10} className="inline" /></Link>
                    </div>
                  )}
                </div>
              );
            })}
            {!mom.actions.length && <p className="text-ink-2">No actions found.</p>}
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-line px-4 py-3">
        {draft ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-ink-2">Publishing creates {mom.actions.length + followUps} tasks and emails {m.attendeeIds.length} attendees.</span>
            <button type="button" className={btnPrimary} onClick={() => publishMom(mom.id)}><Send size={13} /> Publish MOM</button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="flex items-center gap-1.5 text-ok"><Check size={13} /> {momTasks.length} tasks created · MOM emailed to {m.attendeeIds.length} attendees</span>
            {momMail && <Link to="/outbox" className="inline-flex items-center gap-1 text-accent hover:underline"><Mail size={12} /> View in Outbox</Link>}
          </div>
        )}
      </div>
    </section>
  );
}

// ---- sidebar ---------------------------------------------------------------------------------------------------

function Sidebar({ m }: { m: Meeting }) {
  const people = useStore((s) => s.people);
  const invite = useStore((s) => s.emails.find((e) => e.kind === 'INVITE' && e.relatedId === m.id));
  const [copied, setCopied] = useState(false);
  const person = (id: string) => people.find((p) => p.id === id);
  return (
    <aside className="flex flex-col gap-5">
      <section className="card p-4">
        <h2 className="mb-2 flex items-center justify-between text-[14px] font-semibold">
          <span className="flex items-center gap-2"><Video size={15} className="text-accent" /> Teams meeting</span>
          <SimulatedTag />
        </h2>
        <a href={m.teamsJoinUrl} onClick={(e) => e.preventDefault()} className="block truncate rounded-input bg-canvas px-2 py-1.5 font-mono text-[11px] text-accent" title={m.teamsJoinUrl}>{m.teamsJoinUrl}</a>
        <div className="mt-2 flex gap-2">
          <button type="button" className={cx(btnPrimary, 'flex-1 justify-center')} disabled={m.status === 'ENDED'} title="Simulated: no real Teams call">
            <Video size={13} /> {m.status === 'ENDED' ? 'Meeting ended' : 'Join'}
          </button>
          <button type="button" className={btn} onClick={() => { navigator.clipboard?.writeText(m.teamsJoinUrl).catch(() => {}); setCopied(true); }}>
            <Copy size={13} /> {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {invite && (
          <Link to="/outbox" className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-2 hover:text-accent">
            <Mail size={12} /> Invite sent to {invite.toIds.length} attendees on <span className="num">{fmtShort(invite.at.slice(0, 10))}</span> <ArrowRight size={11} />
          </Link>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-[14px] font-semibold">Attendees <span className="num text-ink-2">{m.attendeeIds.length}</span></h2>
        <ul className="flex flex-col gap-2">
          {m.attendeeIds.map((id) => (
            <li key={id} className="flex items-center gap-2">
              <Avatar name={person(id)?.name ?? id} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-medium">{person(id)?.name ?? id}{id === m.organiserId && <span className="ml-1 text-[11px] font-normal text-ink-2">organiser</span>}</span>
                <span className="block truncate text-[11px] text-ink-2">{person(id)?.title}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {m.status === 'ENDED' && <Agenda m={m} />}
    </aside>
  );
}

// #/meetings: week view + list, and the schedule dialog (pre-filled from ?project=&stage=).
import * as Dialog from '@radix-ui/react-dialog';
import { CalendarPlus, ChevronLeft, ChevronRight, Repeat, Video, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, PageHeader } from '../../app/Shell';
import { cx, SimulatedTag } from '../../design';
import { leaderOf, headId } from '../../domain/rules';
import { RAIL_STAGES, type Meeting, type StageCode } from '../../domain/types';
import { addDays, daysBetween, fmtDay, fmtShort, weekStart } from '../../lib/dates';
import { meetingDate, meetingTime, scheduleMeeting } from '../../sim/teams';
import { isRequestLive } from '../../store/selectors';
import { useStore } from '../../store/store';

export const btn = 'inline-flex h-8 items-center gap-1.5 rounded-input border border-line bg-surface px-3 text-[12px] font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-40';
export const btnPrimary = 'inline-flex h-8 items-center gap-1.5 rounded-input bg-accent px-3 text-[12px] font-medium text-surface hover:brightness-110 disabled:opacity-40';
export const STAGE_LABEL: Record<string, string> = { CE: 'CE', PROTO: 'Proto', DV: 'DV', PP: 'PP', MP: 'MP' };

/** Does meeting m occur on day d (weekly meetings repeat on the same weekday)? */
const occursOn = (m: Meeting, d: string) => {
  const diff = daysBetween(meetingDate(m), d);
  return diff === 0 || (m.recurrence === 'weekly' && diff > 0 && diff % 7 === 0);
};

export function MeetingsPage() {
  const [params, setParams] = useSearchParams();
  const prefill = params.get('project') ? { projectId: params.get('project')!, stage: (params.get('stage') ?? undefined) as StageCode | undefined } : null;
  const [open, setOpen] = useState(!!prefill);
  const close = (o: boolean) => {
    setOpen(o);
    if (!o && prefill) setParams({}, { replace: true });
  };
  return (
    <>
      <PageHeader
        title="Meetings"
        subtitle={<>Reviews scheduled from a project stage. Transcripts become a draft MOM, and its actions become tasks. <SimulatedTag label="Simulated Teams" /></>}
        actions={<button type="button" className={btnPrimary} onClick={() => setOpen(true)}><CalendarPlus size={14} /> Schedule meeting</button>}
      />
      <WeekView />
      <MeetingList />
      <Dialog.Root open={open} onOpenChange={close}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(27,34,48,0.18)]" />
          <Dialog.Content aria-describedby={undefined} className="card fixed left-1/2 top-[8vh] z-50 w-[600px] -translate-x-1/2 shadow-popover outline-none">
            <ScheduleForm prefill={prefill} onDone={() => close(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

// ---- week view -------------------------------------------------------------------------------------------------

function WeekView() {
  const today = useStore((s) => s.demoToday);
  const meetings = useStore((s) => s.meetings);
  const projects = useStore((s) => s.projects);
  const [offset, setOffset] = useState(0);
  const mon = addDays(weekStart(today), offset * 7);
  const days = [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
  return (
    <section className="card mb-6" aria-label="Week view">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-[14px] font-semibold">Week of <span className="num">{fmtShort(mon)}</span></h2>
        <div className="flex items-center gap-1">
          <button type="button" className={btn} onClick={() => setOffset(offset - 1)} aria-label="Previous week"><ChevronLeft size={14} /></button>
          <button type="button" className={btn} onClick={() => setOffset(0)}>This week</button>
          <button type="button" className={btn} onClick={() => setOffset(offset + 1)} aria-label="Next week"><ChevronRight size={14} /></button>
        </div>
      </div>
      <div className="grid grid-cols-5 divide-x divide-line">
        {days.map((d) => {
          const ms = meetings.filter((m) => occursOn(m, d)).sort((a, b) => meetingTime(a).localeCompare(meetingTime(b)));
          return (
            <div key={d} className={cx('min-h-[150px] p-2', d === today && 'bg-accent-soft/50')}>
              <div className={cx('mb-2 flex items-center justify-between text-[12px]', d === today ? 'font-semibold text-accent' : 'text-ink-2')}>
                <span className="num">{fmtDay(d)}</span>
                {d === today && <span className="rounded bg-accent px-1 text-[10px] uppercase tracking-wide text-surface">Today</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                {ms.map((m) => (
                  <Link key={m.id} to={`/meetings/${m.id}`} className="block rounded-input border border-line border-l-[3px] border-l-accent bg-surface px-2 py-1.5 hover:border-accent">
                    <div className="flex items-center gap-1 font-mono text-[11px] text-ink-2">
                      {meetingTime(m)} {m.recurrence === 'weekly' && <Repeat size={10} aria-label="weekly" />}
                      {m.status === 'ENDED' && d === meetingDate(m) && <span className="ml-auto text-ok">ended</span>}
                    </div>
                    <div className="line-clamp-2 text-[12px] font-medium leading-snug">{m.title}</div>
                    {m.scope.projectId && (
                      <div className="truncate text-[11px] text-ink-2">{projects.find((p) => p.id === m.scope.projectId)?.name}{m.scope.stage && ` · ${STAGE_LABEL[m.scope.stage] ?? m.scope.stage}`}</div>
                    )}
                  </Link>
                ))}
                {!ms.length && <span className="text-[11px] text-ink-2/70">No meetings</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---- list ------------------------------------------------------------------------------------------------------

function MeetingList() {
  const meetings = useStore((s) => s.meetings);
  const moms = useStore((s) => s.moms);
  const projects = useStore((s) => s.projects);
  const people = useStore((s) => s.people);
  const navigate = useNavigate();
  const sorted = [...meetings].sort((a, b) => b.start.localeCompare(a.start));
  return (
    <section className="card" aria-label="All meetings">
      <h2 className="border-b border-line px-4 py-2.5 text-[14px] font-semibold">All meetings <span className="num text-ink-2">{meetings.length}</span></h2>
      {sorted.length ? (
        <table className="w-full text-table">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-2">
            <tr className="border-b border-line">
              <th className="px-4 py-2 font-medium">When</th><th className="py-2 font-medium">Meeting</th><th className="py-2 font-medium">Scope</th>
              <th className="py-2 font-medium">Attendees</th><th className="py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">MOM</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const mom = moms.find((x) => x.id === m.momId);
              return (
                <tr key={m.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas" onClick={() => navigate(`/meetings/${m.id}`)}>
                  <td className="whitespace-nowrap px-4 py-2.5 num">{fmtDay(meetingDate(m))} {meetingTime(m)}</td>
                  <td className="py-2.5 font-medium">
                    <Link to={`/meetings/${m.id}`} className="hover:text-accent">{m.title}</Link>
                    {m.recurrence === 'weekly' && <span className="ml-2 text-[11px] text-ink-2"><Repeat size={10} className="inline" /> weekly</span>}
                  </td>
                  <td className="py-2.5 text-ink-2">{projects.find((p) => p.id === m.scope.projectId)?.name ?? '-'}{m.scope.stage && ` · ${STAGE_LABEL[m.scope.stage] ?? m.scope.stage}`}</td>
                  <td className="py-2.5">
                    <div className="flex -space-x-1.5">
                      {m.attendeeIds.slice(0, 6).map((id) => <Avatar key={id} name={people.find((p) => p.id === id)?.name ?? id} className="ring-2 ring-surface" />)}
                      {m.attendeeIds.length > 6 && <span className="num pl-2 text-ink-2">+{m.attendeeIds.length - 6}</span>}
                    </div>
                  </td>
                  <td className="py-2.5"><StatusBadge m={m} /></td>
                  <td className="px-4 py-2.5">{mom ? <span className={mom.status === 'PUBLISHED' ? 'text-ok' : 'text-risk'}>{mom.status === 'PUBLISHED' ? 'Published' : 'Draft'}</span> : <span className="text-ink-2">-</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-ink-2">
          <Video size={22} />
          <p>No meetings yet. Schedule one from a project stage, or use <b className="font-medium text-ink">Schedule meeting</b>.</p>
        </div>
      )}
    </section>
  );
}

export function StatusBadge({ m }: { m: Meeting }) {
  return m.status === 'ENDED'
    ? <span className="rounded bg-ok-soft px-1.5 py-px text-[11px] font-medium text-ok">Ended</span>
    : <span className="rounded bg-accent-soft px-1.5 py-px text-[11px] font-medium text-accent">Scheduled</span>;
}

// ---- schedule dialog -------------------------------------------------------------------------------------------

function ScheduleForm({ prefill, onDone }: { prefill: { projectId: string; stage?: StageCode } | null; onDone: () => void }) {
  const s = useStore();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState(prefill?.projectId ?? '');
  const [stage, setStage] = useState<StageCode | ''>(prefill?.stage ?? s.projects.find((p) => p.id === prefill?.projectId)?.stage ?? '');
  const project = s.projects.find((p) => p.id === projectId);
  const defaultTitle = project ? `Weekly cross-functional review · ${project.name}` : '';
  const [title, setTitle] = useState(defaultTitle);
  const [date, setDate] = useState(s.demoToday);
  const [time, setTime] = useState('11:00');
  const [weekly, setWeekly] = useState(true);

  // Default attendees: head, project owner, the leads of every team holding a live request, plus the organiser.
  const defaultsFor = (pid: string) => {
    const p = s.projects.find((x) => x.id === pid);
    const reqTeams = s.requests.filter((r) => r.projectId === pid && isRequestLive(r)).map((r) => r.toId);
    const ids = [s.currentPersonId, headId(s), p?.ownerId, ...['dqa', 'electronics', 'sourcing', ...reqTeams].map((t) => leaderOf(s, t))];
    return [...new Set(ids.filter((x): x is string => !!x))];
  };
  const [attendees, setAttendees] = useState<string[]>(prefill ? defaultsFor(prefill.projectId) : [s.currentPersonId]);
  const [pick, setPick] = useState('');
  const pickable = useMemo(() => s.people.filter((p) => !attendees.includes(p.id) && !p.placeholder).concat(s.people.filter((p) => p.placeholder && !attendees.includes(p.id))), [s.people, attendees]);
  const name = (id: string) => s.people.find((p) => p.id === id)?.name ?? id;

  const changeProject = (pid: string) => {
    setProjectId(pid);
    const p = s.projects.find((x) => x.id === pid);
    setStage(p?.stage ?? '');
    if (!title || title === defaultTitle) setTitle(p ? `Weekly cross-functional review · ${p.name}` : '');
    if (pid) setAttendees(defaultsFor(pid));
  };

  const submit = () => {
    const id = scheduleMeeting({ title: title.trim(), projectId: projectId || undefined, stage: stage || undefined, attendeeIds: attendees, date, time, weekly });
    onDone();
    navigate(`/meetings/${id}`);
  };

  const field = 'h-8 w-full rounded-input border border-line bg-surface px-2 text-[13px] outline-none focus:border-accent';
  const label = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-2';
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <Dialog.Title className="flex items-center gap-2 text-[16px] font-semibold"><CalendarPlus size={16} className="text-accent" /> Schedule a Teams meeting <SimulatedTag /></Dialog.Title>
        <Dialog.Close className="text-ink-2 hover:text-ink" aria-label="Close"><X size={16} /></Dialog.Close>
      </div>
      <div className="grid grid-cols-2 gap-4 px-5 py-4">
        <label className="col-span-2"><span className={label}>Title</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Weekly cross-functional review" />
        </label>
        <label><span className={label}>Project</span>
          <select className={field} value={projectId} onChange={(e) => changeProject(e.target.value)}>
            <option value="">No project</option>
            {s.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label><span className={label}>Stage</span>
          <select className={field} value={stage} onChange={(e) => setStage(e.target.value as StageCode)} disabled={!projectId}>
            <option value="">Whole project</option>
            {RAIL_STAGES.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
          </select>
        </label>
        <label><span className={label}>Date</span><input type="date" className={cx(field, 'font-mono')} value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <label><span className={label}>Time</span><input type="time" className={cx(field, 'font-mono')} value={time} onChange={(e) => setTime(e.target.value)} required /></label>
          <label className="flex h-8 items-center gap-1.5 text-[13px]"><input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} className="accent-[var(--accent)]" /> Weekly</label>
        </div>
        <div className="col-span-2">
          <span className={label}>Attendees <span className="num normal-case">({attendees.length})</span></span>
          <div className="flex flex-wrap gap-1.5 rounded-input border border-line p-2">
            {attendees.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-canvas py-0.5 pl-0.5 pr-2 text-[12px]">
                <Avatar name={name(id)} className="!h-5 !w-5 !text-[9px]" /> {name(id)}
                <button type="button" aria-label={`Remove ${name(id)}`} className="text-ink-2 hover:text-late" onClick={() => setAttendees(attendees.filter((a) => a !== id))}><X size={11} /></button>
              </span>
            ))}
            <select className="h-6 rounded-input border border-dashed border-line bg-surface px-1 text-[12px] text-ink-2" value={pick} onChange={(e) => { if (e.target.value) setAttendees([...attendees, e.target.value]); setPick(''); }} aria-label="Add attendee">
              <option value="">+ Add attendee</option>
              {pickable.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.title}</option>)}
            </select>
          </div>
        </div>
        {project && (
          <p className="col-span-2 rounded-input bg-accent-soft px-3 py-2 text-[12px] text-ink">
            The agenda is built automatically from the overdue items, blockers and open requests on <b className="font-medium">{project.name}</b>{stage && ` (${STAGE_LABEL[stage] ?? stage} stage)`}.
          </p>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-line px-5 py-3">
        <span className="text-[12px] text-ink-2">Attendees receive an Outlook invite with the Teams link. <SimulatedTag /></span>
        <div className="flex gap-2">
          <Dialog.Close className={btn}>Cancel</Dialog.Close>
          <button type="submit" className={cx(btnPrimary, 'whitespace-nowrap')} disabled={!title.trim() || !attendees.length}>Schedule &amp; send invite</button>
        </div>
      </div>
    </form>
  );
}

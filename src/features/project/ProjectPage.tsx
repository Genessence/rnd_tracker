// #/projects/:id: header (StageRail, customer, milestone, owner) + tabs Plan / Requests / Meetings & MOM.
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, CalendarPlus, ChevronDown, ChevronRight, ExternalLink, FileText } from 'lucide-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar, PageHeader } from '../../app/Shell';
import { cx, DatePair, RagDot, StageRail, WaitingChip } from '../../design';
import { template } from '../../domain/seed';
import type { PlanActivity, Project, StageCode, TaskStatus } from '../../domain/types';
import { fmtDay, fmtShort, workingDaysBetween } from '../../lib/dates';
import { isRequestLive, shortTeam } from '../../store/selectors';
import { useStore } from '../../store/store';
import { StatusPill } from '../requests/RequestsPage';
import { AddTaskButton, useLeadTeam } from './LeadActions';

const btn = 'inline-flex h-8 items-center gap-1.5 rounded-input border border-line bg-surface px-3 text-[12px] font-medium text-ink hover:border-accent hover:text-accent';

export function ProjectPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const project = useStore((s) => s.projects.find((p) => p.id === id));
  const teams = useStore((s) => s.teams);
  const people = useStore((s) => s.people);
  const meetings = useStore((s) => s.meetings);
  if (!project) {
    return (
      <>
        <PageHeader title="Project not found" />
        <Link to="/projects" className="text-accent hover:underline">Back to projects</Link>
      </>
    );
  }
  const tab = params.get('tab') ?? 'plan';
  const started = params.get('started') === '1';
  const owner = people.find((p) => p.id === project.ownerId);
  const teamName = shortTeam(teams.find((t) => t.id === project.teamId)?.name ?? project.teamId);
  const mtgCount = meetings.filter((m) => m.scope.projectId === id).length;

  return (
    <>
      <Link to="/projects" className="mb-2 inline-flex items-center gap-1 text-[12px] text-ink-2 hover:text-accent"><ArrowLeft size={13} /> Projects</Link>
      <PageHeader
        title={project.name}
        subtitle={<span className="flex items-center gap-2">{teamName} <RagDot rag={project.rag} showLabel /></span>}
        actions={<LeadHeaderActions project={project} />}
      />
      {started && project.plan && (
        <div className="card mb-4 border-accent bg-accent-soft px-5 py-3 text-table">
          <b>Workflow started.</b> {project.plan.length} activities scheduled from the R&amp;D cycle template: CE is in progress until{' '}
          <span className="num">{fmtShort(project.nextMilestoneDate ?? '')}</span>, then Proto, DV, PP and MP.
          Assign engineers in the Plan below, and add tasks for engineers or other departments.
        </div>
      )}
      <section className="card mb-5 grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-6 px-5 py-4">
        <StageRail stage={project.stage} onHold={project.onHold} />
        <Meta label="Customer">{project.customer ?? '–'}</Meta>
        <Meta label="Next milestone">
          {project.nextMilestone ?? '–'}
          {project.nextMilestoneDate && <span className="num ml-2 text-ink-2">{fmtDay(project.nextMilestoneDate)}</span>}
        </Meta>
        <Meta label="Owner"><span className="flex items-center gap-2"><Avatar name={owner?.name ?? '?'} className="h-6 w-6 text-[10px]" />{owner?.name ?? '–'}</span></Meta>
        {project.note && <p className="col-span-4 -mt-2 border-t border-line pt-3 text-table text-ink-2">{project.note}</p>}
      </section>

      <Tabs.Root value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <Tabs.List className="mb-4 flex gap-1 border-b border-line">
          {[['plan', 'Plan', null], ['meetings', 'Meetings & MOM', mtgCount]].map(([v, label, n]) => (
            <Tabs.Trigger
              key={v as string}
              value={v as string}
              className="-mb-px flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-ink-2 hover:text-ink data-[state=active]:border-accent data-[state=active]:text-accent"
            >
              {label}{n !== null && <span className="num rounded bg-canvas px-1 text-[11px] text-ink-2">{n}</span>}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="plan">{project.plan ? <Plan project={project} plan={project.plan} /> : <TaskPlan project={project} />}</Tabs.Content>
        <Tabs.Content value="meetings"><ProjectMeetings project={project} /></Tabs.Content>
      </Tabs.Root>
    </>
  );
}

const Meta = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <div className="text-[11px] font-medium uppercase tracking-wide text-ink-2">{label}</div>
    <div className="mt-0.5 truncate text-[13px] font-medium">{children}</div>
  </div>
);

const STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  DONE: { label: 'Done', cls: 'bg-ink text-surface' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-accent-soft text-accent' },
  BLOCKED: { label: 'Blocked', cls: 'bg-wait-soft text-wait' },
  OPEN: { label: 'Not started', cls: 'border border-line text-ink-2' },
};
const StatusTag = ({ s }: { s: TaskStatus }) => (
  <span className={cx('inline-block whitespace-nowrap rounded px-1.5 py-px text-[11px] font-medium', STATUS[s].cls)}>{STATUS[s].label}</span>
);

function ScheduleButton({ projectId, stage }: { projectId: string; stage: StageCode }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={btn}
      title={`Schedule a meeting for the ${stage} stage`}
      data-stage={stage}
      onClick={(e) => { e.stopPropagation(); navigate(`/meetings?project=${projectId}&stage=${stage}`); }}
    >
      <CalendarPlus size={14} /> Schedule meeting
    </button>
  );
}

// ---- Plan: stages > sub-stages > activities ---------------------------------------------------------------------

function LeadHeaderActions({ project }: { project: Project }) {
  const lead = useLeadTeam(project.teamId);
  if (!lead) return null;
  return (
    <>
      <AddTaskButton teamId={lead} projectId={project.id} stage={project.stage} />
    </>
  );
}

/** Lead reassigns an activity to one of the team's engineers (or themselves). */
function OwnerSelect({ project, a, name }: { project: Project; a: PlanActivity; name: (id?: string) => string }) {
  const people = useStore((s) => s.people);
  const assign = useStore((s) => s.assignActivity);
  const team = useMemo(() => people.filter((p) => p.teamId === project.teamId && (p.role === 'ENGINEER' || p.role === 'TEAM_LEADER')), [people, project.teamId]);
  const outside = a.ownerId && !team.some((p) => p.id === a.ownerId);
  return (
    <select aria-label={`Owner of ${a.sNo}`} value={a.ownerId ?? ''} onChange={(e) => assign(project.id, a.activityId, e.target.value)}
      className="h-7 max-w-[160px] rounded-input border border-transparent bg-transparent px-1 text-table hover:border-line focus:border-accent">
      {outside && <option value={a.ownerId}>{name(a.ownerId)}</option>}
      {team.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

function Plan({ project, plan }: { project: Project; plan: PlanActivity[] }) {
  const navigate = useNavigate();
  const lead = useLeadTeam(project.teamId);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const requests = useStore((s) => s.requests);
  const today = useStore((s) => s.demoToday);
  const [open, setOpen] = useState<Set<string>>(() => new Set([project.stage]));
  const toggle = (c: string) => setOpen((o) => { const n = new Set(o); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  const byStage = useMemo(() => template.stages.map((st) => {
    const acts = plan.filter((a) => a.stage === st.code);
    const subs: { name: string; acts: PlanActivity[] }[] = [];
    for (const a of acts) {
      const last = subs.at(-1);
      if (last?.name === a.subStage) last.acts.push(a); else subs.push({ name: a.subStage, acts: [a] });
    }
    const done = acts.filter((a) => a.status === 'DONE').length;
    const blocked = acts.filter((a) => a.status === 'BLOCKED').length;
    const late = acts.filter((a) => a.actualEnd && a.actualEnd > a.baselineEnd).length;
    return { st, acts, subs, done, blocked, late, start: acts[0]?.baselineStart, end: acts.at(-1)?.forecastEnd };
  }), [plan]);

  const name = (id?: string) => people.find((p) => p.id === id)?.name ?? '–';
  const team = (id?: string) => (id ? shortTeam(teams.find((t) => t.id === id)?.name ?? id) : '–');

  return (
    <div className="space-y-3">
      <p className="text-table text-ink-2">
        <span className="num text-ink">{plan.length}</span> activities from template <span className="num">{template.templateId}</span>, scheduled from the R&amp;D cycle.
        Click a stage to expand it. A violet chip means the activity is waiting on another department.
      </p>
      {byStage.map(({ st, acts, subs, done, blocked, late, start, end }) => {
        const isOpen = open.has(st.code);
        const state = done === acts.length ? 'done' : st.code === project.stage ? 'current' : 'future';
        return (
          <section key={st.code} className={cx('card overflow-hidden', state === 'current' && 'border-accent')}>
            <div
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => toggle(st.code)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(st.code))}
              className="flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-canvas"
            >
              {isOpen ? <ChevronDown size={16} className="text-ink-2" /> : <ChevronRight size={16} className="text-ink-2" />}
              <span className={cx('grid h-7 w-14 place-items-center rounded-[4px] border font-mono text-[11px] font-medium uppercase',
                state === 'done' ? 'border-ink bg-ink text-surface' : state === 'current' ? 'border-accent bg-accent text-surface' : 'border-line text-ink-2')}>
                {st.code === 'PROTO' ? 'Proto' : st.code}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{st.sNo}. {st.name}</div>
                <div className="num text-[11px] text-ink-2">
                  {start && end ? `${fmtShort(start)} → ${fmtShort(end)}` : ''} · {st.plannedDays} days planned · owner {st.owner}
                </div>
              </div>
              <div className="flex items-center gap-4 text-table">
                <Progress done={done} total={acts.length} />
                {blocked > 0 && <span className="font-medium text-wait">{blocked} blocked</span>}
                {late > 0 && <span className="text-late">{late} late</span>}
                <span className="w-24 text-right">
                  {state === 'done' ? <StatusTag s="DONE" /> : state === 'current' ? <StatusTag s="IN_PROGRESS" /> : <StatusTag s="OPEN" />}
                </span>
                <ScheduleButton projectId={project.id} stage={st.code} />
              </div>
            </div>
            {isOpen && (
              <table className="w-full border-t border-line text-table">
                <thead className="bg-canvas text-left text-[11px] uppercase tracking-wide text-ink-2">
                  <tr>
                    <th className="w-16 px-4 py-1.5 font-medium">S.No</th>
                    <th className="px-2 py-1.5 font-medium">Activity</th>
                    <th className="px-2 py-1.5 font-medium">Owner</th>
                    <th className="px-2 py-1.5 font-medium">Depends on</th>
                    <th className="px-2 py-1.5 text-right font-medium">TAT plan / actual</th>
                    <th className="px-2 py-1.5 font-medium">Committed → forecast</th>
                    <th className="px-2 py-1.5 font-medium">Status</th>
                    {lead && <th className="px-4 py-1.5 font-medium">Lead</th>}
                  </tr>
                </thead>
                <tbody>
                  {subs.map((sub) => (
                    <Fragment key={sub.name}>
                      <tr className="border-t border-line bg-surface">
                        <td colSpan={lead ? 8 : 7} className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink">
                          {sub.name} <span className="num font-normal text-ink-2">· {sub.acts.filter((a) => a.status === 'DONE').length}/{sub.acts.length}</span>
                        </td>
                      </tr>
                      {sub.acts.map((a) => {
                        const req = a.requestId ? requests.find((r) => r.id === a.requestId) : undefined;
                        const live = req && isRequestLive(req);
                        // Actual TAT = planned + working days the actual end slipped past the baseline end.
                        const actual = a.actualEnd ? (a.plannedDays ?? 1) + Math.max(0, workingDaysBetween(a.baselineEnd, a.actualEnd)) : null;
                        const overdue = a.status !== 'DONE' && a.forecastEnd < today;
                        return (
                          <tr key={a.activityId} className={cx('border-t border-line', a.status === 'BLOCKED' && 'bg-wait-soft')}>
                            <td className="num px-4 py-1.5 text-ink-2">{a.sNo}</td>
                            <td className="px-2 py-1.5">
                              <span className={cx(a.status === 'DONE' && 'text-ink-2')}>{a.name}</span>
                              {req && (
                                <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-2">
                                  <span className="num">{req.id}</span> <StatusPill status={req.status} />
                                  {req.committedDate && <b className="num text-ink">{fmtShort(req.committedDate)}</b>}
                                </div>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5">{lead && a.status !== 'DONE' ? <OwnerSelect project={project} a={a} name={name} /> : name(a.ownerId)}</td>
                            <td className="px-2 py-1.5">
                              {live ? <WaitingChip to={team(req!.toId)} onClick={() => navigate(`/requests?id=${req!.id}`)} />
                                : <span className="text-ink-2">{team(a.dependencyTeam)}</span>}
                            </td>
                            <td className="num whitespace-nowrap px-2 py-1.5 text-right">
                              {a.plannedDays ?? '–'} / <span className={cx(actual !== null && a.plannedDays !== null && actual > a.plannedDays && 'text-late')}>{actual ?? '–'}</span>
                            </td>
                            <td className="px-2 py-1.5">
                              {a.status === 'DONE' && a.actualEnd
                                ? <DatePair committed={a.baselineEnd} forecast={a.actualEnd} />
                                : <DatePair committed={a.committedEnd} forecast={a.forecastEnd} className={cx(overdue && 'font-semibold')} />}
                            </td>
                            <td className="px-2 py-1.5"><StatusTag s={a.status} /></td>
                            {lead && (
                              <td className="whitespace-nowrap px-4 py-1.5">
                                {a.status !== 'DONE' && (
                                  <span className="flex gap-3">
                                    <AddTaskButton small teamId={lead} projectId={project.id} stage={a.stage} title={`${a.sNo} ${a.name}`} />
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? (done / total) * 100 : 0;
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas ring-1 ring-line">
        <span className="block h-full bg-ink" style={{ width: `${pct}%` }} />
      </span>
      <span className="num w-12 text-ink-2">{done}/{total}</span>
    </span>
  );
}

// ---- Plan fallback: projects without an instantiated template show their tasks ---------------------------------

function TaskPlan({ project }: { project: Project }) {
  const navigate = useNavigate();
  const all = useStore((s) => s.tasks);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const tasks = useMemo(() => all.filter((t) => t.projectId === project.id).sort((a, b) => a.forecastDate.localeCompare(b.forecastDate)), [all, project.id]);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const waitLabel = (t: (typeof tasks)[number]) => {
    const w = t.waitingOn;
    if (!w) return null;
    if (w.kind === 'HEAD') return 'R&D head';
    if (w.kind === 'NOTE') return null;
    return shortTeam(teams.find((x) => x.id === w.id)?.name ?? w.id);
  };
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Tracked tasks</h2>
          <p className="text-table text-ink-2">This project tracks its summary and tasks. The full 137-activity plan is shown on MHI 2028 BEE line-up.</p>
        </div>
        <ScheduleButton projectId={project.id} stage={project.stage} />
      </div>
      <table className="w-full text-table">
        <thead className="bg-canvas text-left text-[11px] uppercase tracking-wide text-ink-2">
          <tr>
            <th className="px-4 py-1.5 font-medium">Task</th>
            <th className="px-2 py-1.5 font-medium">Owner</th>
            <th className="px-2 py-1.5 font-medium">Waiting on</th>
            <th className="px-2 py-1.5 font-medium">Committed → forecast</th>
            <th className="px-4 py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-2">No tasks logged against this project.</td></tr>}
          {tasks.map((t) => {
            const w = waitLabel(t);
            const reqId = t.waitingOn && 'requestId' in t.waitingOn ? t.waitingOn.requestId : undefined;
            return (
              <tr key={t.id} className="border-t border-line">
                <td className="px-4 py-1.5">{t.title}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{t.ownerIds.map(name).join(', ')}</td>
                <td className="px-2 py-1.5">{w ? <WaitingChip to={w} onClick={reqId ? () => navigate(`/requests?id=${reqId}`) : undefined} /> : <span className="text-ink-2">–</span>}</td>
                <td className="px-2 py-1.5"><DatePair committed={t.committedDate} forecast={t.forecastDate} /></td>
                <td className="px-4 py-1.5"><StatusTag s={t.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ---- Meetings & MOM tab ------------------------------------------------------------------------------------------

function ProjectMeetings({ project }: { project: Project }) {
  const allMeetings = useStore((s) => s.meetings);
  const moms = useStore((s) => s.moms);
  const people = useStore((s) => s.people);
  const meetings = allMeetings.filter((m) => m.scope.projectId === project.id).sort((a, b) => b.start.localeCompare(a.start));
  const name = (id?: string) => people.find((p) => p.id === id)?.name ?? '–';

  if (meetings.length === 0) {
    return (
      <section className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
        <FileText size={22} className="text-ink-2" />
        <div>
          <div className="font-semibold">No meetings yet</div>
          <p className="text-table text-ink-2">Schedule a review from a stage; its minutes and actions will appear here.</p>
        </div>
        <ScheduleButton projectId={project.id} stage={project.stage} />
      </section>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><ScheduleButton projectId={project.id} stage={project.stage} /></div>
      {meetings.map((m) => {
        const mom = moms.find((x) => x.id === m.momId || x.meetingId === m.id);
        return (
          <section key={m.id} className="card">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <Link to={`/meetings/${m.id}`} className="font-semibold hover:text-accent">{m.title}</Link>
                <div className="num text-[11px] text-ink-2">
                  {fmtDay(m.start.slice(0, 10))} {m.start.slice(11, 16)} · {m.durationMin} min{m.scope.stage ? ` · ${m.scope.stage} stage` : ''}{m.recurrence ? ' · weekly' : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cx('rounded px-1.5 py-px text-[11px] font-medium', m.status === 'ENDED' ? 'bg-hold-soft text-ink-2' : 'bg-accent-soft text-accent')}>
                  {m.status === 'ENDED' ? 'Ended' : 'Scheduled'}
                </span>
                {mom && (
                  <span className={cx('rounded px-1.5 py-px text-[11px] font-medium', mom.status === 'PUBLISHED' ? 'bg-ok-soft text-ok' : 'bg-risk-soft text-risk')}>
                    MOM {mom.status === 'PUBLISHED' ? 'published' : 'draft'}
                  </span>
                )}
                <Link to={`/meetings/${m.id}`} className={btn}><ExternalLink size={13} /> Open</Link>
              </div>
            </div>
            {mom ? (
              <div className="grid grid-cols-2 gap-6 px-4 py-3">
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-2">Decisions</div>
                  {mom.decisions.length === 0 ? <p className="text-table text-ink-2">None recorded.</p> : (
                    <ul className="list-disc space-y-1 pl-4 text-[12px]">{mom.decisions.map((d, i) => <li key={i}>{d.text}</li>)}</ul>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-2">Actions</div>
                  {mom.actions.length === 0 ? <p className="text-table text-ink-2">None recorded.</p> : (
                    <ul className="space-y-1 text-[12px]">
                      {mom.actions.map((a, i) => (
                        <li key={i} className="flex items-start justify-between gap-3">
                          <span>{a.text}</span>
                          <span className="num shrink-0 text-[11px] text-ink-2">{name(a.ownerId)}{a.dueDate ? ` · ${fmtShort(a.dueDate)}` : ''}{a.taskId ? ' · task' : ''}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="px-4 py-3 text-table text-ink-2">Agenda: {m.agenda.map((a) => a.text).join(' · ') || '–'}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

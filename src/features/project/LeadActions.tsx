// Team-leader actions: start a project (the workflow), add a task for an engineer, raise a request and assign
// the engineer who follows it up. Used on the Team page, the Projects list and the project page.
import * as Dialog from '@radix-ui/react-dialog';
import { FolderPlus, ListPlus, Send, X } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cx } from '../../design';
import type { StageCode } from '../../domain/types';
import { template } from '../../domain/seed';
import { addWorkingDays, fmtShort } from '../../lib/dates';
import { useStore } from '../../store/store';
import { btn, btnPrimary } from '../meetings/MeetingsPage';
import { unitLabel } from '../myday/labels';

const field = 'h-8 w-full rounded-input border border-line bg-surface px-2 text-[13px] outline-none focus:border-accent';
const label = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-2';
const STAGES: StageCode[] = ['CE', 'PROTO', 'DV', 'PP', 'MP'];

/** The current persona's team if they lead it (optionally: lead of a given team). */
export function useLeadTeam(teamId?: string) {
  return useStore((s) => {
    const me = s.people.find((p) => p.id === s.currentPersonId);
    if (!me || me.role !== 'TEAM_LEADER') return null;
    return !teamId || me.teamId === teamId ? me.teamId : null;
  });
}

function useEngineers(teamId: string) {
  const people = useStore((s) => s.people);
  return useMemo(() => people.filter((p) => p.teamId === teamId && p.role === 'ENGINEER'), [people, teamId]);
}

function Modal({ open, onOpenChange, title, icon, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(27,34,48,0.18)]" />
        <Dialog.Content aria-describedby={undefined} className="card fixed left-1/2 top-[8vh] z-50 max-h-[84vh] w-[600px] -translate-x-1/2 overflow-y-auto shadow-popover outline-none">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <Dialog.Title className="flex items-center gap-2 text-[16px] font-semibold">{icon}{title}</Dialog.Title>
            <Dialog.Close className="text-ink-2 hover:text-ink" aria-label="Close"><X size={16} /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Footer({ note, submit, disabled }: { note?: ReactNode; submit: string; disabled: boolean }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
      {note && <p className="mr-auto text-table text-ink-2">{note}</p>}
      <Dialog.Close className={btn}>Cancel</Dialog.Close>
      <button type="submit" className={btnPrimary} disabled={disabled}>{submit}</button>
    </div>
  );
}

// ---- New project: the start of the workflow ---------------------------------------------------------------------

export function NewProjectButton({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={btnPrimary} onClick={() => setOpen(true)}><FolderPlus size={14} /> New project</button>
      <Modal open={open} onOpenChange={setOpen} title="Start a new project" icon={<FolderPlus size={16} className="text-accent" />}>
        {open && <NewProjectForm teamId={teamId} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function NewProjectForm({ teamId, onDone }: { teamId: string; onDone: () => void }) {
  const today = useStore((s) => s.demoToday);
  const teams = useStore((s) => s.teams);
  const createProject = useStore((s) => s.createProject);
  const engineers = useEngineers(teamId);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [start, setStart] = useState(today);
  const [picked, setPicked] = useState<string[]>([]);
  const ceEnd = addWorkingDays(start, template.stages[0].plannedDays - 1);
  const total = template.stages.reduce((n, s) => n + s.subStages.reduce((m, ss) => m + ss.activities.length, 0), 0);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = createProject({ name: name.trim(), teamId, customer: customer.trim(), startDate: start, engineerIds: picked });
    onDone();
    navigate(`/projects/${id}?started=1`);
  };

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-4 px-5 py-4">
        <label className="col-span-2"><span className={label}>Project / model name</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SAC 18K 5S Inverter (2027)" autoFocus />
        </label>
        <label><span className={label}>Customer</span>
          <input className={field} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Amber CBU" />
        </label>
        <label><span className={label}>Start date (CE begins)</span>
          <input type="date" className={field} value={start} min={today} onChange={(e) => setStart(e.target.value || today)} />
        </label>
        <fieldset className="col-span-2">
          <legend className={label}>Engineers on the project ({unitLabel(teams, teamId)})</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {engineers.map((p) => (
              <label key={p.id} className={cx('flex cursor-pointer items-center gap-2 rounded-input border px-2 py-1.5 text-[12px]', picked.includes(p.id) ? 'border-accent bg-accent-soft' : 'border-line')}>
                <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} className="accent-[var(--accent)]" />
                <span className="truncate">{p.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="col-span-2 rounded-input border border-line bg-canvas px-3 py-2.5 text-table">
          <p className="font-medium">What happens when you start it</p>
          <ul className="mt-1 list-disc pl-5 text-ink-2">
            <li>The R&amp;D stage-gate workflow is created: CE → Proto → DV → PP → MP, <span className="num text-ink">{total}</span> activities from the template.</li>
            <li>CE starts <span className="num text-ink">{fmtShort(start)}</span> and closes <span className="num text-ink">{fmtShort(ceEnd)}</span>; later stages follow the template's stage days.</li>
            <li>Activities are assigned to you (team-leader steps) and the engineers you pick, who get an email.</li>
          </ul>
        </div>
      </div>
      <Footer submit="Start project" disabled={!name.trim()} note={picked.length ? `${picked.length} engineer${picked.length > 1 ? 's' : ''} notified` : 'Pick at least one engineer to share the work'} />
    </form>
  );
}

// ---- Add a task for an engineer ---------------------------------------------------------------------------------

export function AddTaskButton({ teamId, projectId, stage, title, small }: { teamId: string; projectId?: string; stage?: StageCode; title?: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={small ? 'text-[11px] font-medium text-accent hover:underline' : btn} onClick={() => setOpen(true)}>
        {!small && <ListPlus size={14} />} {small ? '+ Task' : 'Add task'}
      </button>
      <Modal open={open} onOpenChange={setOpen} title="Add a task" icon={<ListPlus size={16} className="text-accent" />}>
        {open && <AddTaskForm teamId={teamId} projectId={projectId} stage={stage} title={title} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function AddTaskForm({ teamId, projectId, stage, title: t0, onDone }: { teamId: string; projectId?: string; stage?: StageCode; title?: string; onDone: () => void }) {
  const today = useStore((s) => s.demoToday);
  const allProjects = useStore((s) => s.projects);
  const createTask = useStore((s) => s.createTask);
  const people = useStore((s) => s.people);
  const engineers = useEngineers(teamId);
  const teams = useStore((s) => s.teams);
  const otherTeams = teams.filter((t) => t.id !== teamId && t.id !== 'rnd-head' && people.some((p) => p.teamId === t.id));
  const projects = useMemo(() => allProjects.filter((p) => p.teamId === teamId), [allProjects, teamId]);
  const [title, setTitle] = useState(t0 ?? '');
  const [owner, setOwner] = useState(engineers[0]?.id ?? '');
  const [pid, setPid] = useState(projectId ?? '');
  const [st, setSt] = useState<StageCode | ''>(stage ?? (projectId ? projects.find((p) => p.id === projectId)?.stage ?? '' : ''));
  const [due, setDue] = useState(addWorkingDays(today, 3));
  const [size, setSize] = useState<'S' | 'M' | 'L'>('M');
  const [done, setDone] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    createTask({ title: title.trim(), ownerIds: [owner], teamId, projectId: pid || null, stage: st || undefined, forecastDate: due, size });
    setDone(people.find((p) => p.id === owner)?.name ?? 'the engineer');
  };

  if (done) return (
    <div className="px-5 py-6 text-center">
      <p className="text-[15px] font-semibold">Task assigned to {done}</p>
      <p className="mt-1 text-table text-ink-2">It is on their My Day now, and an assignment email is in the Outbox.</p>
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" className={btn} onClick={() => { setDone(null); setTitle(''); }}>Add another</button>
        <button type="button" className={btnPrimary} onClick={onDone}>Done</button>
      </div>
    </div>
  );

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-4 px-5 py-4">
        <label className="col-span-2"><span className={label}>Task</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Proto testing balancing, Psy lab" autoFocus />
        </label>
        <label><span className={label}>Assign to</span>
          <select className={field} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <optgroup label="My team">{engineers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.deckNoTasksLogged ? ' (no tasks logged)' : ''}</option>)}</optgroup>
            {otherTeams.map((t) => (
              <optgroup key={t.id} label={unitLabel(teams, t.id)}>
                {people.filter((p) => p.teamId === t.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label><span className={label}>Due date</span>
          <input type="date" className={field} value={due} min={today} onChange={(e) => setDue(e.target.value || today)} />
        </label>
        <label><span className={label}>Project</span>
          <select className={field} value={pid} onChange={(e) => { setPid(e.target.value); setSt(projects.find((p) => p.id === e.target.value)?.stage ?? ''); }}>
            <option value="">No project (team work)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label><span className={label}>Stage</span>
            <select className={field} value={st} onChange={(e) => setSt(e.target.value as StageCode)} disabled={!pid}>
              <option value="">–</option>
              {STAGES.map((s) => <option key={s} value={s}>{s === 'PROTO' ? 'Proto' : s}</option>)}
            </select>
          </label>
          <label><span className={label}>Size</span>
            <select className={field} value={size} onChange={(e) => setSize(e.target.value as 'S' | 'M' | 'L')}>
              <option value="S">S · 1 pt</option><option value="M">M · 2 pts</option><option value="L">L · 4 pts</option>
            </select>
          </label>
        </div>
      </div>
      <Footer submit="Assign task" disabled={!title.trim() || !owner} note="The assignee is emailed and sees it on their My Day." />
    </form>
  );
}

// ---- Raise a request and assign the engineer ---------------------------------------------------------------------

export function RaiseRequestButton({ teamId, projectId, stage, activityId, title, small }: { teamId: string; projectId?: string; stage?: StageCode; activityId?: string; title?: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={small ? 'text-[11px] font-medium text-wait hover:underline' : btn} onClick={() => setOpen(true)}>
        {!small && <Send size={14} />} {small ? 'Request' : 'Raise request'}
      </button>
      <Modal open={open} onOpenChange={setOpen} title="Raise a request to another department" icon={<Send size={16} className="text-wait" />}>
        {open && <RaiseRequestForm teamId={teamId} projectId={projectId} stage={stage} activityId={activityId} title={title} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function RaiseRequestForm({ teamId, projectId, stage, activityId, title: t0, onDone }: { teamId: string; projectId?: string; stage?: StageCode; activityId?: string; title?: string; onDone: () => void }) {
  const today = useStore((s) => s.demoToday);
  const teams = useStore((s) => s.teams);
  const people = useStore((s) => s.people);
  const allProjects = useStore((s) => s.projects);
  const raiseRequest = useStore((s) => s.raiseRequest);
  const engineers = useEngineers(teamId);
  const navigate = useNavigate();
  const projects = useMemo(() => allProjects.filter((p) => p.teamId === teamId), [allProjects, teamId]);
  const units = teams.filter((t) => t.id !== teamId && t.id !== 'management');
  const [toId, setToId] = useState(units.find((t) => t.kind === 'cross-functional')?.id ?? units[0]?.id ?? '');
  const [title, setTitle] = useState(t0 ?? '');
  const [owner, setOwner] = useState(engineers[0]?.id ?? '');
  const [pid, setPid] = useState(projectId ?? '');
  const [due, setDue] = useState(addWorkingDays(today, 5));
  const to = teams.find((t) => t.id === toId);
  const toLead = people.find((p) => p.id === to?.leaderId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const toKind = to && (to.kind === 'model' || to.kind === 'support-rnd') ? 'TEAM' : 'DEPT';
    const project = projects.find((p) => p.id === pid);
    const rid = raiseRequest({ toId, toKind, title: title.trim(), teamId, ownerId: owner, neededBy: due, projectId: pid || null, stage: stage ?? project?.stage, activityId: activityId ?? null });
    onDone();
    navigate(`/requests?id=${rid}`);
  };

  const group = (kinds: string[], heading: string) => (
    <optgroup label={heading}>{units.filter((u) => kinds.includes(u.kind)).map((u) => <option key={u.id} value={u.id}>{unitLabel(teams, u.id)}</option>)}</optgroup>
  );

  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-2 gap-4 px-5 py-4">
        <label className="col-span-2"><span className={label}>What do you need</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. DV software validation for 15K3S" autoFocus />
        </label>
        <label><span className={label}>Send to</span>
          <select className={field} value={toId} onChange={(e) => setToId(e.target.value)}>
            {group(['cross-functional'], 'Departments')}
            {group(['model', 'support-rnd'], 'R&D teams')}
            {group(['external'], 'External')}
          </select>
        </label>
        <label><span className={label}>Needed by</span>
          <input type="date" className={field} value={due} min={today} onChange={(e) => setDue(e.target.value || today)} />
        </label>
        <label><span className={label}>Engineer who follows it up</span>
          <select className={field} value={owner} onChange={(e) => setOwner(e.target.value)}>
            {engineers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label><span className={label}>Project</span>
          <select className={field} value={pid} onChange={(e) => setPid(e.target.value)} disabled={!!activityId}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="col-span-2 rounded-input border border-line bg-canvas px-3 py-2.5 text-table text-ink-2">
          Lands in <b className="text-ink">{unitLabel(teams, toId)}</b>'s queue{toLead ? <> and emails <b className="text-ink">{toLead.name}</b></> : null}. They acknowledge and commit a date.
          The engineer gets a linked task that shows <span className="font-medium text-wait">⟶ {unitLabel(teams, toId)}</span> until the request is done.
        </div>
      </div>
      <Footer submit="Raise request" disabled={!title.trim() || !owner || !toId} />
    </form>
  );
}

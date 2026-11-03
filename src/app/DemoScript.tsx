// "Demo script" side panel (plan section 11): each step jumps to its persona, demo date and screen.
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cx } from '../design';
import { setDate } from '../sim/clock';
import { useStore } from '../store/store';
import { PERSONAS } from './personas';

type Jump = { label: string; personId: string; date?: string; to: string };
interface Step { title: string; say: string; jumps: Jump[] }

const HEAD = 'p-mahender', SATBIR = 'p-satbir-singh', JATIN = 'p-jatin-sharma', DQA = 'p-dqa-lead';

export const DEMO_STEPS: Step[] = [
  { title: 'Control Tower, 13 Oct', say: '“These are your 13 Oct numbers.” 206 open, 42 overdue, 91 waiting. Heatmap: Electronics holds the most.',
    jumps: [{ label: 'Mahender · Tower', personId: HEAD, date: '2026-10-13', to: '/tower' }] },
  { title: 'Exceptions inbox', say: 'Decide “K-series CFF development” with a one-line note. It disappears and is logged.',
    jumps: [{ label: 'Mahender · Inbox', personId: HEAD, to: '/tower' }] },
  { title: 'Satbir’s team page', say: 'Same layout as his deck page, now live. Three people with “no tasks logged”.',
    jumps: [{ label: 'Satbir · RAC team', personId: SATBIR, to: '/team/rac' }] },
  { title: 'Jatin on the phone', say: 'DV closure shows ⟶ DQA (req-001, not acknowledged). Flag “Hitachi WAC grill lock modification” → Plant PPC in three taps.',
    jumps: [{ label: 'Jatin · My Day (phone)', personId: JATIN, to: '/my-day?phone=1' }] },
  { title: 'DQA commits, Jatin accepts', say: 'req-001 has a 5-day TAT. Acknowledge, commit Thu 15 Oct. Then as Jatin, accept.',
    jumps: [
      { label: 'DQA · req-001', personId: DQA, to: '/requests?id=req-001' },
      { label: 'Jatin · accept', personId: JATIN, to: '/requests?id=req-001' },
    ] },
  { title: 'Clock to 15 Oct, DQA slips', say: 'DQA moves to Tue 20 Oct, “Waiting on another department → Electronics”. Jatin’s DV closure moves to 21 Oct on its own.',
    jumps: [
      { label: 'DQA · 15 Oct', personId: DQA, date: '2026-10-15', to: '/requests?id=req-001' },
      { label: 'Jatin · My Day', personId: JATIN, to: '/my-day' },
    ] },
  { title: 'Weekly review from the DV stage', say: 'Schedule meeting on DV, show agenda and Simulated Teams link, Simulate: meeting ended, Draft MOM, Publish.',
    jumps: [{ label: '16 Oct · MHI 2028 plan', personId: SATBIR, date: '2026-10-16', to: '/projects/prj-rac-01' }] },
  { title: 'Outbox', say: 'The MOM email, the 08:30 digest with Reply “Done”, and the invite.',
    jumps: [{ label: 'Open Outbox', personId: SATBIR, to: '/outbox' }] },
  { title: 'Clock to 20 Oct, R2 fires', say: 'Electronics action still open. Jatin moves DV closure to 2 Nov → Electronics. R2 lands in Mahender’s inbox with the trail.',
    jumps: [
      { label: 'Jatin · 20 Oct', personId: JATIN, date: '2026-10-20', to: '/my-day' },
      { label: 'Mahender · Inbox', personId: HEAD, to: '/tower' },
    ] },
  { title: 'Delay ledger', say: 'The lost days are booked to Electronics, not DQA. “Nobody made a phone call in this story.”',
    jumps: [{ label: 'Ledger · since 13 Oct', personId: HEAD, to: '/ledger?period=demo' }] },
  { title: 'Start of the workflow: Satbir starts a project', say: '“New project” starts the stage-gate workflow: 137 activities CE → MP, assigned to the engineers he picks. Reassign an activity, “Add task” for Jatin, and “Raise request” to Sourcing with Jatin following it up. Each one emails the person.',
    jumps: [{ label: 'Satbir · RAC team', personId: SATBIR, to: '/team/rac' }, { label: 'Satbir · Projects', personId: SATBIR, to: '/projects' }] },
];

export function DemoScriptPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const today = useStore((s) => s.demoToday);
  const current = useStore((s) => s.currentPersonId);
  const setPersona = useStore((s) => s.setPersona);
  const go = (j: Jump) => {
    if (j.date && j.date !== useStore.getState().demoToday) setDate(j.date);
    setPersona(j.personId);
    navigate(j.to);
    window.scrollTo(0, 0);
  };
  const who = (id: string) => PERSONAS.find((p) => p.id === id)?.label;
  return (
    <aside aria-label="Demo script" className="fixed bottom-0 right-0 top-14 z-40 flex w-[360px] flex-col border-l border-line bg-surface shadow-popover">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Demo script</h2>
          <p className="text-[11px] text-ink-2">About 10 minutes. Each button sets persona, clock and screen.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close demo script" className="rounded-input p-1 text-ink-2 hover:bg-canvas hover:text-ink"><X size={16} /></button>
      </div>
      <ol className="flex-1 overflow-y-auto">
        {DEMO_STEPS.map((s, i) => (
          <li key={s.title} className="border-b border-line px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="num w-5 shrink-0 text-[13px] font-semibold text-accent">{i + 1}</span>
              <span className="text-[13px] font-semibold">{s.title}</span>
            </div>
            <p className="ml-7 mt-0.5 text-table text-ink-2">{s.say}</p>
            <div className="ml-7 mt-2 flex flex-wrap gap-1.5">
              {s.jumps.map((j) => (
                <button
                  key={j.label}
                  type="button"
                  data-step={i + 1}
                  onClick={() => go(j)}
                  title={`${who(j.personId)}${j.date ? ` · ${j.date}` : ''} · #${j.to}`}
                  className={cx(
                    'inline-flex h-7 items-center rounded-input border px-2.5 text-[12px] font-medium hover:border-accent hover:text-accent',
                    j.personId === current && (!j.date || j.date === today) ? 'border-line bg-canvas' : 'border-line bg-surface',
                  )}
                >
                  {j.label} →
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <p className="border-t border-line px-4 py-2 text-[11px] text-ink-2">Start from <b>Reset demo</b>. Steps build on each other.</p>
    </aside>
  );
}

// App shell (plan section 4): slim top bar + left icon rail. Content max 1440 px.
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import {
  Bell, BookOpen, CalendarDays, Check, ChevronDown, ClipboardList, FolderKanban, Inbox, LayoutDashboard, Mail, RotateCcw, Scale,
  Sun, Users,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { cx, SimulatedTag } from '../design';
import { fmtLong } from '../lib/dates';
import { advanceDays, run0830, setDate } from '../sim/clock';
import { useStore } from '../store/store';
import { DemoScriptPanel } from './DemoScript';
import { initials, PERSONAS } from './personas';

const btn = 'inline-flex h-8 items-center gap-1.5 rounded-input border border-line bg-surface px-2.5 text-[12px] font-medium text-ink hover:border-accent hover:text-accent';

export function Shell() {
  const [script, setScript] = useState(false);
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar script={script} onScript={() => setScript((v) => !v)} />
      {script && <DemoScriptPanel onClose={() => setScript(false)} />}
      <div className="flex flex-1">
        <Rail />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-content px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function TopBar({ script, onScript }: { script: boolean; onScript: () => void }) {
  const navigate = useNavigate();
  const resetDemo = useStore((s) => s.resetDemo);
  const unreadMail = useStore((s) => s.emails.length);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-line bg-surface px-4">
      <NavLink to="/tower" className="flex items-center gap-2.5 pr-2">
        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-[6px] bg-ink">
          <span className="block h-2.5 w-2.5 rotate-45 bg-accent" />
        </span>
        <span className="leading-tight">
          <span className="block text-[14px] font-semibold tracking-tight">R&amp;D Control Tower</span>
          <span className="block text-[11px] text-ink-2">Amber · R&amp;D</span>
        </span>
      </NavLink>
      <Clock />
      <div className="ml-auto flex items-center gap-2">
        <button type="button" className={cx(btn, script && 'border-accent bg-accent-soft text-accent')} aria-pressed={script} onClick={onScript}>
          <BookOpen size={14} aria-hidden /> Demo script
        </button>
        <PersonaSwitcher />
        <Bell_ />
        <NavLink to="/outbox" className={({ isActive }) => cx(btn, isActive && 'border-accent text-accent')} title="Simulated Outbox">
          <Mail size={14} aria-hidden /> Outbox
          <span className="num rounded bg-canvas px-1 text-[11px] text-ink-2">{unreadMail}</span>
        </NavLink>
        <button
          type="button"
          className={btn}
          onClick={() => { resetDemo(); navigate('/tower'); }}
          title="Restore the 13 Oct seed state"
        >
          <RotateCcw size={14} aria-hidden /> Reset demo
        </button>
      </div>
    </header>
  );
}

function Clock() {
  const today = useStore((s) => s.demoToday);
  return (
    <div className="flex items-center gap-1.5 rounded-card border border-line bg-canvas py-1 pl-3 pr-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-2">Demo clock</span>
      <label className="relative ml-1 flex items-center gap-1.5 font-mono text-[13px] font-medium">
        <CalendarDays size={14} className="text-accent" aria-hidden />
        {fmtLong(today)}
        <input
          type="date"
          aria-label="Set demo date"
          value={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <button type="button" className={btn} onClick={() => advanceDays(1)}>+1 day</button>
      <button type="button" className={btn} onClick={() => advanceDays(7)}>+1 week</button>
      <button type="button" className={btn} onClick={run0830} title="Send the 08:30 digest to everyone with items due">
        <Sun size={14} aria-hidden /> Run 08:30
      </button>
    </div>
  );
}

function PersonaSwitcher() {
  const navigate = useNavigate();
  const people = useStore((s) => s.people);
  const currentId = useStore((s) => s.currentPersonId);
  const setPersona = useStore((s) => s.setPersona);
  const me = people.find((p) => p.id === currentId);
  const label = PERSONAS.find((p) => p.id === currentId)?.label ?? me?.title;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex h-9 items-center gap-2 rounded-input border border-line bg-surface pl-1 pr-2 hover:border-accent" aria-label="Switch persona">
        <Avatar name={me?.name ?? '?'} />
        <span className="text-left leading-tight">
          <span className="block text-[12px] font-semibold">{me?.name}</span>
          <span className="block text-[11px] text-ink-2">{label}</span>
        </span>
        <ChevronDown size={14} className="text-ink-2" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-72 rounded-card border border-line bg-surface p-1 shadow-popover">
          <DropdownMenu.Label className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-2">View the demo as</DropdownMenu.Label>
          {PERSONAS.map((p) => {
            const person = people.find((x) => x.id === p.id);
            return (
              <DropdownMenu.Item
                key={p.id}
                onSelect={() => { setPersona(p.id); navigate(p.home); }}
                className="flex cursor-pointer items-center gap-2.5 rounded-input px-2 py-1.5 outline-none data-[highlighted]:bg-accent-soft"
              >
                <Avatar name={person?.name ?? p.label} />
                <span className="flex-1 leading-tight">
                  <span className="block text-[13px] font-medium">{person?.name}</span>
                  <span className="block text-[11px] text-ink-2">{p.label}</span>
                </span>
                {p.id === currentId && <Check size={14} className="text-accent" aria-hidden />}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-[11px] font-medium text-accent', className)}>
      {initials(name)}
    </span>
  );
}

function Bell_() {
  const navigate = useNavigate();
  const currentId = useStore((s) => s.currentPersonId);
  const all = useStore((s) => s.notifications);
  const markRead = useStore((s) => s.markNotificationsRead);
  const mine = all.filter((n) => n.toId === currentId).reverse();
  const unread = mine.filter((n) => !n.read).length;
  return (
    <Popover.Root onOpenChange={(open) => !open && unread && markRead(currentId)}>
      <Popover.Trigger className={cx(btn, 'relative w-8 justify-center px-0')} aria-label={`Notifications (${unread} unread)`}>
        <Bell size={15} aria-hidden />
        {unread > 0 && (
          <span className="num absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-late px-1 text-center text-[10px] leading-[18px] text-surface">{unread}</span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-80 rounded-card border border-line bg-surface shadow-popover">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[13px] font-semibold">Notifications</span>
            <span className="text-[11px] text-ink-2">{mine.length} total</span>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {mine.length === 0 && <li className="px-3 py-6 text-center text-ink-2">Nothing new for you.</li>}
            {mine.slice(0, 30).map((n) => (
              <li key={n.id} className="border-b border-line last:border-0">
                <Popover.Close asChild>
                  <button type="button" onClick={() => n.link && navigate(n.link)} className="flex w-full gap-2 px-3 py-2 text-left hover:bg-canvas">
                    <span aria-hidden className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-accent')} />
                    <span className="flex-1">
                      <span className="block text-[12px]">{n.text}</span>
                      <span className="font-mono text-[11px] text-ink-2">{n.kind.toLowerCase()} · {n.at}</span>
                    </span>
                  </button>
                </Popover.Close>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Rail() {
  const teamId = useStore((s) => {
    const me = s.people.find((p) => p.id === s.currentPersonId);
    return me && s.teams.some((t) => t.id === me.teamId && t.kind === 'model') ? me.teamId : 'rac';
  });
  const items: { to: string; label: string; short?: string; icon: ReactNode }[] = [
    { to: '/tower', label: 'Control Tower', short: 'Tower', icon: <LayoutDashboard size={18} /> },
    { to: `/team/${teamId}`, label: 'Team', icon: <Users size={18} /> },
    { to: '/my-day', label: 'My Day', icon: <ClipboardList size={18} /> },
    { to: '/projects', label: 'Projects', icon: <FolderKanban size={18} /> },
    { to: '/requests', label: 'Requests', icon: <Inbox size={18} /> },
    { to: '/meetings', label: 'Meetings', icon: <CalendarDays size={18} /> },
    { to: '/ledger', label: 'Delay ledger', short: 'Ledger', icon: <Scale size={18} /> },
    { to: '/outbox', label: 'Outbox', icon: <Mail size={18} /> },
  ];
  return (
    <nav aria-label="Main" className="sticky top-14 flex h-[calc(100vh-3.5rem)] w-[72px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3">
      {items.map((i) => (
        <NavLink
          key={i.label}
          to={i.to}
          title={i.label}
          className={({ isActive }) => cx(
            'flex w-[60px] flex-col items-center gap-1 rounded-input py-2 text-[10px] font-medium',
            isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-canvas hover:text-ink',
          )}
        >
          <span aria-hidden>{i.icon}</span>
          {i.short ?? i.label}
        </NavLink>
      ))}
      <div className="mt-auto"><SimulatedTag label="Demo" /></div>
    </nav>
  );
}

/** Page header used by every screen: title, optional subtitle and right-side actions. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-title font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// Uploaded MOM (plain text, the format below) -> meeting header, decisions and assignable actions. Pure.
import { ownerFromText, resolveDate } from './mom-extractor';
import type { DomainState } from './types';

export const MOM_TEMPLATE = `MINUTES OF MEETING
Meeting: <meeting title>
Date: <YYYY-MM-DD>
Project: <project name, or leave blank>
Attendees: <name>, <name>, <name>

DISCUSSION
- <point discussed>

DECISIONS
- <what was decided>

ACTIONS
# | Action | Owner | Due
1 | <what needs doing> | <person name or team, e.g. DQA> | <YYYY-MM-DD or "Monday">
`;

export const SAMPLE_MOM = `MINUTES OF MEETING
Meeting: MHI 2028 DV review
Date: 2026-10-16
Project: MHI 2028 BEE line-up
Attendees: Mahender Kumar, Satbir Singh, Jatin Sharma, Abhishek Sharma, DQA Lead, Sourcing Lead

DISCUSSION
- DV closure for 15K3S is held by software validation; DQA expects the build by 19 Oct.
- Grill lock modification for Hitachi WAC needs a tooling slot from Plant PPC.
- Second source for the BLDC fan motor is still open.

DECISIONS
- DV closure target stays 21 Oct; no further slip without R&D head approval.
- Go ahead with the second BLDC motor source for trials.

ACTIONS
# | Action | Owner | Due
1 | Share DV test plan revision with DQA | Jatin Sharma | 2026-10-19
2 | Complete 15K3S software validation and sign off | DQA | 2026-10-21
3 | Raise PO for BLDC motor trial samples | Sourcing Lead | 2026-10-23
4 | Book tooling slot for grill lock modification | Satbir Singh | Monday
5 | Update DV cost sheet with second-source motor | Abhishek Sharma | 2026-10-22
6 | Prepare noise test fixture for MHI 15K | TBD | 2026-10-26
`;

export interface UploadedAction { n: number; text: string; ownerRaw: string; ownerId?: string; dueRaw: string; dueDate?: string }
export interface UploadedMom {
  title: string; date?: string; projectRaw: string; projectId?: string; attendees: string[];
  points: string[]; decisions: string[]; actions: UploadedAction[]; errors: string[];
}

type S = Pick<DomainState, 'people' | 'teams' | 'projects'>;

/** A name, first name or team word -> person id. "TBD" / blank stays unassigned. */
export function matchPerson(s: S, raw: string): string | undefined {
  const q = raw.trim().toLowerCase();
  if (!q || /^(tbd|tba|-|na|n\/a)$/.test(q)) return undefined;
  const exact = s.people.find((p) => p.name.toLowerCase() === q);
  if (exact) return exact.id;
  const first = s.people.filter((p) => p.name.toLowerCase().split(/\s+/)[0] === q);
  if (first.length === 1) return first[0].id;
  return ownerFromText(s, raw);
}

export function parseMom(s: S, text: string): UploadedMom {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const field = (k: string) => lines.find((l) => l.toLowerCase().startsWith(`${k.toLowerCase()}:`))?.slice(k.length + 1).trim() ?? '';
  const out: UploadedMom = { title: field('Meeting'), projectRaw: field('Project'), attendees: field('Attendees').split(',').map((x) => x.trim()).filter(Boolean),
    points: [], decisions: [], actions: [], errors: [] };
  const d = field('Date');
  out.date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
  if (!out.title) out.errors.push('No "Meeting:" line.');
  if (!out.date) out.errors.push('No "Date: YYYY-MM-DD" line.');
  const pq = out.projectRaw.toLowerCase();
  out.projectId = pq ? s.projects.find((p) => p.name.toLowerCase().includes(pq) || pq.includes(p.name.toLowerCase()))?.id : undefined;

  let section = '';
  for (const l of lines) {
    if (/^(DISCUSSION|DECISIONS|ACTIONS)$/i.test(l)) { section = l.toUpperCase(); continue; }
    if (!l || l.startsWith('#')) continue;
    if (section === 'DISCUSSION' && l.startsWith('-')) out.points.push(l.slice(1).trim());
    if (section === 'DECISIONS' && l.startsWith('-')) out.decisions.push(l.slice(1).trim());
    if (section === 'ACTIONS' && l.includes('|')) {
      const [n, action, owner = '', due = ''] = l.split('|').map((x) => x.trim());
      if (!action) continue;
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : out.date ? resolveDate(due, out.date) : undefined;
      out.actions.push({ n: Number(n) || out.actions.length + 1, text: action, ownerRaw: owner, ownerId: matchPerson(s, owner), dueRaw: due, dueDate });
    }
  }
  if (!out.actions.length) out.errors.push('No rows under ACTIONS (format: # | Action | Owner | Due).');
  return out;
}

// Deterministic, rule-based MOM extractor (plan section 7). No LLM: keyword rules over transcript lines.
import { addDays, addWorkingDays } from '../lib/dates';
import { headId, leaderOf } from './rules';
import type { DomainState, Mom, TranscriptLine } from './types';

/** Parses WebVTT cues of the form `<v Speaker>text` into numbered lines. */
export function parseVtt(vtt: string): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  const cues = vtt.replace(/\r/g, '').split(/\n\n+/);
  for (const cue of cues) {
    const m = cue.match(/^(\d{2}:\d{2}:\d{2})\.\d{3} --> [^\n]+\n<v ([^>]+)>([\s\S]*)$/m);
    if (m) out.push({ n: out.length + 1, start: m[1], speaker: m[2].trim(), text: m[3].replace(/\s+/g, ' ').trim() });
  }
  return out;
}

type People = Pick<DomainState, 'people' | 'teams'>;

// Role words → team whose leader owns the action. Order matters: "R&D Head" before "RAC".
const ROLES: [RegExp, string][] = [
  [/R&D Head|\bhead\b/i, 'HEAD'],
  [/\bRAC\b/, 'rac'],
  [/Sourcing/i, 'sourcing'],
  [/\bDQA\b/, 'dqa'],
  [/Electronics/i, 'electronics'],
  [/Structure/i, 'structure'],
  [/\bLab\b/i, 'lab'],
  [/\bPPC\b|Plant/i, 'plant-ppc'],
];

/** Maps the first role word in `text` to a person id (team leader, or the head). */
export function ownerFromText(s: People, text: string): string | undefined {
  const hit = ROLES.map(([re, team]) => ({ i: text.search(re), team })).filter((r) => r.i >= 0).sort((a, b) => a.i - b.i)[0];
  if (!hit) return undefined;
  return hit.team === 'HEAD' ? headId(s) : leaderOf(s, hit.team);
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Resolves "Monday the 19th", "by Tuesday the 20th", "by Monday", "the 21st", "20 Oct" against the meeting date (ISO). */
export function resolveDate(text: string, meetingDate: string): string | undefined {
  const t = text.toLowerCase();
  const year = Number(meetingDate.slice(0, 4));
  const dm = t.match(/\b(\d{1,2}) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  if (dm) return `${year}-${String(MONTHS.indexOf(dm[2]) + 1).padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  const nth = t.match(/\bthe (\d{1,2})(?:st|nd|rd|th)\b/);
  if (nth) {
    // first date on or after the meeting with that day of month
    for (let d = meetingDate, i = 0; i < 62; i++, d = addDays(d, 1)) if (Number(d.slice(8)) === Number(nth[1])) return d;
  }
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (wd >= 0) {
    for (let d = addDays(meetingDate, 1), i = 0; i < 7; i++, d = addDays(d, 1)) if (new Date(`${d}T00:00:00`).getDay() === wd) return d;
  }
  return undefined;
}

const firstSentence = (s: string) => s.split(/(?<=[.?!])\s/)[0].replace(/[.?!]$/, '').trim();
const tidy = (s: string) => {
  const t = s.replace(/^I'll /i, '').replace(/^I will /i, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export type MomDraft = Pick<Mom, 'decisions' | 'actions'>;

/**
 * Lines containing "Decision" → decisions; "Action for <X>:" / "Action:" → actions.
 * Owner: X (or the speaker when X is "me"), else the first role word in the action. Due: resolved date, or +5 working days.
 */
export function extractMom(lines: TranscriptLine[], meetingDate: string, s: People): MomDraft {
  const decisions: MomDraft['decisions'] = [];
  const actions: MomDraft['actions'] = [];
  for (const l of lines) {
    const dec = l.text.match(/\bDecision\b[^:]*:\s*(.+)$/i);
    if (dec) {
      decisions.push({ text: firstSentence(dec[1]), sourceLine: l.n });
      continue;
    }
    const act = l.text.match(/\bAction(?: for ([^:]+))?:\s*(.+)$/i);
    if (act) {
      const who = act[1]?.trim();
      const text = tidy(firstSentence(act[2])).replace(/\bme\b/g, `the ${l.speaker}`);
      const ownerId = who
        ? ownerFromText(s, /^me$/i.test(who) ? l.speaker : who)
        : ownerFromText(s, text) ?? ownerFromText(s, l.speaker);
      actions.push({ text, ownerId, dueDate: resolveDate(text, meetingDate) ?? addWorkingDays(meetingDate, 5), sourceLine: l.n });
    }
  }
  return { decisions, actions };
}

// Date helpers on ISO 'yyyy-MM-dd' strings. "Today" is always passed in (the demo clock), never new Date().
import {
  addBusinessDays,
  addDays as addCalendarDays,
  differenceInBusinessDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  isWeekend,
  parseISO,
  startOfWeek,
} from 'date-fns';

export const DEFAULT_DEMO_TODAY = '2026-10-13';

const toISO = (d: Date) => format(d, 'yyyy-MM-dd');

export const addDays = (iso: string, n: number) => toISO(addCalendarDays(parseISO(iso), n));
/** Adds n working days (Mon-Fri). From a weekend date, +1 lands on Monday. */
export const addWorkingDays = (iso: string, n: number) => toISO(addBusinessDays(parseISO(iso), n));
/** Calendar days from a to b (b - a). */
export const daysBetween = (a: string, b: string) => differenceInCalendarDays(parseISO(b), parseISO(a));
/** Working days from a to b (b - a), weekends skipped. */
export const workingDaysBetween = (a: string, b: string) => differenceInBusinessDays(parseISO(b), parseISO(a));
export const isWorkingDay = (iso: string) => !isWeekend(parseISO(iso));
/** The date itself if a working day, else the next Monday. */
export const nextWorkingDay = (iso: string) => (isWorkingDay(iso) ? iso : addWorkingDays(iso, 1));
/** Monday of the ISO week containing iso. */
export const weekStart = (iso: string) => toISO(startOfWeek(parseISO(iso), { weekStartsOn: 1 }));
/** Sunday ending the week containing iso. */
export const weekEnd = (iso: string) => toISO(endOfWeek(parseISO(iso), { weekStartsOn: 1 }));

export const fmtShort = (iso: string) => format(parseISO(iso), 'd MMM');
export const fmtDay = (iso: string) => format(parseISO(iso), 'EEE d MMM');
export const fmtLong = (iso: string) => format(parseISO(iso), 'EEE d MMM yyyy');

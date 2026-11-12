// Simulated Outlook: emails land in the store's emails[] and show in #/outbox. Nothing is sent.
import type { Email } from '../domain/types';
import { useStore } from '../store/store';

export interface OutgoingEmail {
  kind: Email['kind'];
  toIds: string[];
  ccIds?: string[];
  subject: string;
  html: string;
  relatedId?: string;
  /** Defaults to demoToday; pass e.g. `${demoToday} 08:30` for timed mails. */
  at?: string;
}

export const sendEmail = (e: OutgoingEmail): string => useStore.getState().sendEmail(e);

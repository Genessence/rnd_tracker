// In-app notification feed (the bell). link is a hash route, e.g. '/requests?id=req-001'.
import type { Notification } from '../domain/types';
import { useStore } from '../store/store';

export const notify = (personId: string, text: string, link?: string, kind: Notification['kind'] = 'INFO', relatedId?: string) =>
  useStore.getState().notify(personId, kind, text, relatedId, link);

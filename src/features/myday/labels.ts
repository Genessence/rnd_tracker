// Shared labels for the Team and My Day screens.
import type { Team, WaitingOn } from '../../domain/types';
import { shortTeam } from '../../store/selectors';

/** "Plant (PPC)" -> "Plant PPC", "RAC (SAC / WAC)" -> "RAC", "Purchase / Sourcing" -> "Sourcing". */
export const unitLabel = (teams: Team[], id: string) => {
  const name = teams.find((t) => t.id === id)?.name ?? id;
  if (name === 'Plant (PPC)') return 'Plant PPC';
  if (name === 'Purchase / Sourcing') return 'Sourcing';
  return shortTeam(name);
};

/** Chip text for a waitingOn, or null when it does not wait on anyone. */
export const waitingLabel = (teams: Team[], w?: WaitingOn | null) =>
  !w ? null : w.kind === 'HEAD' ? 'R&D head' : w.kind === 'NOTE' ? w.note.replace(/^Waiting on /, '') : unitLabel(teams, w.id);

export const requestIdOf = (w?: WaitingOn | null) => (w && (w.kind === 'TEAM' || w.kind === 'DEPT') ? w.requestId : undefined);

// Demo personas (plan section 9) and the screen each one lands on.
export const PERSONAS = [
  { id: 'p-mahender', label: 'R&D head', home: '/tower' },
  { id: 'p-satbir-singh', label: 'RAC team leader', home: '/team/rac' },
  { id: 'p-jatin-sharma', label: 'RAC engineer', home: '/my-day' },
  { id: 'p-dhiraj-gupta', label: 'Electronics software lead', home: '/requests' },
  { id: 'p-dqa-lead', label: 'DQA', home: '/requests' },
  { id: 'p-sourcing-lead', label: 'Sourcing', home: '/requests' },
] as const;

export const homeOf = (personId: string) => PERSONAS.find((p) => p.id === personId)?.home ?? '/tower';

export const initials = (name: string) =>
  name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

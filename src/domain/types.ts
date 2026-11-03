// Domain types (POC_BUILD_PLAN.md section 6.1). Dates are ISO 'yyyy-MM-dd' strings.

export type StageCode = 'CE' | 'PROTO' | 'DV' | 'PP' | 'MP' | 'TOOLING' | 'INFRA' | 'ON_HOLD';
export type Role = 'HEAD' | 'TEAM_LEADER' | 'ENGINEER' | 'DEPT_LEAD';
export type Size = 'S' | 'M' | 'L'; // load points: S=1, M=2, L=4; weekly capacity 10
export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
export type Rag = 'green' | 'amber' | 'red';

export const RAIL_STAGES = ['CE', 'PROTO', 'DV', 'PP', 'MP'] as const;
export type RailStage = (typeof RAIL_STAGES)[number];
export const SIZE_POINTS: Record<Size, number> = { S: 1, M: 2, L: 4 };

export interface Team {
  id: string;
  name: string;
  kind: 'model' | 'support-rnd' | 'cross-functional' | 'external';
  leaderId: string;
}

export interface Person {
  id: string;
  name: string;
  teamId: string;
  title: string;
  role: Role;
  level: 'L1' | 'L2' | 'L3';
  reportsTo: string | null;
  email: string;
  deckOverdue?: number | null;
  deckNoTasksLogged?: boolean;
  placeholder?: boolean;
}

export interface Project {
  id: string;
  name: string;
  teamId: string;
  customer?: string | null;
  note?: string;
  stage: StageCode;
  onHold: boolean;
  nextMilestone?: string | null;
  nextMilestoneDate?: string | null;
  rag: Rag;
  ownerId: string;
  templateId?: string | null;
  plan?: PlanActivity[]; // plan only for instantiated projects
}

export interface PlanActivity {
  activityId: string;
  sNo: string;
  name: string;
  stage: StageCode;
  subStage: string;
  kind: string;
  ownerId?: string;
  dependencyTeam?: string; // team / department id
  plannedDays: number | null;
  baselineStart: string;
  baselineEnd: string;
  committedEnd: string;
  forecastEnd: string;
  actualEnd?: string;
  status: TaskStatus;
  requestId?: string;
}

export type WaitingOn =
  | { kind: 'HEAD' }
  | { kind: 'TEAM' | 'DEPT'; id: string; note?: string; requestId?: string }
  | { kind: 'NOTE'; note: string };

export interface Task {
  id: string;
  title: string;
  teamId: string;
  projectId?: string | null;
  stage?: StageCode;
  ownerIds: string[];
  size: Size;
  status: TaskStatus;
  waitingOn?: WaitingOn | null;
  baselineDate: string;
  committedDate: string;
  forecastDate: string;
  doneDate?: string;
  lastUpdatedAt: string;
  source: 'deck-13-oct' | 'generated' | 'mom' | 'user';
  momId?: string;
}

export interface RequestComment {
  id: string;
  byId: string;
  at: string;
  text: string;
}

export interface HistoryEvent {
  at: string;
  byId: string;
  type: 'RAISED' | 'ACKNOWLEDGED' | 'COMMITTED' | 'ACCEPTED' | 'COUNTERED' | 'COMMENTED' | 'DONE' | 'REJECTED';
  detail?: string;
}

export type RequestStatus = 'OPEN' | 'ACKNOWLEDGED' | 'COMMITTED' | 'ACCEPTED' | 'DONE' | 'REJECTED';

export interface Request {
  id: string;
  fromTeamId: string;
  toId: string;
  toKind: 'TEAM' | 'DEPT';
  title: string;
  blocks: string;
  projectId?: string | null;
  taskId?: string | null;
  activityId?: string | null; // template activity id within the project's plan
  raisedById: string;
  raisedAt: string;
  status: RequestStatus;
  requestedDate?: string | null;
  committedDate?: string | null;
  plannedTatDays?: number | null;
  comments: RequestComment[];
  history: HistoryEvent[];
}

export type DateEntity = 'task' | 'request' | 'activity';

export interface DateChange {
  id: string;
  entity: DateEntity;
  entityId: string; // activity: `${projectId}:${activityId}`
  field: 'forecast' | 'committed';
  from: string;
  to: string;
  reasonCode: string;
  note?: string;
  attributedTo?: string; // team / dept id
  byId: string;
  at: string;
}

export interface Decision {
  id: string;
  teamId: string;
  title: string;
  ask: string;
  raisedById: string;
  kind: 'DECISION' | 'SUPPORT' | 'ESCALATION';
  status: 'PENDING' | 'DECIDED' | 'PUSHED_BACK';
  raisedOn: string;
  outcome?: string;
}

export interface AgendaItem {
  text: string;
  refId?: string;
}

export interface TranscriptLine {
  n: number;
  speaker: string;
  start: string;
  text: string;
}

export interface Meeting {
  id: string;
  title: string;
  scope: { projectId?: string; stage?: StageCode; taskId?: string };
  organiserId: string;
  attendeeIds: string[];
  start: string;
  durationMin: number;
  recurrence?: 'weekly' | null;
  teamsJoinUrl: string;
  agenda: AgendaItem[];
  status: 'SCHEDULED' | 'ENDED';
  transcript?: TranscriptLine[];
  momId?: string;
}

export interface Mom {
  id: string;
  meetingId: string;
  status: 'DRAFT' | 'PUBLISHED';
  points: string[];
  decisions: { text: string; sourceLine?: number }[];
  actions: { text: string; ownerId?: string; dueDate?: string; sourceLine?: number; taskId?: string }[];
  publishedAt?: string;
}

export interface Email {
  id: string;
  at: string;
  toIds: string[];
  ccIds?: string[];
  subject: string;
  html: string;
  kind: 'DIGEST' | 'ASSIGNMENT' | 'REMINDER' | 'ESCALATION' | 'MOM' | 'INVITE' | 'WEEKLY';
  relatedId?: string;
  replied?: 'DONE' | 'NEW_DATE';
}

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';

export interface Exception {
  id: string;
  ruleId: RuleId;
  entityId: string;
  teamId: string;
  title: string;
  detail: string;
  since: string;
  routedToId: string; // leader or head
}

export interface Notification {
  id: string;
  at: string;
  toId: string;
  text: string;
  kind: 'ASSIGNMENT' | 'REQUEST' | 'COMMITMENT' | 'ESCALATION' | 'MOM';
  relatedId?: string;
  read?: boolean;
}

export interface Lab {
  id: string;
  name: string;
  sepBookedPct: number;
  sepLossHours: number;
  octPlannedTests: number;
  note?: string;
}

export interface ReasonCode {
  code: string;
  label: string;
}

export interface EscalationRule {
  id: RuleId;
  label: string;
  param?: number;
}

export interface DeckKpi {
  openItems: number;
  overdue: number;
  dueThisWeek: number;
  waitingOnOthers: number;
  needsHead: number;
  projectsAtRed: number;
}

export interface Settings {
  r1SlipDays: number; // calendar days forecast beyond committed
  r4StaleDays: number; // days since lastUpdatedAt
  r4EscalateAfterDays: number; // extra days before routing to the team leader
  r5LoadPct: number; // % of weekly capacity
  r5WeeklyCapacity: number; // load points per week
  r6AckWorkingDays: number; // working days a request may stay OPEN
}

export type ExceptionAction = 'DECIDE' | 'REASSIGN' | 'PUSH_BACK' | 'ESCALATE' | 'ACCEPT_DATE';

export interface ActionLogEntry {
  id: string;
  at: string;
  byId: string;
  action: string; // e.g. 'EXCEPTION_DECIDE', 'TASK_COMPLETE'
  entityId: string;
  note?: string;
}

// Template (seed/rd-cycle-template.json)
export interface TemplateActivity {
  id: string;
  sNo: string;
  name: string;
  plannedDays: number | null;
  dependencyTeam: string | null;
  parallelWith: string | null;
  responsibility: string | null;
  ownership: string | null;
  kind: string;
  order: number;
}
export interface TemplateSubStage {
  sNo: string;
  name: string;
  plannedDays: number | null;
  activities: TemplateActivity[];
}
export interface TemplateStage {
  code: RailStage;
  sNo: string;
  name: string;
  plannedDays: number;
  owner: string;
  subStages: TemplateSubStage[];
}
export interface Template {
  templateId: string;
  name: string;
  stageOrder: RailStage[];
  activityCount: number;
  stages: TemplateStage[];
}

/** The domain slice of app state: everything rules, generator and ledger read. */
export interface DomainState {
  demoToday: string;
  settings: Settings;
  teams: Team[];
  people: Person[];
  projects: Project[];
  tasks: Task[];
  requests: Request[];
  decisions: Decision[];
  dateChanges: DateChange[];
}

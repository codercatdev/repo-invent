export type SessionLevel = 100 | 200 | 300 | 400 | 500;

export type SessionFormat =
  | "Breakout"
  | "Chalk Talk"
  | "Builders' Session"
  | "Workshop"
  | "Launch Session"
  | "Code Talk"
  | "Lab";

export type Venue =
  | "The Venetian"
  | "Wynn | Encore"
  | "Caesars Forum"
  | "Caesars Palace"
  | "MGM Grand"
  | "Mandalay Bay";

export interface RepoRef {
  owner: string;
  repo: string;
  ref?: string;
}

export interface RepoFile {
  path: string;
  size: number;
}

export interface RepoSnapshot {
  ref: RepoRef;
  defaultBranch: string;
  languages: Record<string, number>;
  files: RepoFile[];
  manifests: Record<string, string>;
  truncated: boolean;
  fetchedFiles: number;
  fetchedBytes: number;
}

export interface SignalSource {
  kind: "manifest" | "iac" | "container" | "mcp" | "code";
  path: string;
  detail?: string;
}

export interface DetectedService {
  service: string;
  confidence: "high" | "medium" | "low";
  sources: SignalSource[];
}

export interface StackFingerprint {
  repo: RepoRef;
  scannedAt: string;
  languages: Record<string, number>;
  services: DetectedService[];
  frameworks: string[];
  compute: Array<"lambda" | "ecs" | "eks" | "ec2" | "apprunner" | "unknown">;
  iac: Array<"terraform" | "cdk" | "serverless" | "sst" | "none">;
  hasMcpConfig: boolean;
  hasDocker: boolean;
  recommendedLevel: SessionLevel;
  warnings: string[];
}

export interface Evidence {
  label: string;
  paths: string[];
}

export interface ArchitecturalGap {
  id: string;
  title: string;
  why: string;
  severity: "high" | "medium" | "low";
  evidence: Evidence[];
  taggedServices: string[];
  searchTopics: string[];
  targetLevel: SessionLevel;
}

export interface SessionAvailability {
  reservable: boolean;
  fullness: "open" | "filling" | "full" | "walk-up-up" | "unknown";
  seatsReported?: number;
}

export interface ReinventSession {
  sessionId: string;
  title: string;
  abstract: string;
  code?: string;
  type: SessionFormat | string;
  level: SessionLevel | number;
  venue: Venue | string;
  room?: string;
  start: string;
  end: string;
  allDay?: boolean;
  availability: SessionAvailability;
  tracks: string[];
  topics: string[];
  services: string[];
  speakers: string[];
  recorded?: boolean;
}

export interface Catalog {
  eventId: string;
  fetchedAt: string;
  source: "live" | "fixture";
  sessions: ReinventSession[];
}

export interface ScoredSession {
  session: ReinventSession;
  score: number;
  matchedGaps: string[];
  reasons: string[];
}

export type PlanAction =
  | "reserve"
  | "favorite-walk-up"
  | "favorite-watchlist"
  | "personal-time";

export interface ScheduleItem {
  action: PlanAction;
  sessionId?: string;
  title: string;
  start: string;
  end: string;
  venue: string;
  level?: SessionLevel | number;
  gaps: string[];
  note?: string;
}

export interface TransitLeg {
  from: Venue | string;
  to: Venue | string;
  minutes: number;
  mode: "walk" | "shuttle" | "rideshare";
  note?: string;
}

export interface PersonalTimeEntry {
  personalTimeId: string;
  title: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
  location?: string;
}

export interface PlannedDay {
  date: string;
  items: ScheduleItem[];
  transit: TravelCheck[];
}

export interface TravelCheck {
  fromTitle: string;
  toTitle: string;
  gapMinutes: number;
  requiredMinutes: number;
  ok: boolean;
  leg: TransitLeg;
  forfeitureRisk: boolean;
}

export interface SchedulePlan {
  eventId: string;
  repo: RepoRef;
  fingerprint: StackFingerprint;
  gaps: ArchitecturalGap[];
  days: PlannedDay[];
  personalTime: PersonalTimeEntry[];
  warnings: string[];
}

export interface RemediationTicket {
  id: string;
  gapId: string;
  title: string;
  why: string;
  effort: "S" | "M" | "L";
  acceptanceTest: string;
  sessionIds: string[];
  docLinks: string[];
}

export interface RemediationPlan {
  tickets: RemediationTicket[];
  generatedAt: string;
}

export interface PrescriptionPlan {
  fingerprint: StackFingerprint;
  gaps: ArchitecturalGap[];
  schedule: SchedulePlan;
  remediation: RemediationPlan;
}

export interface ApiAuditReport {
  eventId: string;
  source: "live" | "fixture";
  operations: Array<{
    name: string;
    ok: boolean;
    detail?: string;
  }>;
  signedIn: boolean;
  registered: boolean;
  notes: string[];
}

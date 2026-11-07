import { authorizedFetch } from "../auth/pkce";
import type {
  ApiAuditReport,
  Catalog,
  PersonalTimeEntry,
  ReinventSession,
  SessionLevel,
} from "../types";

export const API_BASE = "https://api.awsevents.com/v1";
export const DEFAULT_EVENT_ID = "reinvent2026";

// Per-attendee quota, in requests per minute. Writes count each SESSION named,
// not each request, so a batch buys round trips and nothing else.
const QUOTA_PER_MINUTE: Record<string, number> = {
  GetSession: 120,
  ListSessions: 120,
  GetSchedule: 60,
  ReserveSessions: 30,
  CancelReservation: 30,
  AssociateFavorites: 30,
  DisassociateFavorite: 30,
  CreatePersonalTime: 30,
  UpdatePersonalTime: 30,
  DeletePersonalTime: 30,
};

const MAX_BACKOFF_MS = 30_000;
const MAX_RETRY_AFTER_SECONDS = 120;

export class EventsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "EventsApiError";
  }
}

/** Signed in, but not registered for this event. A 403 with a JSON body. */
export class NotRegisteredError extends EventsApiError {
  constructor(operation: string, body?: unknown) {
    super(
      `${operation}: the signed-in attendee is not registered for this event. ` +
        "Register on the event site first; signing in again does not help.",
      403,
      operation,
      body,
    );
    this.name = "NotRegisteredError";
  }
}

/** The operation is closed for now. A 409, a valid request, try later. */
export class OperationClosedError extends EventsApiError {
  constructor(operation: string, body?: unknown) {
    super(`${operation}: the operation is currently closed. Retry later.`, 409, operation, body);
    this.name = "OperationClosedError";
  }
}

/** A 403 with no body: the edge refused this address, not the API. */
export class EdgeRefusalError extends EventsApiError {
  constructor(operation: string) {
    super(`${operation}: the edge refused this request. Slow down and retry.`, 403, operation);
    this.name = "EdgeRefusalError";
  }
}

interface TokenBucket {
  timestamps: number[];
  capacity: number;
}

export interface BatchOutcome {
  succeeded: string[];
  failed: Array<{ sessionId: string; reason?: string; detail?: unknown }>;
}

export interface BatchResult {
  outcome: BatchOutcome;
  /** Sessions the response named in neither list. */
  ambiguous: string[];
}

export interface ScheduleSnapshot {
  reservations: ReinventSession[];
  favorites: ReinventSession[];
  personalTime: PersonalTimeEntry[];
}

export interface EventSummary {
  eventId: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  authenticationRequired?: boolean;
  [key: string]: unknown;
}

export interface ClientOptions {
  eventId?: string;
  /** Read the bundled fixture instead of the network. Never presented as live. */
  fixture?: Catalog;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface RawSession {
  sessionId?: unknown;
  title?: unknown;
  abstract?: unknown;
  abbreviation?: unknown;
  code?: unknown;
  type?: unknown;
  level?: unknown;
  venue?: unknown;
  room?: unknown;
  sessionTime?: unknown;
  startDateTime?: unknown;
  endDateTime?: unknown;
  start?: unknown;
  end?: unknown;
  isAllDaySession?: unknown;
  allDay?: unknown;
  isReservable?: unknown;
  reservable?: unknown;
  features?: unknown;
  tracks?: unknown;
  topics?: unknown;
  services?: unknown;
  speakers?: unknown;
  recorded?: unknown;
  availability?: unknown;
  [key: string]: unknown;
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

function asSpeakerNames(value: unknown): string[] {
  if (!Array.isArray(value)) return asStringArray(value);
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && "name" in entry) {
        const name = (entry as { name?: unknown }).name;
        return typeof name === "string" ? name : null;
      }
      return null;
    })
    .filter((entry): entry is string => entry !== null);
}

function normaliseFullness(value: unknown): ReinventSession["availability"]["fullness"] {
  if (typeof value !== "string") return "unknown";
  const lowered = value.toLowerCase();
  if (lowered.includes("walk")) return "walk-up-up";
  if (lowered.includes("full") || lowered.includes("sold")) return "full";
  if (lowered.includes("fill") || lowered.includes("limited")) return "filling";
  if (lowered.includes("open") || lowered.includes("available")) return "open";
  return "unknown";
}

/**
 * Read a level the API writes as prose ("300 – Advanced").
 *
 * The catalog carries no bare number, so the numeric part is taken from the
 * leading digits and the rest is ignored.
 */
export function parseLevel(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const match = /^\s*(\d{3})/u.exec(value);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

function addMinutes(date: string, time: string, minutes: number): string {
  const [hoursText, minutesText] = time.split(":");
  const hours = Number(hoursText);
  const mins = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return `${date}T${time}:00`;
  const total = hours * 60 + mins + minutes;
  const nextHours = Math.floor(total / 60) % 24;
  const nextMinutes = total % 60;
  const pad = (value: number): string => (value < 10 ? `0${value}` : String(value));
  return `${date}T${pad(nextHours)}:${pad(nextMinutes)}:00`;
}

/**
 * Turn the catalog's `sessionTime` ({date, time, length}) into a start and end.
 *
 * The catalog gives a start and a duration in minutes, never an end, so the end
 * is computed here. An absent block yields empty strings rather than a crash.
 */
export function parseSessionTime(value: unknown): { start: string; end: string } {
  if (!value || typeof value !== "object") return { start: "", end: "" };
  const block = value as { date?: unknown; time?: unknown; length?: unknown };
  const date = typeof block.date === "string" ? block.date : "";
  const time = typeof block.time === "string" ? block.time : "";
  const length = Number(block.length);
  if (date.length === 0 || time.length === 0) return { start: "", end: "" };
  const start = `${date}T${time}:00`;
  const end = Number.isFinite(length) && length > 0 ? addMinutes(date, time, length) : start;
  return { start, end };
}

/**
 * Map the catalog's prose session type onto the shared format names.
 *
 * Checked against the live catalog: it writes "Chalk talk" and "Builders'
 * session" in lower case, and carries several types that are not talks at all
 * ("Event service", "Featured experience", "Expo", "Exam prep").
 */
export function normaliseType(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "Breakout";
  const lowered = value.toLowerCase();
  if (lowered.includes("workshop")) return "Workshop";
  if (lowered.includes("chalk talk")) return "Chalk Talk";
  if (lowered.includes("builder")) return "Builders' Session";
  if (lowered.includes("launch")) return "Launch Session";
  if (lowered.includes("code talk")) return "Code Talk";
  if (lowered.includes("lightning")) return "Lightning Talk";
  if (lowered.includes("bootcamp")) return "Bootcamp";
  if (lowered.includes("boot camp")) return "Bootcamp";
  if (lowered.includes("lab")) return "Lab";
  if (lowered.includes("mainstage")) return "Mainstage";
  if (lowered.includes("keynote")) return "Keynote";
  if (lowered.includes("breakout")) return "Breakout";
  return value;
}

/**
 * Types that are places, services or parties rather than talks.
 *
 * The live catalog lists "Lactation room", "Game Night" and "re:Play" in the
 * same array as the sessions, so scheduling by score alone would book a
 * nursing room and call it a talk.
 */
const NON_SESSION_TYPES = new Set([
  "featured experience",
  "event service",
  "expo",
  "exam prep",
  "gamified learning",
]);

export function isSessionLike(value: unknown): boolean {
  if (typeof value !== "string") return true;
  return !NON_SESSION_TYPES.has(value.trim().toLowerCase());
}

/**
 * Strip the vendor prefix the catalog puts on every service name.
 *
 * The live data says "Amazon DynamoDB" and "Amazon Elastic Container Service",
 * while a repository's manifest says "@aws-sdk/client-dynamodb". Matching the
 * bare name is what lets a gap find its session.
 */
export function normaliseServiceName(value: string): string {
  let name = value.trim();
  const prefixes = ["Amazon ", "AWS ", "Amazon Web Services "];
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
      break;
    }
  }
  const aliases: Record<string, string> = {
    "Simple Storage Service (S3)": "S3",
    "Elastic Compute Cloud (EC2)": "EC2",
    "Simple Queue Service (SQS)": "SQS",
    "Simple Notification Service (SNS)": "SNS",
    "Step Functions": "Step Functions",
    "Elastic Kubernetes Service": "EKS",
    "Elastic Container Service": "ECS",
    "Relational Database Service (RDS)": "RDS",
  };
  return aliases[value.trim()] ?? name;
}

/** Canonical venue spelling for the transit matrix. */export function normaliseVenueName(value: unknown): string {
  if (typeof value !== "string") return "";
  const lowered = value.toLowerCase();
  if (lowered.includes("venetian")) return "The Venetian";
  if (lowered.includes("wynn") || lowered.includes("encore")) return "Wynn | Encore";
  if (lowered.includes("caesars forum")) return "Caesars Forum";
  if (lowered.includes("caesars palace")) return "Caesars Palace";
  if (lowered.includes("mgm")) return "MGM Grand";
  if (lowered.includes("mandalay")) return "Mandalay Bay";
  return value;
}

/**
 * Project one raw API session onto the shared shape.
 *
 * Every field is optional in the real catalog, so each is read defensively: an
 * absent field becomes an empty list or an `unknown` availability rather than a
 * thrown error. The shape below was checked against 250 live sessions, which
 * use `sessionTime` rather than start/end and write the level as prose.
 */
export function normalizeSession(raw: RawSession): ReinventSession {
  const availabilityRaw =
    raw.availability && typeof raw.availability === "object"
      ? (raw.availability as Record<string, unknown>)
      : {};
  const level = parseLevel(raw.level);
  const explicitReservable =
    typeof raw.isReservable === "boolean"
      ? raw.isReservable
      : typeof raw.reservable === "boolean"
        ? raw.reservable
        : availabilityRaw["reservable"];
  const reservable = typeof explicitReservable === "boolean" ? explicitReservable : true;
  const fullness = normaliseFullness(
    availabilityRaw["fullness"] ?? availabilityRaw["status"] ?? raw.availability,
  );
  const timing = parseSessionTime(raw.sessionTime);
  const start = String(raw.startDateTime ?? raw.start ?? timing.start);
  const end = String(raw.endDateTime ?? raw.end ?? timing.end);
  const features = asStringArray(raw.features);
  // The live catalog reports no fullness at all; `isReservable` is the only
  // signal. A session that cannot be reserved is a walk-up, which is what the
  // planner routes to the favourite queue.
  const effectiveFullness: ReinventSession["availability"]["fullness"] =
    fullness !== "unknown" ? fullness : reservable ? "open" : "walk-up-up";
  const session: ReinventSession = {
    sessionId: String(raw.sessionId ?? ""),
    title: String(raw.title ?? ""),
    abstract: String(raw.abstract ?? ""),
    type: normaliseType(raw.type),
    level: (level ?? 200) as SessionLevel,
    venue: normaliseVenueName(raw.venue),
    start,
    end,
    availability: { reservable, fullness: effectiveFullness },
    tracks: asStringArray(raw.tracks ?? features),
    topics: asStringArray(raw.topics),
    services: asStringArray(raw.services).map(normaliseServiceName),
    speakers: asSpeakerNames(raw.speakers),
  };
  const code = raw.abbreviation ?? raw.code;
  if (typeof code === "string") session.code = code;
  if (typeof raw.room === "string") session.room = raw.room;
  const allDay = raw.isAllDaySession ?? raw.allDay;
  if (typeof allDay === "boolean") session.allDay = allDay;
  if (typeof raw.recorded === "boolean") session.recorded = raw.recorded;
  else if (features.some((feature) => /record/i.test(feature))) session.recorded = true;
  return session;
}

// The API accepts 1 to 10 session ids per request, and counts each SESSION
// against the quota, so a batch buys round trips and nothing else.
export const MAX_BATCH_SIZE = 10;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

export class AwsEventsClient {
  readonly eventId: string;
  private readonly fixture: Catalog | undefined;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(options: ClientOptions = {}) {
    this.eventId = options.eventId ?? DEFAULT_EVENT_ID;
    this.fixture = options.fixture;
    this.sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
  }

  get isFixture(): boolean {
    return this.fixture !== undefined;
  }

  private url(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(`${API_BASE}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private bucketFor(operation: string): TokenBucket {
    const existing = this.buckets.get(operation);
    if (existing) return existing;
    const created: TokenBucket = {
      timestamps: [],
      capacity: QUOTA_PER_MINUTE[operation] ?? 30,
    };
    this.buckets.set(operation, created);
    return created;
  }

  /** Wait, if needed, so `cost` units fit inside the operation's minute window. */
  private async spend(operation: string, cost: number): Promise<void> {
    for (;;) {
      const bucket = this.bucketFor(operation);
      const now = this.now();
      bucket.timestamps = bucket.timestamps.filter((stamp) => now - stamp < 60_000);
      if (bucket.timestamps.length + cost <= bucket.capacity) {
        for (let index = 0; index < cost; index += 1) bucket.timestamps.push(now);
        return;
      }
      const oldest = bucket.timestamps[0] ?? now;
      await this.sleep(Math.max(0, 60_000 - (now - oldest) + 50));
    }
  }

  private retryAfterMs(response: Response, attempt: number): number {
    const headerSeconds = Number(response.headers.get("retry-after"));
    if (Number.isFinite(headerSeconds) && headerSeconds > 0) {
      return Math.min(headerSeconds, MAX_RETRY_AFTER_SECONDS) * 1000;
    }
    return Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
  }

  /**
   * One HTTP call with the documented retry rules.
   *
   * A read is retried on 429, 500 and 503 with backoff. A write is not: the API
   * has no idempotency key, so an unknown write outcome must be reconciled from
   * `GetSchedule` by the caller instead of re-sent.
   */
  private async requestRaw(
    operation: string,
    url: string,
    init: RequestInit,
    cost = 1,
  ): Promise<unknown> {
    const method = (init.method ?? "GET").toUpperCase() as HttpMethod;
    const isRead = method === "GET";
    const maxAttempts = isRead ? 4 : 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await this.spend(operation, cost);
      let response: Response;
      try {
        response = await authorizedFetch(url, init);
      } catch (error) {
        lastError = error;
        if (!isRead) throw error;
        await this.sleep(Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt));
        continue;
      }

      const text = await response.text();
      let body: unknown = {};
      if (text.length > 0) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = { raw: text };
        }
      }

      if (response.ok) return body;

      if (response.status === 404) {
        throw new EventsApiError(`${operation}: not found`, 404, operation, body);
      }
      if (response.status === 403) {
        // A JSON body means the attendee is signed in but unregistered.
        // An empty body means the edge refused this address.
        if (text.trim().length === 0) throw new EdgeRefusalError(operation);
        throw new NotRegisteredError(operation, body);
      }
      if (response.status === 409) throw new OperationClosedError(operation, body);
      if (response.status === 401) {
        // authorizedFetch already refreshed once; reaching here means the
        // refresh token is dead.
        throw new EventsApiError(`${operation}: sign in again`, 401, operation, body);
      }
      if (response.status === 429) {
        lastError = new EventsApiError(`${operation}: throttled`, 429, operation, body);
        if (!isRead) throw lastError;
        await this.sleep(this.retryAfterMs(response, attempt));
        continue;
      }
      if (response.status >= 500) {
        const fault = new EventsApiError(
          isRead
            ? `${operation}: server fault`
            : `${operation}: server fault on a write; reconcile from GetSchedule before retrying`,
          response.status,
          operation,
          body,
        );
        lastError = fault;
        if (!isRead) throw fault;
        await this.sleep(this.retryAfterMs(response, attempt));
        continue;
      }
      throw new EventsApiError(
        `${operation}: HTTP ${response.status}`,
        response.status,
        operation,
        body,
      );
    }

    if (lastError instanceof Error) throw lastError;
    throw new EventsApiError(`${operation}: exhausted retries`, 0, operation);
  }

  private async read<T>(operation: string, url: string, cost = 1): Promise<T> {
    return (await this.requestRaw(operation, url, {}, cost)) as T;
  }

  private async write<T>(
    operation: string,
    url: string,
    body: unknown,
    method: "POST" | "PUT" | "DELETE",
    cost = 1,
  ): Promise<T> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    return (await this.requestRaw(operation, url, init, cost)) as T;
  }

  // ---- Operations -------------------------------------------------------

  async listEvents(includePast = false): Promise<EventSummary[]> {
    if (this.fixture) {
      return [
        { eventId: this.fixture.eventId, name: "re:Invent 2026 (fixture)", authenticationRequired: true },
      ];
    }
    const body = await this.read<{ items?: EventSummary[] }>(
      "ListEvents",
      this.url("/events", { includePast }),
    );
    return Array.isArray(body.items) ? body.items : [];
  }

  async getEvent(eventId: string = this.eventId): Promise<EventSummary> {
    if (this.fixture) {
      return { eventId: this.fixture.eventId, name: "re:Invent 2026 (fixture)" };
    }
    return this.read<EventSummary>("GetEvent", this.url(`/events/${eventId}`));
  }

  /**
   * Walk every page until `nextToken` is ABSENT.
   *
   * A short page is not the end: page sizes vary, so stopping early silently
   * loses sessions.
   */
  async listSessions(
    options: {
      includeAbstracts?: boolean;
      locale?: string;
      eventId?: string;
      maxPages?: number;
    } = {},
  ): Promise<Catalog> {
    const eventId = options.eventId ?? this.eventId;
    if (this.fixture) {
      const sessions =
        options.includeAbstracts === false
          ? this.fixture.sessions.map((session) => ({ ...session, abstract: "" }))
          : this.fixture.sessions;
      return {
        eventId: this.fixture.eventId,
        fetchedAt: this.fixture.fetchedAt,
        source: "fixture",
        sessions,
      };
    }

    const collected: ReinventSession[] = [];
    const maxPages = options.maxPages ?? Number.POSITIVE_INFINITY;
    let nextToken: string | undefined;
    let pages = 0;

    do {
      const body = await this.read<{ items?: RawSession[]; nextToken?: string }>(
        "ListSessions",
        this.url(`/events/${eventId}/sessions`, {
          nextToken,
          includeAbstracts: options.includeAbstracts,
          locale: options.locale,
        }),
      );
      for (const raw of Array.isArray(body.items) ? body.items : []) {
        // The catalog mixes real talks with rooms, parties and exams. Keeping
        // those would let the planner book a lactation room as a session.
        if (!isSessionLike(raw.type)) continue;
        const session = normalizeSession(raw);
        if (session.start.length === 0) continue;
        collected.push(session);
      }
      nextToken =
        typeof body.nextToken === "string" && body.nextToken.length > 0 ? body.nextToken : undefined;
      pages += 1;
    } while (nextToken !== undefined && pages < maxPages);

    return {
      eventId,
      fetchedAt: new Date(this.now()).toISOString(),
      source: "live",
      sessions: collected,
    };
  }

  async getSession(sessionId: string, eventId: string = this.eventId): Promise<ReinventSession> {
    if (this.fixture) {
      const found = this.fixture.sessions.find((session) => session.sessionId === sessionId);
      if (!found) {
        throw new EventsApiError(`GetSession: ${sessionId} not found`, 404, "GetSession");
      }
      return found;
    }
    const raw = await this.read<RawSession>(
      "GetSession",
      this.url(`/events/${eventId}/sessions/${encodeURIComponent(sessionId)}`),
    );
    return normalizeSession(raw);
  }

  /**
   * Read the caller's own schedule.
   *
   * The live response wraps everything in `schedule` and names the reserved
   * list `reserved`, not `reservations`. The earlier reader looked at the top
   * level, which silently reported an empty schedule for an account that had
   * favourites — the exact trap the docs warn about.
   */
  async getSchedule(eventId: string = this.eventId): Promise<ScheduleSnapshot> {
    if (this.fixture) {
      return { reservations: [], favorites: [], personalTime: [] };
    }
    const body = await this.read<Record<string, unknown>>(
      "GetSchedule",
      this.url(`/events/${eventId}/schedule`),
    );
    const schedule = (body["schedule"] ?? body) as Record<string, unknown>;
    // The reserved and favourite lists hold bare session ids, so each entry is
    // a string, not an object.
    const readIds = (value: unknown): ReinventSession[] => {
      if (!Array.isArray(value)) return [];
      return value.map((entry) =>
        entry && typeof entry === "object"
          ? normalizeSession(entry as RawSession)
          : normalizeSession({ sessionId: String(entry) }),
      );
    };
    return {
      reservations: readIds(
        schedule["reserved"] ?? schedule["reservations"] ?? schedule["reservedSessions"],
      ),
      favorites: readIds(schedule["favorites"]),
      personalTime: Array.isArray(schedule["personalTime"])
        ? (schedule["personalTime"] as PersonalTimeEntry[])
        : [],
    };
  }

  /**
   * Read a `BulkResult`, which is what both bulk writes return.
   *
   * The real response wraps everything in `result`, succeeds under `successful`,
   * and reports a refusal as `{sessionId, code, conflictsWith?}`. A `200` still
   * does not mean every session succeeded.
   */
  private parseBatch(body: unknown, requested: string[]): BatchResult {
    const outer = (body ?? {}) as Record<string, unknown>;
    const record = (outer["result"] ?? outer) as Record<string, unknown>;
    const succeeded: string[] = [];
    const failed: BatchOutcome["failed"] = [];

    const readIds = (value: unknown): string[] =>
      Array.isArray(value)
        ? value
            .map((entry) => {
              if (typeof entry === "string") return entry;
              if (entry && typeof entry === "object") {
                const id = (entry as { sessionId?: unknown }).sessionId;
                return typeof id === "string" ? id : null;
              }
              return null;
            })
            .filter((entry): entry is string => entry !== null)
        : [];

    succeeded.push(
      ...readIds(record["successful"] ?? record["succeeded"] ?? record["succeededSessionIds"]),
    );

    const failures = record["failed"] ?? record["failures"] ?? record["failedSessions"];
    if (Array.isArray(failures)) {
      for (const entry of failures) {
        if (typeof entry === "string") {
          failed.push({ sessionId: entry });
          continue;
        }
        if (!entry || typeof entry !== "object") continue;
        const item = entry as Record<string, unknown>;
        const id = item["sessionId"];
        if (typeof id !== "string") continue;
        const failure: BatchOutcome["failed"][number] = { sessionId: id };
        const reason = item["code"] ?? item["reason"] ?? item["status"];
        if (typeof reason === "string") failure.reason = reason;
        const conflicts = item["conflictsWith"];
        if (Array.isArray(conflicts) && conflicts.length > 0) {
          failure.detail = { conflictsWith: conflicts };
        } else if (item["detail"] !== undefined) {
          failure.detail = item["detail"];
        }
        failed.push(failure);
      }
    }

    const accounted = new Set([...succeeded, ...failed.map((entry) => entry.sessionId)]);
    return {
      outcome: { succeeded, failed },
      ambiguous: requested.filter((id) => !accounted.has(id)),
    };
  }

  async reserveSessions(sessionIds: string[], eventId: string = this.eventId): Promise<BatchResult> {
    if (sessionIds.length === 0) return { outcome: { succeeded: [], failed: [] }, ambiguous: [] };
    if (this.fixture) {
      const succeeded: string[] = [];
      const failed: BatchOutcome["failed"] = [];
      for (const id of sessionIds) {
        const session = this.fixture.sessions.find((entry) => entry.sessionId === id);
        if (!session) failed.push({ sessionId: id, reason: "not_found" });
        else if (!session.availability.reservable || session.availability.fullness === "full") {
          failed.push({ sessionId: id, reason: "full" });
        } else succeeded.push(id);
      }
      return { outcome: { succeeded, failed }, ambiguous: [] };
    }
    // A longer list is sent in batches of ten, the API's per-request maximum,
    // and the outcomes are merged.
    const succeeded: string[] = [];
    const failed: BatchOutcome["failed"] = [];
    const ambiguous: string[] = [];
    for (const batch of chunks(sessionIds, MAX_BATCH_SIZE)) {
      const body = await this.write<unknown>(
        "ReserveSessions",
        this.url(`/events/${eventId}/reservations`),
        { sessionIds: batch },
        "POST",
        batch.length,
      );
      const part = this.parseBatch(body, batch);
      succeeded.push(...part.outcome.succeeded);
      failed.push(...part.outcome.failed);
      ambiguous.push(...part.ambiguous);
    }
    return { outcome: { succeeded, failed }, ambiguous };
  }

  /**
   * Reserve, then confirm from `GetSchedule`.
   *
   * The API has no idempotency key and a `200` does not mean every session
   * succeeded, so nothing may be cancelled before this confirms what is held.
   */
  async reserveThenVerify(
    sessionIds: string[],
    eventId: string = this.eventId,
  ): Promise<{ held: string[]; missing: string[]; result: BatchResult }> {
    const result = await this.reserveSessions(sessionIds, eventId);
    const snapshot = await this.getSchedule(eventId);
    const held = snapshot.reservations
      .map((session) => session.sessionId)
      .filter((id) => sessionIds.includes(id));
    return { held, missing: sessionIds.filter((id) => !held.includes(id)), result };
  }

  async cancelReservation(sessionId: string, eventId: string = this.eventId): Promise<void> {
    if (this.fixture) return;
    try {
      await this.write<unknown>(
        "CancelReservation",
        this.url(`/events/${eventId}/reservations/${encodeURIComponent(sessionId)}`),
        undefined,
        "DELETE",
      );
    } catch (error) {
      // Cancelling something already gone is a 404, which is the success case
      // for a retry whose response was never seen.
      if (error instanceof EventsApiError && error.status === 404) return;
      throw error;
    }
  }

  async associateFavorites(
    sessionIds: string[],
    eventId: string = this.eventId,
  ): Promise<BatchResult> {
    if (sessionIds.length === 0) return { outcome: { succeeded: [], failed: [] }, ambiguous: [] };
    if (this.fixture) return { outcome: { succeeded: sessionIds, failed: [] }, ambiguous: [] };
    const succeeded: string[] = [];
    const failed: BatchOutcome["failed"] = [];
    const ambiguous: string[] = [];
    for (const batch of chunks(sessionIds, MAX_BATCH_SIZE)) {
      const body = await this.write<unknown>(
        "AssociateFavorites",
        this.url(`/events/${eventId}/favorites`),
        { sessionIds: batch },
        "POST",
        batch.length,
      );
      const part = this.parseBatch(body, batch);
      succeeded.push(...part.outcome.succeeded);
      failed.push(...part.outcome.failed);
      ambiguous.push(...part.ambiguous);
    }
    return { outcome: { succeeded, failed }, ambiguous };
  }

  async disassociateFavorite(sessionId: string, eventId: string = this.eventId): Promise<void> {
    if (this.fixture) return;
    try {
      await this.write<unknown>(
        "DisassociateFavorite",
        this.url(`/events/${eventId}/favorites/${encodeURIComponent(sessionId)}`),
        undefined,
        "DELETE",
      );
    } catch (error) {
      if (error instanceof EventsApiError && error.status === 404) return;
      throw error;
    }
  }

  async createPersonalTime(
    input: Omit<PersonalTimeEntry, "personalTimeId">,
    eventId: string = this.eventId,
  ): Promise<void> {
    if (this.fixture) return;
    // Create returns 204 with no body; the caller reads GetSchedule for the new
    // id. Re-sending after an unknown outcome would add a second entry.
    await this.write<unknown>(
      "CreatePersonalTime",
      this.url(`/events/${eventId}/personal-time`),
      input,
      "POST",
    );
  }

  async updatePersonalTime(
    personalTimeId: string,
    input: Omit<PersonalTimeEntry, "personalTimeId">,
    eventId: string = this.eventId,
  ): Promise<void> {
    if (this.fixture) return;
    // PUT is a full replacement: an omitted optional field is cleared.
    await this.write<unknown>(
      "UpdatePersonalTime",
      this.url(`/events/${eventId}/personal-time/${encodeURIComponent(personalTimeId)}`),
      input,
      "PUT",
    );
  }

  async deletePersonalTime(
    personalTimeId: string,
    eventId: string = this.eventId,
  ): Promise<void> {
    if (this.fixture) return;
    try {
      await this.write<unknown>(
        "DeletePersonalTime",
        this.url(`/events/${eventId}/personal-time/${encodeURIComponent(personalTimeId)}`),
        undefined,
        "DELETE",
      );
    } catch (error) {
      if (error instanceof EventsApiError && error.status === 404) return;
      throw error;
    }
  }

  /** Probe the operations the CLI's `audit` command reports on. */
  async audit(): Promise<ApiAuditReport> {
    const operations: ApiAuditReport["operations"] = [];
    const isFixture = this.isFixture;
    let signedIn = true;
    let registered = true;
    const notes: string[] = [];

    if (this.fixture) {
      operations.push({ name: "fixture", ok: true, detail: "fixture catalog, not live data" });
      return {
        eventId: this.eventId,
        source: "fixture",
        operations,
        signedIn: false,
        registered: false,
        notes: ["Running against the bundled fixture. Nothing here proves live access."],
      };
    }

    operations.push({ name: "ListEvents", ok: await this.probe(() => this.listEvents()) });

    const eventOk = await this.probe(() => this.getEvent());
    operations.push({ name: "GetEvent", ok: eventOk });

    const catalogProbe = await this.probeDetail(() => this.listSessions({ maxPages: 1 }));
    operations.push({
      name: "ListSessions",
      ok: catalogProbe.ok,
      ...(catalogProbe.detail === undefined ? {} : { detail: catalogProbe.detail }),
    });
    if (!catalogProbe.ok && catalogProbe.detail?.includes("not registered")) {
      registered = false;
      notes.push("This account is signed in but not registered for the event.");
    }
    if (!catalogProbe.ok && catalogProbe.detail?.includes("sign in")) signedIn = false;

    const scheduleProbe = await this.probeDetail(() => this.getSchedule());
    operations.push({
      name: "GetSchedule",
      ok: scheduleProbe.ok,
      ...(scheduleProbe.detail === undefined ? {} : { detail: scheduleProbe.detail }),
    });

    return {
      eventId: this.eventId,
      source: "live",
      operations,
      signedIn,
      registered,
      notes,
    };
  }

  private async probe(run: () => Promise<unknown>): Promise<boolean> {
    return (await this.probeDetail(run)).ok;
  }

  private async probeDetail(
    run: () => Promise<unknown>,
  ): Promise<{ ok: boolean; detail?: string }> {
    try {
      await run();
      return { ok: true };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      return { ok: false, detail };
    }
  }
}

import type {
  ArchitecturalGap,
  Catalog,
  PersonalTimeEntry,
  PlannedDay,
  PrescriptionPlan,
  RemediationPlan,
  RemediationTicket,
  ReinventSession,
  ScheduleItem,
  SchedulePlan,
  ScoredSession,
  SessionLevel,
  StackFingerprint,
  TravelCheck,
} from "../types";
import { VenueTransit } from "./transit-guard";

const INTERACTIVE_FORMATS = new Set(["Chalk Talk", "Builders' Session", "Workshop", "Code Talk", "Lab"]);

const SYNTHESIS_TITLE = "Repo Architecture Synthesis";
const SYNTHESIS_MINUTES = 30;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function haversineServiceOverlap(session: ReinventSession, services: string[]): number {
  const wanted = new Set(services.map(normalize));
  return session.services.filter((service) => wanted.has(normalize(service))).length;
}

function topicOverlap(session: ReinventSession, topics: string[]): number {
  const wanted = new Set(topics.map(normalize));
  return session.topics.filter((topic) => wanted.has(normalize(topic))).length;
}

function levelAffinity(session: ReinventSession, recommended: number): number {
  const level = Number(session.level);
  if (!Number.isFinite(level)) return 0;
  const distance = Math.abs(level - recommended);
  if (distance === 0) return 3;
  if (distance <= 100) return 2;
  if (distance <= 200) return 1;
  return 0;
}

function isInteractive(session: ReinventSession): boolean {
  return INTERACTIVE_FORMATS.has(session.type);
}

function isRecordedLecture(session: ReinventSession): boolean {
  return session.recorded === true && !isInteractive(session);
}

function startsOf(session: ReinventSession): number {
  const stamp = Date.parse(session.start);
  return Number.isFinite(stamp) ? stamp : Number.POSITIVE_INFINITY;
}

/**
 * Score one catalog session against the fingerprint and its diagnosed gaps.
 *
 * The level term is the interesting one: a 200 talk on a topic you already use
 * daily is worth less than a 400 on something the repo is missing.
 */
export function scoreSession(
  session: ReinventSession,
  fingerprint: StackFingerprint,
  gaps: ArchitecturalGap[],
): ScoredSession {
  const reasons: string[] = [];
  let score = 0;

  const matchedGaps = gaps.filter(
    (gap) =>
      topicOverlap(session, gap.searchTopics) > 0 ||
      haversineServiceOverlap(session, gap.taggedServices) > 0,
  );
  for (const gap of matchedGaps) {
    const weight = gap.severity === "high" ? 30 : gap.severity === "medium" ? 18 : 8;
    score += weight;
    reasons.push(`addresses ${gap.id} (${gap.severity})`);
  }

  const serviceHits = haversineServiceOverlap(
    session,
    fingerprint.services.map((service) => service.service),
  );
  if (serviceHits > 0) {
    score += serviceHits * 6;
    reasons.push(`uses ${serviceHits} service${serviceHits === 1 ? "" : "s"} the repo already runs`);
  }

  const topicHits = topicOverlap(session, fingerprint.frameworks);
  if (topicHits > 0) {
    score += topicHits * 4;
    reasons.push(`overlaps ${topicHits} framework the repo uses`);
  }

  const affinity = levelAffinity(session, fingerprint.recommendedLevel);
  if (affinity > 0) {
    score += affinity * 4;
    reasons.push(`level ${String(session.level)} suits a ${fingerprint.recommendedLevel} recommendation`);
  } else if (Number(session.level) < fingerprint.recommendedLevel - 100) {
    score -= 12;
    reasons.push("likely too introductory for this stack");
  }

  if (isInteractive(session) && session.availability.reservable) {
    score += 8;
    reasons.push("hands-on and reservable");
  }
  if (!session.availability.reservable) {
    // A walk-up has no guaranteed seat, so it is worth less than a room you can
    // hold. It still gets planned, but a reservable alternative wins a tie.
    score -= 10;
    reasons.push("no reservable seat, walk-up only");
  }

  return { session, score, matchedGaps: matchedGaps.map((gap) => gap.id), reasons };
}

interface BusySlot {
  start: number;
  end: number;
}

function toMinutes(iso: string): number {
  const stamp = Date.parse(iso);
  return Number.isFinite(stamp) ? stamp : 0;
}

function overlaps(slot: BusySlot, start: string, end: string): boolean {
  const startStamp = toMinutes(start);
  const endStamp = toMinutes(end);
  return startStamp < slot.end && endStamp > slot.start;
}

/**
 * Pick what the plan does with a session.
 *
 * `isReservable` is authoritative in the live catalog and applies to every
 * format, not only the interactive ones: a lecture that cannot be reserved must
 * never be planned as a reservation. Unreservable talks go to the walk-up
 * queue; a recording goes to the watchlist instead, because watching it later
 * beats crossing the Strip.
 */
function actionFor(session: ReinventSession): ScheduleItem["action"] {
  const full = session.availability.fullness === "full";
  if (!session.availability.reservable) {
    return isRecordedLecture(session) ? "favorite-watchlist" : "favorite-walk-up";
  }
  if (isInteractive(session) && full) return "favorite-walk-up";
  if (isRecordedLecture(session)) return "favorite-watchlist";
  return "reserve";
}

function noteFor(action: ScheduleItem["action"]): string | undefined {
  if (action === "favorite-walk-up") return "Seats were not reservable; held in the walk-up queue instead.";
  if (action === "favorite-watchlist") return "Recorded; watching the recording beats crossing the Strip.";
  return undefined;
}

function buildItem(session: ReinventSession, action: ScheduleItem["action"], gaps: string[]): ScheduleItem {
  const item: ScheduleItem = {
    action,
    sessionId: session.sessionId,
    title: session.title,
    start: session.start,
    end: session.end,
    venue: session.venue,
    gaps,
  };
  const level = Number(session.level);
  if (Number.isFinite(level)) item.level = level as SessionLevel;
  const note = noteFor(action);
  if (note !== undefined) item.note = note;
  return item;
}

/**
 * Build a week that can actually be walked.
 *
 * Greedy by score, but every candidate must clear the travel check against the
 * previous item, which is what keeps the 10-minute forfeiture rule honest.
 */
export function buildPlan(
  catalog: Catalog,
  fingerprint: StackFingerprint,
  gaps: ArchitecturalGap[],
  options: {
    existingPersonalTime?: PersonalTimeEntry[];
    transit?: VenueTransit;
    synthesisPerDay?: boolean;
  } = {},
): SchedulePlan {
  const transit = options.transit ?? VenueTransit.load();
  const scored = catalog.sessions
    .map((session) => scoreSession(session, fingerprint, gaps))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return startsOf(left.session) - startsOf(right.session);
    });

  const personalTime = [...(options.existingPersonalTime ?? [])];
  const anchored: BusySlot[] = personalTime.map((entry) => ({
    start: toMinutes(entry.startDateTime),
    end: toMinutes(entry.endDateTime),
  }));

  const byDate = new Map<string, ReinventSession[]>();
  for (const entry of scored) {
    const date = entry.session.start.slice(0, 10);
    const list = byDate.get(date) ?? [];
    list.push(entry.session);
    byDate.set(date, list);
  }

  const days: PlannedDay[] = [];
  const warnings: string[] = [];
  // A repeated session is a re-run: attending the same talk twice is wasted
  // time. The live catalog lists 488 titles more than once under different
  // session ids, so the de-duplication key is the title, not the id.
  const alreadyPlanned = new Set<string>();
  const dedupeKey = (session: ReinventSession): string =>
    `${session.title.trim().toLowerCase()}|${session.type.toLowerCase()}`;

  for (const date of [...byDate.keys()].sort()) {
    const taken: BusySlot[] = [...anchored];
    const items: ScheduleItem[] = [];
    const daySessions = (byDate.get(date) ?? []).slice();

    for (const session of daySessions) {
      const start = session.start;
      const end = session.end;
      if (!start || !end) continue;
      if (alreadyPlanned.has(dedupeKey(session))) continue;
      const conflicting = taken.some((slot) => overlaps(slot, start, end));
      if (conflicting) continue;

      const startStamp = toMinutes(start);
      const endStamp = toMinutes(end);

      // Compare against the neighbours in TIME, not against the last item
      // inserted: score order and clock order differ, and comparing against a
      // session that actually starts later is what produced negative gaps.
      const before = items
        .filter((item) => toMinutes(item.end) <= startStamp)
        .sort((left, right) => toMinutes(right.end) - toMinutes(left.end))[0];
      const after = items
        .filter((item) => toMinutes(item.start) >= endStamp)
        .sort((left, right) => toMinutes(left.start) - toMinutes(right.start))[0];

      if (before) {
        const check = transit.checkTravel(
          { title: before.title, venue: before.venue, end: before.end },
          { title: session.title, venue: session.venue, start },
        );
        if (check.forfeitureRisk) {
          warnings.push(
            `Dropped "${session.title}": ${check.gapMinutes} min after "${before.title}" but ${check.requiredMinutes} needed (${check.leg.minutes} min ${check.leg.mode} + 10 min rule).`,
          );
          continue;
        }
      }
      if (after) {
        const check = transit.checkTravel(
          { title: session.title, venue: session.venue, end },
          { title: after.title, venue: after.venue, start: after.start },
        );
        if (check.forfeitureRisk) {
          warnings.push(
            `Dropped "${session.title}": it would leave only ${check.gapMinutes} min before "${after.title}", which needs ${check.requiredMinutes}.`,
          );
          continue;
        }
      }

      const scoredEntry = scored.find((entry) => entry.session.sessionId === session.sessionId);
      const action = actionFor(session);
      items.push(buildItem(session, action, scoredEntry?.matchedGaps ?? []));
      alreadyPlanned.add(dedupeKey(session));
      taken.push({ start: toMinutes(start), end: toMinutes(end) });
    }

    if (options.synthesisPerDay !== false) {
      const slot = findSynthesisSlot(items, taken, date, transit, "The Venetian");
      if (slot !== null) {
        items.push({
          action: "personal-time",
          title: SYNTHESIS_TITLE,
          start: slot.start,
          end: slot.end,
          venue: "The Venetian",
          gaps: [],
          note: "Thirty minutes a day to turn what you heard into work the repo can hold.",
        });
        taken.push({ start: toMinutes(slot.start), end: toMinutes(slot.end) });
        personalTime.push({
          personalTimeId: `pending-${date}-synthesis`,
          title: SYNTHESIS_TITLE,
          description: "Turn the day's sessions into tickets and follow-ups.",
          startDateTime: slot.start,
          endDateTime: slot.end,
          location: "The Venetian",
        });
      }
    }

    items.sort((left, right) => toMinutes(left.start) - toMinutes(right.start));
    const transitChecks: TravelCheck[] = [];
    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1];
      const current = items[index];
      if (!previous || !current) continue;
      transitChecks.push(
        transit.checkTravel(
          { title: previous.title, venue: previous.venue, end: previous.end },
          { title: current.title, venue: current.venue, start: current.start },
        ),
      );
    }

    days.push({ date, items, transit: transitChecks });
  }

  return {
    eventId: catalog.eventId,
    repo: fingerprint.repo,
    fingerprint,
    gaps,
    days,
    personalTime,
    warnings,
  };
}

function localStamp(date: string, hours: number, minutes: number): string {
  const hh = hours < 10 ? `0${hours}` : String(hours);
  const mm = minutes < 10 ? `0${minutes}` : String(minutes);
  return `${date}T${hh}:${mm}:00`;
}

function addMinutesToStamp(stamp: string, minutes: number): string {
  const base = toMinutes(stamp);
  const next = new Date(base + minutes * 60_000);
  const pad = (value: number): string => (value < 10 ? `0${value}` : String(value));
  return (
    `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}` +
    `T${pad(next.getHours())}:${pad(next.getMinutes())}:00`
  );
}

/**
 * Find a 30-minute block that touches nothing and clears the same travel rule
 * every session does.
 *
 * A room that is free is not enough: a block placed flush against a session in
 * another venue is a transfer nobody can make, so the neighbours are checked
 * with the ten-minute rule exactly as a session would be.
 */
function findSynthesisSlot(
  items: ScheduleItem[],
  taken: BusySlot[],
  date: string,
  transit: VenueTransit,
  homeVenue: string,
): { start: string; end: string } | null {
  const preferred: Array<[number, number]> = [
    [12, 0],
    [16, 0],
    [15, 30],
    [17, 0],
    [11, 0],
    [18, 0],
    [9, 0],
    [13, 0],
  ];
  for (const [hour, minute] of preferred) {
    const start = localStamp(date, hour, minute);
    const end = addMinutesToStamp(start, SYNTHESIS_MINUTES);
    if (taken.some((slot) => overlaps(slot, start, end))) continue;
    if (items.some((item) => overlaps({ start: toMinutes(item.start), end: toMinutes(item.end) }, start, end))) {
      continue;
    }
    const before = items
      .filter((item) => toMinutes(item.end) <= toMinutes(start))
      .sort((left, right) => toMinutes(right.end) - toMinutes(left.end))[0];
    const after = items
      .filter((item) => toMinutes(item.start) >= toMinutes(end))
      .sort((left, right) => toMinutes(left.start) - toMinutes(right.start))[0];
    if (before) {
      const check = transit.checkTravel(
        { title: before.title, venue: before.venue, end: before.end },
        { title: "synthesis", venue: homeVenue, start },
      );
      if (check.forfeitureRisk) continue;
    }
    if (after) {
      const check = transit.checkTravel(
        { title: "synthesis", venue: homeVenue, end },
        { title: after.title, venue: after.venue, start: after.start },
      );
      if (check.forfeitureRisk) continue;
    }
    return { start, end };
  }
  return null;
}

function effortFor(gap: ArchitecturalGap): RemediationTicket["effort"] {
  if (gap.severity === "high" && gap.evidence.length >= 2) return "M";
  if (gap.severity === "high") return "S";
  if (gap.severity === "medium") return "M";
  return "L";
}

const ACCEPTANCE_BY_GAP: Record<string, { test: string; links: string[] }> = {
  "agent-without-orchestration": {
    test:
      "One agent run that fails at step three resumes from step three, and the failed run leaves a durable record you can query by run id.",
    links: [
      "https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html",
      "https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html",
    ],
  },
  "dynamodb-without-resilience": {
    test:
      "A write that fails downstream is captured by a Streams consumer or a dead-letter queue, and a test proves the message is retried and then parked, not lost.",
    links: [
      "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html",
      "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.html",
    ],
  },
  "compute-without-observability": {
    test:
      "One request appears as a single end-to-end trace spanning every service it touches, visible in your trace backend, with no manual correlation ids.",
    links: [
      "https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html",
      "https://opentelemetry.io/docs/",
    ],
  },
  "no-queue-isolation": {
    test:
      "Stopping one downstream consumer for five minutes leaves the rest of the system serving, and the backlog drains when it returns.",
    links: [
      "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html",
      "https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html",
    ],
  },
  "public-api-without-waf": {
    test:
      "A burst of traffic above a declared rate is throttled, verified by a scripted load test rather than by inspection.",
    links: [
      "https://docs.aws.amazon.com/waf/latest/developerguide/what-is-aws-waf.html",
      "https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html",
    ],
  },
  "wildcard-iam": {
    test:
      'Every policy in the repository passes a check for a wildcard action, and each remaining allow rule names the exact action and resource it needs.',
    links: ["https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html"],
  },
};

/**
 * Turn each gap into a ticket someone can actually pick up.
 *
 * The acceptance test is the point of the whole tool: a gap that cannot be
 * stated as a passing test is a gap nobody will close.
 */
export function buildRemediation(
  gaps: ArchitecturalGap[],
  plannedSessionsByGap: Map<string, string[]> = new Map(),
): RemediationPlan {
  const severityByGap: Record<string, "high" | "medium" | "low"> = {};
  const tickets: RemediationTicket[] = gaps.map((gap, index) => {
    severityByGap[gap.id] = gap.severity;
    const acceptance = ACCEPTANCE_BY_GAP[gap.id] ?? {
      test: `A reviewer can point at a commit that removes the condition "${gap.title}", and a test asserts it stays removed.`,
      links: [],
    };
    const ticket: RemediationTicket = {
      id: `RI-${String(index + 1).padStart(2, "0")}`,
      gapId: gap.id,
      title: gap.title,
      why: gap.why,
      effort: effortFor(gap),
      acceptanceTest: acceptance.test,
      sessionIds: plannedSessionsByGap.get(gap.id) ?? [],
      docLinks: acceptance.links,
      taggedServices: gap.taggedServices,
    };
    return ticket;
  });

  return { tickets, generatedAt: new Date().toISOString(), severityByGap };
}

/** Session ids grouped by the gap they address, for `buildRemediation`. */
export function groupSessionsByGap(plan: SchedulePlan): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const day of plan.days) {
    for (const item of day.items) {
      if (item.sessionId === undefined) continue;
      for (const gapId of item.gaps) {
        const list = grouped.get(gapId) ?? [];
        list.push(item.sessionId);
        grouped.set(gapId, list);
      }
    }
  }
  return grouped;
}

export function prescribe(
  catalog: Catalog,
  fingerprint: StackFingerprint,
  gaps: ArchitecturalGap[],
  options: Parameters<typeof buildPlan>[3] = {},
): PrescriptionPlan {
  const schedule = buildPlan(catalog, fingerprint, gaps, options);
  const remediation = buildRemediation(gaps, groupSessionsByGap(schedule));
  return { fingerprint, gaps, schedule, remediation };
}

import {
  getValidTokens,
  loadTokens,
  signIn,
  signOut,
} from "./auth/pkce";
import {
  AwsEventsClient,
  type EventSummary,
  type ScheduleSnapshot,
} from "./api/events-client";
import { servedCatalog } from "./catalog-cache";
import type { PersonalTimeEntry } from "./types";
import { loadConfig } from "./config";

export interface SessionStatus {
  signedIn: boolean;
  expiresInSeconds?: number;
  eventId: string;
}

export interface MySchedule {
  favorites: Array<Record<string, unknown>>;
  reservations: Array<Record<string, unknown>>;
  personalTime: Array<Record<string, unknown>>;
  counts: { favorites: number; reservations: number; personalTime: number };
}

export class NotSignedInError extends Error {
  constructor() {
    super("not signed in");
    this.name = "NotSignedInError";
  }
}

export async function sessionStatus(): Promise<SessionStatus> {
  const config = loadConfig();
  const tokens = await loadTokens();
  if (tokens === null) return { signedIn: false, eventId: config.eventId };
  const remaining = Math.max(0, Math.round((tokens.expiresAt - Date.now()) / 1000));
  return { signedIn: true, expiresInSeconds: remaining, eventId: config.eventId };
}

export async function startSignIn(): Promise<{ authorizeUrl: string }> {
  await signIn({});
  return { authorizeUrl: "" };
}

export async function endSignIn(): Promise<void> {
  await signOut();
}

export async function listAllEvents(): Promise<{
  current: EventSummary;
  events: EventSummary[];
}> {
  const config = loadConfig();
  const client = new AwsEventsClient({ eventId: config.eventId });
  try {
    const [events, current] = await Promise.all([
      client.listEvents(false),
      client.getEvent(config.eventId),
    ]);
    return { current, events };
  } catch {
    return {
      current: {
        eventId: config.eventId,
        name: "AWS re:Invent 2026",
        startDate: "2026-11-30",
        endDate: "2026-12-04",
        timezone: "America/Los_Angeles",
        city: "Las Vegas, NV",
      },
      events: [
        {
          eventId: config.eventId,
          name: "AWS re:Invent 2026",
          startDate: "2026-11-30",
          endDate: "2026-12-04",
          timezone: "America/Los_Angeles",
          city: "Las Vegas, NV",
        },
      ],
    };
  }
}

export async function mySchedule(): Promise<MySchedule> {
  const config = loadConfig();
  await getValidTokens();
  const client = new AwsEventsClient({ eventId: config.eventId });
  const snapshot: ScheduleSnapshot = await client.getSchedule();

  const catalog = new Map<string, Record<string, unknown>>();
  try {
    const sessions = await servedCatalog();
    for (const session of sessions.sessions) {
      catalog.set(session.sessionId, {
        sessionId: session.sessionId,
        title: session.title,
        type: session.type,
        level: session.level,
        venue: session.venue,
        room: session.room ?? null,
        start: session.start,
        end: session.end,
        code: session.code ?? null,
      });
    }
  } catch {
    // Schedule is still returned if catalog decoration fails
  }

  const decorate = (entries: Array<{ sessionId: string }>): Array<Record<string, unknown>> =>
    entries.map((entry) => ({
      sessionId: entry.sessionId,
      ...(catalog.get(entry.sessionId) ?? { title: null }),
    }));

  return {
    favorites: decorate(snapshot.favorites),
    reservations: decorate(snapshot.reservations),
    personalTime: snapshot.personalTime as unknown as Array<Record<string, unknown>>,
    counts: {
      favorites: snapshot.favorites.length,
      reservations: snapshot.reservations.length,
      personalTime: snapshot.personalTime.length,
    },
  };
}

export async function favoriteSession(
  sessionId: string,
): Promise<{ saved: boolean; reason?: string }> {
  const config = loadConfig();
  await getValidTokens();
  const client = new AwsEventsClient({ eventId: config.eventId });
  const result = await client.associateFavorites([sessionId]);
  if (result.outcome.failed.some((entry) => entry.sessionId === sessionId)) {
    const reason = result.outcome.failed.find((entry) => entry.sessionId === sessionId)?.reason;
    return { saved: false, reason: reason ?? "refused" };
  }
  const snapshot = await client.getSchedule();
  const saved = snapshot.favorites.some((entry) => entry.sessionId === sessionId);
  return saved ? { saved: true } : { saved: false, reason: "not read back from the schedule" };
}

export async function unfavoriteSession(
  sessionId: string,
): Promise<{ removed: boolean; reason?: string }> {
  const config = loadConfig();
  await getValidTokens();
  const client = new AwsEventsClient({ eventId: config.eventId });
  await client.disassociateFavorite(sessionId);
  const snapshot = await client.getSchedule();
  const still = snapshot.favorites.some((entry) => entry.sessionId === sessionId);
  return still ? { removed: false, reason: "still on the schedule" } : { removed: true };
}

export async function reserveSession(
  sessionId: string,
): Promise<{ reserved: boolean; reason?: string }> {
  const config = loadConfig();
  await getValidTokens();
  const client = new AwsEventsClient({ eventId: config.eventId });
  const { held, result } = await client.reserveThenVerify([sessionId]);
  if (held.includes(sessionId)) {
    return { reserved: true };
  }
  const reason = result.outcome.failed.find((entry) => entry.sessionId === sessionId)?.reason;
  return { reserved: false, reason: reason ?? "not held on schedule" };
}

export async function cancelReservationById(
  sessionId: string,
): Promise<{ cancelled: boolean; reason?: string }> {
  const config = loadConfig();
  await getValidTokens();
  const client = new AwsEventsClient({ eventId: config.eventId });
  await client.cancelReservation(sessionId);
  const snapshot = await client.getSchedule();
  const still = snapshot.reservations.some((entry) => entry.sessionId === sessionId);
  return still ? { cancelled: false, reason: "still on the schedule" } : { cancelled: true };
}

export async function addPersonalTime(
  input: { title: string; start: string; end: string; location?: string },
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const config = loadConfig();
  await getValidTokens();
  const client = new AwsEventsClient({ eventId: config.eventId });
  const before = await client.getSchedule();
  const known = new Set(before.personalTime.map((entry) => entry.personalTimeId));
  await client.createPersonalTime({
    title: input.title,
    description: "Blocked in the app",
    startDateTime: input.start,
    endDateTime: input.end,
    ...(input.location ? { location: input.location } : {}),
  });
  const after = await client.getSchedule();
  const created = after.personalTime.find(
    (entry: PersonalTimeEntry) => !known.has(entry.personalTimeId),
  );
  const match =
    created ??
    after.personalTime.find(
      (entry: PersonalTimeEntry) => entry.title === input.title && entry.startDateTime === input.start,
    );
  return match
    ? { ok: true, id: match.personalTimeId }
    : { ok: false, reason: "not found after write" };
}

export async function removePersonalTime(
  personalTimeId: string,
): Promise<{ removed: boolean; reason?: string }> {
  const config = loadConfig();
  await getValidTokens();
  const client = new AwsEventsClient({ eventId: config.eventId });
  await client.deletePersonalTime(personalTimeId);
  const snapshot = await client.getSchedule();
  const still = snapshot.personalTime.some((entry) => entry.personalTimeId === personalTimeId);
  return still ? { removed: false, reason: "still on the schedule" } : { removed: true };
}

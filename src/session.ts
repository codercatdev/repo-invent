import {
  getValidTokens,
  loadTokens,
  signIn,
  signOut,
} from "./auth/pkce.js";
import { AwsEventsClient, type ScheduleSnapshot } from "./api/events-client.js";
import { loadConfig } from "./config.js";

export interface SessionStatus {
  signedIn: boolean;
  /** Seconds until the access token expires, when signed in. */
  expiresInSeconds?: number;
  eventId: string;
}

export interface MySchedule {
  /** The attendee's favourite sessions, with full detail. */
  favorites: Array<Record<string, unknown>>;
  /** Reservations. The catalog gives ids only, so titles are joined in. */
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

/** Report whether this machine holds a live Builder ID sign-in. */
export async function sessionStatus(): Promise<SessionStatus> {
  const config = loadConfig();
  const tokens = await loadTokens();
  if (tokens === null) return { signedIn: false, eventId: config.eventId };
  const remaining = Math.max(0, Math.round((tokens.expiresAt - Date.now()) / 1000));
  return { signedIn: true, expiresInSeconds: remaining, eventId: config.eventId };
}

/**
 * Start the Builder ID sign-in.
 *
 * The redirect is `http://localhost:8484-8489/callback`, which is why this
 * cannot run on a hosted page: AWS matches that string exactly, and no hosted
 * origin can be a loopback address. The caller opens the URL it returns.
 */
export async function startSignIn(): Promise<{ authorizeUrl: string }> {
  const result = await signIn({});
  void result;
  // signIn blocks until the callback lands, so by the time this returns the
  // tokens are already stored. The URL is printed by the CLI; here we only
  // need to know it finished.
  return { authorizeUrl: "" };
}

export async function endSignIn(): Promise<void> {
  await signOut();
}

/**
 * Fetch the attendee's own schedule.
 *
 * The API returns bare session ids for reservations and favourites, so the
 * catalog is read once to attach titles, venues and times. A title the catalog
 * does not know is left blank rather than invented.
 */
export async function mySchedule(): Promise<MySchedule> {
  const config = loadConfig();
  await getValidTokens();
  const client = new AwsEventsClient({ eventId: config.eventId });
  const snapshot: ScheduleSnapshot = await client.getSchedule();

  const catalog = new Map<string, Record<string, unknown>>();
  try {
    const sessions = await client.listSessions({ includeAbstracts: false });
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
    // A catalog read can fail while a schedule read succeeds. The schedule is
    // still useful with ids only, so this is not fatal.
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

/**
 * Save a session to the account, then confirm it from `GetSchedule`.
 *
 * The API answers a batch with per-id outcomes and has no idempotency key, so a
 * `200` is not proof. This reports `saved` only for a favourite it read back.
 */
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

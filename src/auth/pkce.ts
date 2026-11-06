import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AddressInfo } from "node:net";

export const AUTH_BASE = "https://oauth.awsevents.com";
export const AUTHORIZE_URL = `${AUTH_BASE}/oauth2/authorize`;
export const TOKEN_URL = `${AUTH_BASE}/oauth2/token`;
export const REVOKE_URL = `${AUTH_BASE}/oauth2/revoke`;

export const CLIENT_ID = "7vmom55m1qstvq8i71ph127bfq";
export const SCOPES = ["openid", "email", "events/access"];
export const IDENTITY_PROVIDER = "AWSBuilderID";

// Only these loopback ports are registered for an application you build.
// The installed MCP clients (Kiro 8976, Claude Code 8484) have their own
// registrations and are not usable here. Match is exact, path included.
export const REGISTERED_PORTS = [8484, 8485, 8486, 8487, 8488, 8489] as const;
export const CALLBACK_PATH = "/callback";

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  /** Absolute epoch milliseconds at which the access token expires. */
  expiresAt: number;
  scope?: string;
  tokenType?: string;
}

export interface SignInResult {
  tokens: TokenSet;
  redirectUri: string;
}

export class PkceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "state_mismatch"
      | "callback_error"
      | "timeout"
      | "token_exchange"
      | "refresh_failed"
      | "no_tokens"
      | "revoke_failed",
  ) {
    super(message);
    this.name = "PkceError";
  }
}

/**
 * Where the sign-in tokens live.
 *
 * `REPO_INVENT_HOME` is honoured here, the same as everywhere else, so a test
 * run or a scoped server cannot read or overwrite the developer's own tokens.
 */
export function tokensPath(): string {
  const override = process.env["REPO_INVENT_HOME"];
  const home =
    override !== undefined && override.length > 0
      ? override
      : join(homedir(), ".repo-invent");
  return join(home, "tokens.json");
}

export function base64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export function createCodeVerifier(): string {
  // 64 bytes of randomness renders as 86 base64url characters, inside the
  // 43-128 range the spec requires, and is drawn from the CSPRNG.
  return base64Url(randomBytes(64));
}

export function codeChallengeFor(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier, "ascii").digest());
}

export function buildAuthorizeUrl(params: {
  codeChallenge: string;
  state: string;
  redirectUri: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("identity_provider", IDENTITY_PROVIDER);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);
  return url.toString();
}

interface CallbackCapture {
  code: string;
  state: string;
}

function startCallbackListener(port: number): Promise<{
  server: Server;
  received: Promise<CallbackCapture>;
}> {
  let settle: (value: CallbackCapture) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const received = new Promise<CallbackCapture>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") ?? "";
    if (error) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Sign-in failed. You can close this window.");
      fail(new PkceError(`authorization denied: ${error}`, "callback_error"));
      return;
    }
    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing code. You can close this window.");
      fail(new PkceError("callback carried no code", "callback_error"));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Signed in. You can close this window.");
    settle({ code, state });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({ server, received }));
  });
}

async function pickPort(): Promise<number> {
  for (const port of REGISTERED_PORTS) {
    try {
      const { server } = await startCallbackListener(port);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      return port;
    } catch {
      continue;
    }
  }
  throw new PkceError(
    `none of the registered loopback ports ${REGISTERED_PORTS.join(", ")} is free`,
    "callback_error",
  );
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

function toTokenSet(body: unknown, previousRefresh?: string): TokenSet {
  const raw = (body ?? {}) as RawTokenResponse;
  if (typeof raw.access_token !== "string" || raw.access_token.length === 0) {
    throw new PkceError("token response carried no access_token", "token_exchange");
  }
  const expiresIn = Number(raw.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new PkceError("token response carried no usable expires_in", "token_exchange");
  }
  const refreshToken = raw.refresh_token ?? previousRefresh;
  if (typeof refreshToken !== "string" || refreshToken.length === 0) {
    throw new PkceError("token response carried no refresh_token", "token_exchange");
  }
  const tokens: TokenSet = {
    accessToken: raw.access_token,
    refreshToken,
    // The response's own lifetime, never a hardcoded 60 minutes.
    expiresAt: Date.now() + expiresIn * 1000,
  };
  if (typeof raw.id_token === "string") tokens.idToken = raw.id_token;
  if (typeof raw.scope === "string") tokens.scope = raw.scope;
  if (typeof raw.token_type === "string") tokens.tokenType = raw.token_type;
  return tokens;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export async function exchangeCode(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    redirect_uri: params.redirectUri,
    code: params.code,
    code_verifier: params.codeVerifier,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await readJson(response);
  if (!response.ok) {
    const detail = typeof (json as { error?: unknown }).error === "string"
      ? String((json as { error?: unknown }).error)
      : `HTTP ${response.status}`;
    throw new PkceError(`token exchange failed: ${detail}`, "token_exchange");
  }
  return toTokenSet(json);
}

export async function saveTokens(tokens: TokenSet): Promise<void> {
  const path = tokensPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  await rename(temporary, path);
}

export async function loadTokens(): Promise<TokenSet | null> {
  try {
    const text = await readFile(tokensPath(), "utf8");
    const parsed = JSON.parse(text) as Partial<TokenSet>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return parsed as TokenSet;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  const path = tokensPath();
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(path);
  } catch {
    return;
  }
}

export function isExpired(tokens: TokenSet, skewMs = 60_000): boolean {
  return Date.now() >= tokens.expiresAt - skewMs;
}

export async function refreshTokens(tokens: TokenSet): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: tokens.refreshToken,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await readJson(response);
  if (response.status === 400 || response.status === 401) {
    // The refresh token is gone. A second refresh attempt cannot help; the
    // attendee has to sign in interactively.
    throw new PkceError("refresh token rejected; sign in again", "refresh_failed");
  }
  if (!response.ok) {
    throw new PkceError(`refresh failed: HTTP ${response.status}`, "refresh_failed");
  }
  const next = toTokenSet(json, tokens.refreshToken);
  await saveTokens(next);
  return next;
}

export async function getValidTokens(): Promise<TokenSet> {
  const stored = await loadTokens();
  if (stored === null) {
    throw new PkceError("not signed in; run `repo-invent login`", "no_tokens");
  }
  if (!isExpired(stored)) return stored;
  return refreshTokens(stored);
}

export async function signIn(options?: {
  onAuthorize?: (url: string) => void;
}): Promise<SignInResult> {
  const port = await pickPort();
  const redirectUri = `http://localhost:${port}${CALLBACK_PATH}`;
  const codeVerifier = createCodeVerifier();
  const codeChallenge = codeChallengeFor(codeVerifier);
  const state = base64Url(randomBytes(24));

  const { server, received } = await startCallbackListener(port);
  const authorizeUrl = buildAuthorizeUrl({ codeChallenge, state, redirectUri });
  options?.onAuthorize?.(authorizeUrl);

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new PkceError("sign-in timed out after 5 minutes", "timeout"));
    }, SIGN_IN_TIMEOUT_MS);
    timer.unref();
  });

  try {
    const capture = await Promise.race([received, timeout]);
    if (capture.state !== state) {
      throw new PkceError("state did not match; the response was not for this attempt", "state_mismatch");
    }
    const tokens = await exchangeCode({ code: capture.code, codeVerifier, redirectUri });
    await saveTokens(tokens);
    return { tokens, redirectUri };
  } finally {
    if (timer) clearTimeout(timer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export interface BudgetedFetchOptions {
  /** Load the stored credential, refreshing when needed. */
  getTokens?: () => Promise<TokenSet>;
  /** Called after a refresh succeeds, so a caller can rotate its own copy. */
  onTokensRefreshed?: (tokens: TokenSet) => void;
}

/**
 * Perform one request as the signed-in attendee.
 *
 * A `401` means the access token is no longer good: refresh ONCE, retry once.
 * A second `401` means the refresh token itself is dead, so it is surfaced as
 * `refresh_failed` rather than looped on.
 */
export async function authorizedFetch(
  url: string,
  init: RequestInit = {},
  options: BudgetedFetchOptions = {},
): Promise<Response> {
  const load = options.getTokens ?? getValidTokens;
  let tokens = await load();

  const withAuth = (token: string): RequestInit => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return { ...init, headers };
  };

  let response = await fetch(url, withAuth(tokens.accessToken));
  if (response.status !== 401) return response;

  tokens = await refreshTokens(tokens);
  options.onTokensRefreshed?.(tokens);
  response = await fetch(url, withAuth(tokens.accessToken));
  if (response.status === 401) {
    throw new PkceError("access token rejected after refresh; sign in again", "refresh_failed");
  }
  return response;
}

export async function signOut(): Promise<void> {
  const stored = await loadTokens();
  if (stored === null) return;
  const body = new URLSearchParams({
    token: stored.refreshToken,
    client_id: CLIENT_ID,
    token_type_hint: "refresh_token",
  });
  const response = await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok && response.status !== 400) {
    // Keep the file: the grant may still be live, and deleting it would hide
    // that from the attendee.
    throw new PkceError(`revoke failed: HTTP ${response.status}`, "revoke_failed");
  }
  await clearTokens();
}

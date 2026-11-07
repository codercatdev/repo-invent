import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { NextResponse } from "next/server";
import {
  base64Url,
  buildAuthorizeUrl,
  CALLBACK_PATH,
  codeChallengeFor,
  createCodeVerifier,
  exchangeCode,
  REGISTERED_PORTS,
  saveTokens,
} from "@/src/auth/pkce";

export const runtime = "nodejs";

interface PendingPkce {
  verifier: string;
  state: string;
  redirectUri: string;
  createdAt: number;
  server?: Server;
}

const globalForPkce = globalThis as unknown as {
  __repoInventPendingPkce?: PendingPkce;
};

function closeExistingServer() {
  const prev = globalForPkce.__repoInventPendingPkce;
  if (prev?.server) {
    try {
      prev.server.close();
    } catch {
      // ignore
    }
  }
}

export async function POST(request: Request) {
  let body: { callbackUrlOrCode?: unknown } = {};
  try {
    body = (await request.json()) as { callbackUrlOrCode?: unknown };
  } catch {
    // empty body starts a new PKCE flow
  }

  // Mode 2: Exchange a pasted callback URL or authorization code
  if (typeof body.callbackUrlOrCode === "string" && body.callbackUrlOrCode.trim().length > 0) {
    const raw = body.callbackUrlOrCode.trim();
    const pending = globalForPkce.__repoInventPendingPkce;
    if (!pending) {
      return NextResponse.json(
        { error: "No active login session. Click 'Launch AWS Builder ID Login' first." },
        { status: 400 },
      );
    }
    let code = raw;
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.includes("code=")) {
      try {
        const u = new URL(raw.startsWith("http") ? raw : `http://localhost:8484/callback?${raw}`);
        const extracted = u.searchParams.get("code");
        if (extracted) code = extracted;
      } catch {
        // use raw code
      }
    }

    try {
      const tokens = await exchangeCode({
        code,
        codeVerifier: pending.verifier,
        redirectUri: pending.redirectUri,
      });
      await saveTokens(tokens);
      closeExistingServer();
      globalForPkce.__repoInventPendingPkce = undefined;
      return NextResponse.json({
        signedIn: true,
        expiresAt: tokens.expiresAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Token exchange failed.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  // Mode 1: Start a fresh PKCE flow and spin up loopback listener on 8484..8489
  closeExistingServer();

  const verifier = createCodeVerifier();
  const codeChallenge = codeChallengeFor(verifier);
  const state = base64Url(randomBytes(24));
  let chosenPort: number = REGISTERED_PORTS[0];
  let listener: Server | undefined;

  for (const port of REGISTERED_PORTS) {
    try {
      const srv = await new Promise<Server>((resolve, reject) => {
        const s = createServer(async (req, res) => {
          const url = new URL(req.url ?? "/", `http://localhost:${port}`);
          if (url.pathname !== CALLBACK_PATH) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not found");
            return;
          }
          const code = url.searchParams.get("code");
          const returnedState = url.searchParams.get("state");
          if (!code || returnedState !== state) {
            res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
            res.end("<h2>Sign-in could not be verified.</h2><p>Return to repo:Invent and try again.</p>");
            return;
          }
          try {
            const tokens = await exchangeCode({
              code,
              codeVerifier: verifier,
              redirectUri: `http://localhost:${port}${CALLBACK_PATH}`,
            });
            await saveTokens(tokens);
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`<!doctype html><html><body style="font-family:system-ui;padding:40px;text-align:center;">
              <h1 style="color:#16a34a;">Signed in to AWS Builder ID!</h1>
              <p>Your repo:Invent session is now authenticated. You can close this tab.</p>
              <script>setTimeout(() => { window.close(); }, 1200);</script>
            </body></html>`);
          } catch (err) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end(`Token exchange failed: ${err instanceof Error ? err.message : "error"}`);
          } finally {
            setTimeout(() => {
              try {
                s.close();
              } catch {
                // ignore
              }
            }, 500);
          }
        });
        s.once("error", reject);
        s.listen(port, "127.0.0.1", () => resolve(s));
      });
      chosenPort = port;
      listener = srv;
      break;
    } catch {
      continue;
    }
  }

  const redirectUri = `http://localhost:${chosenPort}${CALLBACK_PATH}`;
  const authorizeUrl = buildAuthorizeUrl({
    codeChallenge,
    state,
    redirectUri,
  });

  globalForPkce.__repoInventPendingPkce = {
    verifier,
    state,
    redirectUri,
    createdAt: Date.now(),
    server: listener,
  };

  return NextResponse.json({
    authorizeUrl,
    redirectUri,
    port: chosenPort,
    listenerReady: Boolean(listener),
  });
}

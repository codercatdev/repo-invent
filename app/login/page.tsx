"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [startingOauth, setStartingOauth] = useState(false);
  const [authorizeUrl, setAuthorizeUrl] = useState<string>("");
  const [callbackInput, setCallbackInput] = useState("");
  const [exchanging, setExchanging] = useState(false);

  async function checkStatus() {
    try {
      const res = await fetch("/api/session");
      const data = (await res.json()) as { signedIn?: boolean; expiresInSeconds?: number };
      setSignedIn(Boolean(data.signedIn));
      setExpiresIn(data.expiresInSeconds);
      if (data.signedIn) {
        window.dispatchEvent(new CustomEvent("repo-invent:auth-updated"));
      }
    } catch {
      setSignedIn(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void checkStatus();
    const timer = setInterval(() => {
      void checkStatus();
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  async function handleStartOauth() {
    setStartingOauth(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        authorizeUrl?: string;
        port?: number;
        listenerReady?: boolean;
        error?: string;
      };
      if (!res.ok || !data.authorizeUrl) {
        toast.error(data.error ?? "Could not start PKCE login flow.");
        return;
      }
      setAuthorizeUrl(data.authorizeUrl);
      window.open(data.authorizeUrl, "_blank", "noopener,noreferrer");
      toast.success(
        data.listenerReady
          ? `Opened AWS Builder ID! Callback listener ready on localhost:${data.port}.`
          : "Opened AWS Builder ID! Paste the callback URL below if testing from a remote device.",
      );
    } catch {
      toast.error("Failed to launch PKCE login.");
    } finally {
      setStartingOauth(false);
    }
  }

  async function handleExchangeCode(e: React.FormEvent) {
    e.preventDefault();
    if (!callbackInput.trim()) return;
    setExchanging(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callbackUrlOrCode: callbackInput.trim() }),
      });
      const data = (await res.json()) as { signedIn?: boolean; error?: string };
      if (!res.ok || !data.signedIn) {
        toast.error(data.error ?? "Code exchange failed.");
        return;
      }
      toast.success("Authenticated with AWS Builder ID!");
      setCallbackInput("");
      await checkStatus();
      router.push("/");
    } catch {
      toast.error("Could not complete code exchange.");
    } finally {
      setExchanging(false);
    }
  }

  async function handleSignOut() {
    try {
      await fetch("/api/session", { method: "DELETE" });
      setSignedIn(false);
      setAuthorizeUrl("");
      window.dispatchEvent(new CustomEvent("repo-invent:auth-updated"));
      toast.success("Signed out of AWS Builder ID.");
    } catch {
      toast.error("Could not sign out.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-3xl border-2 border-primary bg-primary/15 text-primary shadow-tactile-primary">
          <ShieldCheck className="size-8" />
        </div>
        <h1 className="text-3xl font-black tracking-tight">AWS Builder ID Login</h1>
        <p className="text-sm text-muted-foreground">
          Connect your AWS Builder ID via OAuth 2.0 PKCE to sync live reservations, favorites,
          personal time blocks, and the remote AWS Events MCP server.
        </p>
      </div>

      {signedIn ? (
        <Card className="border-primary bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="size-5 text-primary" />
                Connected to AWS Builder ID
              </CardTitle>
              <Badge className="bg-primary text-primary-foreground">Active Session</Badge>
            </div>
            <CardDescription>
              Your OAuth 2.0 PKCE token is active for event <code className="font-mono">reinvent2026</code>
              {expiresIn ? ` (renews in ${Math.round(expiresIn / 60)} min)` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={() => router.push("/calendar")}>Go to My Calendar</Button>
            <Button variant="secondary" onClick={() => void handleStartOauth()}>
              <RefreshCw className="size-4" />
              Re-authenticate
            </Button>
            <Button variant="destructive" onClick={() => void handleSignOut()}>
              <LogOut className="size-4" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="size-5 text-primary" />
              Step 1: Launch AWS Builder ID Sign-In
            </CardTitle>
            <CardDescription>
              Clicking the button below starts a local PKCE callback listener on{" "}
              <code className="font-mono">http://localhost:8484/callback</code> and opens the
              official AWS Builder ID login prompt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              size="lg"
              onClick={() => void handleStartOauth()}
              disabled={startingOauth || loading}
              className="w-full"
            >
              <Sparkles className="size-5" />
              {startingOauth ? "Starting PKCE Listener…" : "Sign in with AWS Builder ID"}
              <ExternalLink className="size-4" />
            </Button>

            {authorizeUrl ? (
              <div className="space-y-3 rounded-2xl border-2 border-border bg-muted/50 p-4">
                <p className="text-xs font-bold">
                  Testing from another device (e.g. Tailscale) where localhost:8484 doesn&apos;t hit
                  this server?
                </p>
                <p className="text-xs text-muted-foreground">
                  After signing in, copy the <code className="font-mono">http://localhost:8484/callback?code=...</code>{" "}
                  URL from your browser address bar and paste it here:
                </p>
                <form onSubmit={(e) => void handleExchangeCode(e)} className="flex gap-2">
                  <Input
                    value={callbackInput}
                    onChange={(e) => setCallbackInput(e.target.value)}
                    placeholder="http://localhost:8484/callback?code=..."
                    className="font-mono text-xs"
                  />
                  <Button type="submit" variant="secondary" disabled={exchanging}>
                    {exchanging ? "Verifying…" : "Complete Sign-In"}
                  </Button>
                </form>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

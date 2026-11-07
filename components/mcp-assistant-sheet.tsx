"use client";

import { useEffect, useState } from "react";
import {
  ArrowUp,
  CheckCircle2,
  Code2,
  Cpu,
  ExternalLink,
  Play,
  Sparkles,
  Terminal,
  Wrench,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SessionCard } from "@/components/session-card";
import { PartyCard } from "@/components/party-card";
import { registerWebMcpTools } from "@/lib/web-mcp";
import type { Party, ReinventSession, ScanResult } from "@/lib/types";

interface ToolTrace {
  tool: string;
  transport: "aws-mcp" | "local-mcp";
  args: Record<string, unknown>;
  status: "ok" | "error";
  durationMs: number;
  preview: string;
}

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolTrace[];
  sessions?: ReinventSession[];
  parties?: Party[];
  scan?: ScanResult;
}

interface McpToolSpec {
  name: string;
  shortName: string;
  transport: "aws-mcp" | "local-mcp";
  description: string;
  defaultArgs: Record<string, unknown>;
}

const STARTER_PROMPTS = [
  "Get my live AWS Events schedule",
  "Scan sample://reinvent-demo-shop for AWS gaps",
  "Find 400-level Bedrock or AgentCore sessions",
  "What parties are happening Tuesday night?",
  "Find open reservable workshops at The Venetian",
];

export function McpAssistantSheet({
  open,
  onOpenChange,
  initialPrompt,
  onSelectSession,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  onSelectSession?: (session: ReinventSession) => void;
}) {
  const [mode, setMode] = useState<"chat" | "inspector">("chat");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Connected to the AWS Events MCP proxy (`https://api.awsevents.com/mcp`, 12 tools) + Repo:Invent Scanner & Party Guide (4 tools) + in-page WebMCP (`navigator.modelContext`). Ask anything or inspect tools directly!",
    },
  ]);

  const [mcpMeta, setMcpMeta] = useState<{
    endpoint: string;
    signedIn: boolean;
    liveRemoteVerified: boolean;
    tools: McpToolSpec[];
  } | null>(null);
  const [webMcpState, setWebMcpState] = useState<{
    supported: boolean;
    registeredCount: number;
    tools: string[];
  }>({ supported: false, registeredCount: 0, tools: [] });

  const [selectedTool, setSelectedTool] = useState<string>("AWSEventsPublicApi-Mcp-prod___GetSchedule");
  const [argsJson, setArgsJson] = useState<string>('{\n  "eventId": "reinvent2026"\n}');
  const [toolOutput, setToolOutput] = useState<string>("");
  const [runningTool, setRunningTool] = useState(false);

  useEffect(() => {
    setWebMcpState(registerWebMcpTools());
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch("/api/mcp")
      .then((r) => r.json())
      .then((data) => {
        setMcpMeta(data);
      })
      .catch(() => {
        // ignore
      });
  }, [open]);

  useEffect(() => {
    if (open && initialPrompt && initialPrompt.trim().length > 0) {
      void sendPrompt(initialPrompt.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt]);

  async function sendPrompt(promptText: string) {
    const trimmed = promptText.trim();
    if (!trimmed || busy) return;
    setInput("");
    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    setTurns((prev) => [...prev, userTurn]);
    setBusy(true);
    try {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = (await response.json()) as {
        reply?: string;
        error?: string;
        toolCalls?: ToolTrace[];
        sessions?: ReinventSession[];
        parties?: Party[];
        scan?: ScanResult;
      };
      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: data.reply ?? data.error ?? "Completed MCP request.",
          toolCalls: data.toolCalls,
          sessions: data.sessions,
          parties: data.parties,
          scan: data.scan,
        },
      ]);
    } catch {
      setTurns((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          text: "Could not reach `/api/mcp`.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function runInspectorTool() {
    setRunningTool(true);
    setToolOutput("");
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      setToolOutput('{\n  "error": "Arguments must be valid JSON"\n}');
      setRunningTool(false);
      return;
    }

    try {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: selectedTool, args: parsedArgs }),
      });
      const data = await response.json();
      setToolOutput(JSON.stringify(data, null, 2));
    } catch (error) {
      setToolOutput(
        JSON.stringify({ error: error instanceof Error ? error.message : "Failed" }, null, 2),
      );
    } finally {
      setRunningTool(false);
    }
  }

  function pickTool(spec: McpToolSpec) {
    setSelectedTool(spec.name);
    setArgsJson(JSON.stringify(spec.defaultArgs, null, 2));
    setToolOutput("");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex h-[88dvh] max-w-3xl flex-col rounded-t-3xl border-t-2 border-border bg-background p-0 text-foreground"
      >
        <SheetHeader className="border-b-2 border-border px-5 pb-3 pt-4 text-left">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-2xl border-2 border-primary bg-primary text-primary-foreground shadow-tactile-primary">
                <Sparkles className="size-5" />
              </div>
              <div>
                <SheetTitle className="font-heading text-base font-black text-foreground">
                  re:Invent MCP + WebMCP Agent
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  api.awsevents.com/mcp (12 tools) • WebMCP ({webMcpState.registeredCount} browser tools)
                </SheetDescription>
              </div>
            </div>
          </div>

          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant={mode === "chat" ? "default" : "outline"}
              onClick={() => setMode("chat")}
              className="flex-1"
            >
              ✦ Ask & Act (MCP Chat)
            </Button>
            <Button
              size="sm"
              variant={mode === "inspector" ? "default" : "outline"}
              onClick={() => setMode("inspector")}
              className="flex-1"
            >
              <Wrench className="size-3.5" />
              MCP & WebMCP Inspector (16)
            </Button>
          </div>
        </SheetHeader>

        {mode === "chat" ? (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendPrompt(prompt)}
                    className="chip-tactile shrink-0"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {turns.map((turn) => (
                <div
                  key={turn.id}
                  className={`space-y-2 ${turn.role === "user" ? "flex justify-end" : ""}`}
                >
                  {turn.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl border-2 border-primary bg-primary px-4 py-2.5 text-sm font-extrabold text-primary-foreground shadow-tactile-primary">
                      {turn.text}
                    </div>
                  ) : (
                    <div className="card-tactile space-y-3 p-4">
                      {turn.toolCalls && turn.toolCalls.length > 0 ? (
                        <div className="space-y-1.5">
                          {turn.toolCalls.map((call, idx) => (
                            <div
                              key={`${call.tool}-${idx}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2 font-mono text-[11px]"
                            >
                              <div className="flex items-center gap-1.5">
                                {call.status === "ok" ? (
                                  <CheckCircle2 className="size-3.5 text-primary" />
                                ) : (
                                  <XCircle className="size-3.5 text-destructive" />
                                )}
                                <span className="font-bold text-foreground">{call.tool}</span>
                                <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                                  {call.transport}
                                </Badge>
                              </div>
                              <span className="text-muted-foreground">{call.durationMs}ms</span>
                              <p className="w-full text-[11px] text-muted-foreground">{call.preview}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <p className="text-sm font-medium leading-relaxed text-foreground">{turn.text}</p>

                      {turn.scan ? (
                        <div className="card-tactile space-y-2 bg-muted/40 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold">
                              {turn.scan.fingerprint.repo.owner}/{turn.scan.fingerprint.repo.repo}
                            </span>
                            <a
                              href={`/api/report?repo=${encodeURIComponent(
                                `${turn.scan.fingerprint.repo.owner}/${turn.scan.fingerprint.repo.repo}`,
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-extrabold text-primary hover:underline"
                            >
                              Printable Report <ExternalLink className="size-3" />
                            </a>
                          </div>
                          <div className="space-y-1.5">
                            {turn.scan.gaps.slice(0, 4).map((g) => (
                              <div key={g.id} className="rounded-xl border border-border bg-card p-2 text-xs">
                                <Badge variant={g.severity === "high" ? "destructive" : "secondary"} className="mr-1.5 text-[10px]">
                                  {g.severity}
                                </Badge>
                                <span className="font-bold">{g.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {turn.sessions && turn.sessions.length > 0 ? (
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          {turn.sessions.slice(0, 4).map((session) => (
                            <SessionCard
                              key={session.sessionId}
                              session={session}
                              onOpen={(picked) => {
                                if (onSelectSession) {
                                  onSelectSession(picked);
                                }
                              }}
                            />
                          ))}
                        </div>
                      ) : null}

                      {turn.parties && turn.parties.length > 0 ? (
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          {turn.parties.slice(0, 4).map((party) => (
                            <PartyCard key={`${party.date}-${party.title}`} party={party} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
              {busy ? (
                <div className="card-tactile p-3.5 text-xs font-semibold text-muted-foreground">
                  Calling MCP tool…
                </div>
              ) : null}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendPrompt(input);
              }}
              className="border-t-2 border-border bg-card p-3"
            >
              <div className="flex items-center gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask MCP agent, search sessions/parties, or paste GitHub repo…"
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={busy}>
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="card-tactile p-4 text-xs">
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-extrabold">
                  <Terminal className="size-4 text-primary" />
                  Claude / Cursor MCP Setup Command
                </span>
                <Badge variant={mcpMeta?.signedIn ? "default" : "secondary"}>
                  {mcpMeta?.signedIn ? "Builder ID Active" : "Guest Mode"}
                </Badge>
              </div>
              <pre className="overflow-x-auto rounded-xl border border-border bg-muted p-2.5 font-mono text-[11px]">
{`claude mcp add --transport http --scope user awsevents \\
  https://api.awsevents.com/mcp \\
  --callback-port 8484 --client-id 7vmom55m1qstvq8i71ph127bfq`}
              </pre>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Cpu className="size-3.5 text-primary" />
                  WebMCP (`window.webMcp` & `navigator.modelContext`): {webMcpState.registeredCount} tools active
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                Select MCP Tool to Execute (12 Remote AWS + 4 Local)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(mcpMeta?.tools ?? []).map((spec) => (
                  <button
                    key={spec.name}
                    type="button"
                    onClick={() => pickTool(spec)}
                    className={`chip-tactile font-mono text-[11px] ${
                      selectedTool === spec.name ? "border-primary bg-primary/15 text-primary" : ""
                    }`}
                  >
                    {spec.shortName}
                  </button>
                ))}
              </div>
            </div>

            <div className="card-tactile space-y-2 p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-primary">{selectedTool}</span>
                <Button size="sm" onClick={() => void runInspectorTool()} disabled={runningTool}>
                  <Play className="size-3" />
                  {runningTool ? "Calling MCP…" : "Execute Tool"}
                </Button>
              </div>
              <textarea
                value={argsJson}
                onChange={(e) => setArgsJson(e.target.value)}
                rows={4}
                className="w-full rounded-xl border-2 border-border bg-muted/40 p-2.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {toolOutput ? (
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                    <Code2 className="size-3.5" /> MCP Response Payload
                  </span>
                  <pre className="max-h-60 overflow-auto rounded-xl border border-border bg-muted p-3 font-mono text-[11px]">
                    {toolOutput}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

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
      text: "Connected to the AWS Events MCP proxy (`https://api.awsevents.com/mcp`, 12 tools) + Repo:Invent Scanner & Party Guide (4 tools) + in-page WebMCP (`navigator.modelContext`). Ask anything or inspect tools directly.",
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
        className="mx-auto flex h-[90dvh] max-w-[520px] flex-col rounded-t-3xl border-t border-white/10 bg-[#0d1017] p-0 text-white"
      >
        <SheetHeader className="border-b border-white/10 px-5 pb-3 pt-4 text-left">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-xl bg-[#9b8afb] text-[#11131a]">
                <Sparkles className="size-4" />
              </div>
              <div>
                <SheetTitle className="text-base font-bold text-white">
                  re:Invent MCP + WebMCP Agent
                </SheetTitle>
                <SheetDescription className="text-[11px] text-slate-400">
                  api.awsevents.com/mcp (12 tools) • WebMCP ({webMcpState.registeredCount} browser tools)
                </SheetDescription>
              </div>
            </div>
          </div>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("chat")}
              className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${
                mode === "chat"
                  ? "bg-[#9b8afb] text-[#11131a]"
                  : "bg-[#1a1f2b] text-slate-300 hover:text-white"
              }`}
            >
              ✦ Ask & Act (MCP Chat)
            </button>
            <button
              type="button"
              onClick={() => setMode("inspector")}
              className={`flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${
                mode === "inspector"
                  ? "bg-[#9b8afb] text-[#11131a]"
                  : "bg-[#1a1f2b] text-slate-300 hover:text-white"
              }`}
            >
              <Wrench className="mr-1 inline size-3.5" />
              MCP & WebMCP Inspector (16)
            </button>
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
                    className="shrink-0 rounded-full border border-white/10 bg-[#181d28] px-3 py-1.5 text-xs text-slate-200 hover:border-[#9b8afb]/50 hover:text-white"
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
                    <div className="max-w-[85%] rounded-2xl bg-[#9b8afb] px-4 py-2.5 text-sm font-medium text-[#101218]">
                      {turn.text}
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-[#151a24] p-3.5">
                      {turn.toolCalls && turn.toolCalls.length > 0 ? (
                        <div className="space-y-1.5">
                          {turn.toolCalls.map((call, idx) => (
                            <div
                              key={`${call.tool}-${idx}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#0e1219] px-3 py-2 font-mono text-[11px]"
                            >
                              <div className="flex items-center gap-1.5">
                                {call.status === "ok" ? (
                                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                                ) : (
                                  <XCircle className="size-3.5 text-amber-400" />
                                )}
                                <span className="font-semibold text-[#9b8afb]">{call.tool}</span>
                                <Badge
                                  variant="outline"
                                  className="border-white/15 px-1.5 py-0 text-[9px] text-slate-400"
                                >
                                  {call.transport}
                                </Badge>
                              </div>
                              <span className="text-slate-400">{call.durationMs}ms</span>
                              <p className="w-full text-[11px] text-slate-300">{call.preview}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <p className="text-sm leading-relaxed text-slate-100">{turn.text}</p>

                      {turn.scan ? (
                        <div className="space-y-2 rounded-xl border border-[#9b8afb]/30 bg-[#10141d] p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[#9b8afb]">
                              {turn.scan.fingerprint.repo.owner}/{turn.scan.fingerprint.repo.repo}
                            </span>
                            <a
                              href={`/api/report?repo=${encodeURIComponent(
                                `${turn.scan.fingerprint.repo.owner}/${turn.scan.fingerprint.repo.repo}`,
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#2ea8ff] hover:underline"
                            >
                              Printable Report <ExternalLink className="size-3" />
                            </a>
                          </div>
                          <div className="space-y-1.5">
                            {turn.scan.gaps.slice(0, 4).map((g) => (
                              <div key={g.id} className="rounded-lg bg-[#181e2b] p-2 text-xs">
                                <span className="mr-1.5 rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-[10px] uppercase text-rose-300">
                                  {g.severity}
                                </span>
                                <span className="font-semibold text-white">{g.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {turn.sessions && turn.sessions.length > 0 ? (
                        <div className="space-y-2">
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
                        <div className="space-y-2">
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
                <div className="rounded-2xl border border-white/10 bg-[#151a24] p-3.5 text-xs text-slate-400">
                  Calling MCP tool…
                </div>
              ) : null}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendPrompt(input);
              }}
              className="border-t border-white/10 bg-[#11151e] p-3"
            >
              <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-[#181d29] px-3 py-1.5">
                <Sparkles className="size-4 shrink-0 text-[#9b8afb]" />
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask MCP agent, search sessions/parties, or paste GitHub repo…"
                  className="border-0 bg-transparent px-1 text-sm text-white focus-visible:ring-0"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={busy}
                  className="size-8 shrink-0 rounded-full bg-[#9b8afb] text-[#11131a] hover:bg-[#9b8afb]/90"
                >
                  <ArrowUp className="size-4" />
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="rounded-2xl border border-white/10 bg-[#151a24] p-3.5 text-xs">
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                  <Terminal className="size-4 text-[#9b8afb]" />
                  Claude / Cursor MCP Setup Command
                </span>
                <Badge
                  variant="outline"
                  className={
                    mcpMeta?.signedIn
                      ? "border-emerald-500/40 text-emerald-300"
                      : "border-amber-500/40 text-amber-300"
                  }
                >
                  {mcpMeta?.signedIn ? "Builder ID Token Active" : "Local Token Needed for Remote Writes"}
                </Badge>
              </div>
              <pre className="overflow-x-auto rounded-xl bg-[#0b0e14] p-2.5 font-mono text-[11px] text-slate-300">
{`claude mcp add --transport http --scope user awsevents \\
  https://api.awsevents.com/mcp \\
  --callback-port 8484 --client-id 7vmom55m1qstvq8i71ph127bfq`}
              </pre>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Cpu className="size-3.5 text-[#2ea8ff]" />
                  WebMCP (`window.webMcp` & `navigator.modelContext`): {webMcpState.registeredCount} tools active
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Select MCP Tool to Execute (12 Remote AWS + 4 Local)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(mcpMeta?.tools ?? []).map((spec) => (
                  <button
                    key={spec.name}
                    type="button"
                    onClick={() => pickTool(spec)}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                      selectedTool === spec.name
                        ? "border-[#9b8afb] bg-[#9b8afb]/20 text-white"
                        : "border-white/10 bg-[#151a24] text-slate-300 hover:border-white/25"
                    }`}
                  >
                    {spec.shortName}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-white/10 bg-[#151a24] p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[#9b8afb]">{selectedTool}</span>
                <Button
                  size="sm"
                  onClick={() => void runInspectorTool()}
                  disabled={runningTool}
                  className="h-8 rounded-full bg-[#9b8afb] px-3.5 text-xs font-semibold text-[#11131a] hover:bg-[#9b8afb]/90"
                >
                  <Play className="mr-1 size-3" />
                  {runningTool ? "Calling MCP…" : "Execute Tool"}
                </Button>
              </div>
              <textarea
                value={argsJson}
                onChange={(e) => setArgsJson(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-white/10 bg-[#0b0e14] p-2.5 font-mono text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#9b8afb]"
              />
              {toolOutput ? (
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                    <Code2 className="size-3.5" /> MCP Response Payload
                  </span>
                  <pre className="max-h-60 overflow-auto rounded-xl bg-[#0b0e14] p-3 font-mono text-[11px] text-emerald-300">
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

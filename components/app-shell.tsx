"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Calendar, House, PartyPopper, Sparkles } from "lucide-react";
import { McpAssistantSheet } from "@/components/mcp-assistant-sheet";
import { MoreSheet } from "@/components/more-sheet";
import { SessionSheet } from "@/components/session-sheet";
import { cn } from "@/lib/utils";
import type { ReinventSession } from "@/lib/types";

interface ShellContextValue {
  openMcp: (initialPrompt?: string) => void;
  openMore: (subView?: "main" | "surveys" | "profile" | "badge" | "faqs" | "sponsors" | "disclosures" | "events") => void;
  openSession: (session: ReinventSession) => void;
  classicMode: boolean;
  toggleClassicMode: () => void;
}

const ShellContext = createContext<ShellContextValue>({
  openMcp: () => {},
  openMore: () => {},
  openSession: () => {},
  classicMode: false,
  toggleClassicMode: () => {},
});

export function useAppShell() {
  return useContext(ShellContext);
}

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/catalog", label: "Catalog", icon: BookOpen },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/parties", label: "Parties", icon: PartyPopper },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpPrompt, setMcpPrompt] = useState<string | undefined>(undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSubView, setMoreSubView] = useState<
    "main" | "surveys" | "profile" | "badge" | "faqs" | "sponsors" | "disclosures" | "events"
  >("main");
  const [selectedSession, setSelectedSession] = useState<ReinventSession | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [classicMode, setClassicMode] = useState(false);

  function openMcp(prompt?: string) {
    setMcpPrompt(prompt);
    setMcpOpen(true);
  }

  function openMore(
    subView: "main" | "surveys" | "profile" | "badge" | "faqs" | "sponsors" | "disclosures" | "events" = "main",
  ) {
    setMoreSubView(subView);
    setMoreOpen(true);
  }

  function openSession(session: ReinventSession) {
    setSelectedSession(session);
    setSessionOpen(true);
  }

  useEffect(() => {
    const onOpenMcp = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail;
      openMcp(detail?.prompt);
    };
    window.addEventListener("repo-invent:open-mcp", onOpenMcp);
    return () => window.removeEventListener("repo-invent:open-mcp", onOpenMcp);
  }, []);

  return (
    <ShellContext.Provider
      value={{
        openMcp,
        openMore,
        openSession,
        classicMode,
        toggleClassicMode: () => setClassicMode((prev) => !prev),
      }}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-[#0b0d13] text-white shadow-2xl">
        <main className="flex-1 pb-28">{children}</main>

        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[480px] items-end justify-between gap-2 bg-gradient-to-t from-[#0b0d13] via-[#0b0d13]/95 to-transparent px-3 pb-[calc(0.65rem+env(safe-area-inset-bottom))] pt-3">
          <nav
            aria-label="Main"
            className="grid flex-1 grid-cols-4 rounded-2xl border border-white/[0.08] bg-[#12161f]/95 px-2 py-2 backdrop-blur-md"
          >
            {TABS.map((tab) => {
              const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-0.5 text-[11px] font-medium transition-colors",
                    active ? "text-[#0095ff]" : "text-slate-400 hover:text-slate-200",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => openMcp()}
            aria-label="Open AWS Events MCP Assistant"
            title="Chat with AWS Events MCP & WebMCP Agent"
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#9b8afb] text-[#101218] shadow-lg shadow-[#9b8afb]/25 transition-transform hover:scale-[1.03] active:scale-95"
          >
            <Sparkles className="size-6" strokeWidth={2} />
          </button>
        </div>

        <McpAssistantSheet
          open={mcpOpen}
          onOpenChange={(next) => {
            setMcpOpen(next);
            if (!next) setMcpPrompt(undefined);
          }}
          initialPrompt={mcpPrompt}
          onSelectSession={(s) => {
            setMcpOpen(false);
            openSession(s);
          }}
        />

        <MoreSheet
          open={moreOpen}
          onOpenChange={setMoreOpen}
          initialSubView={moreSubView}
          onSwitchInterface={() => setClassicMode((prev) => !prev)}
        />

        <SessionSheet
          session={selectedSession}
          open={sessionOpen}
          onOpenChange={setSessionOpen}
        />
      </div>
    </ShellContext.Provider>
  );
}

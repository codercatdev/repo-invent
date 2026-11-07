"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BookOpen,
  Calendar,
  Flame,
  House,
  LogIn,
  LogOut,
  Maximize2,
  Menu,
  Moon,
  PartyPopper,
  Smartphone,
  Sparkles,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { McpAssistantSheet } from "@/components/mcp-assistant-sheet";
import { MoreSheet } from "@/components/more-sheet";
import { SessionSheet } from "@/components/session-sheet";
import { cn } from "@/lib/utils";
import type { ReinventSession } from "@/lib/types";

interface ShellContextValue {
  openMcp: (initialPrompt?: string) => void;
  openMore: (
    subView?:
      | "main"
      | "surveys"
      | "profile"
      | "badge"
      | "faqs"
      | "sponsors"
      | "disclosures"
      | "events",
  ) => void;
  openSession: (session: ReinventSession) => void;
  signedIn: boolean;
  refreshAuth: () => void;
}

const ShellContext = createContext<ShellContextValue>({
  openMcp: () => {},
  openMore: () => {},
  openSession: () => {},
  signedIn: false,
  refreshAuth: () => {},
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
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpPrompt, setMcpPrompt] = useState<string | undefined>(undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSubView, setMoreSubView] = useState<
    "main" | "surveys" | "profile" | "badge" | "faqs" | "sponsors" | "disclosures" | "events"
  >("main");
  const [selectedSession, setSelectedSession] = useState<ReinventSession | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);

  function refreshAuth() {
    fetch("/api/session")
      .then((r) => r.json())
      .then((d: { signedIn?: boolean }) => setSignedIn(Boolean(d.signedIn)))
      .catch(() => setSignedIn(false));
  }

  useEffect(() => {
    setMounted(true);
    refreshAuth();
    const onAuth = () => refreshAuth();
    window.addEventListener("repo-invent:auth-updated", onAuth);
    return () => window.removeEventListener("repo-invent:auth-updated", onAuth);
  }, []);

  function openMcp(prompt?: string) {
    setMcpPrompt(prompt);
    setMcpOpen(true);
  }

  function openMore(
    subView:
      | "main"
      | "surveys"
      | "profile"
      | "badge"
      | "faqs"
      | "sponsors"
      | "disclosures"
      | "events" = "main",
  ) {
    setMoreSubView(subView);
    setMoreOpen(true);
  }

  function openSession(session: ReinventSession) {
    setSelectedSession(session);
    setSessionOpen(true);
  }

  return (
    <ShellContext.Provider
      value={{
        openMcp,
        openMore,
        openSession,
        signedIn,
        refreshAuth,
      }}
    >
      <div
        className={cn(
          "min-h-dvh w-full overflow-x-hidden bg-background text-foreground transition-all",
          mobilePreview
            ? "mx-auto my-2 max-w-[460px] rounded-3xl border-4 border-border shadow-tactile-lg"
            : "w-full",
        )}
      >
        {/* Top Gamified Navigation Header */}
        <header className="sticky top-0 z-30 border-b-2 border-border bg-background/95 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Link href="/" className="flex min-w-0 items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl border-2 border-primary bg-primary text-xs font-black text-primary-foreground shadow-tactile-primary sm:size-10 sm:text-sm">
                  re:
                </span>
                <div className="min-w-0 leading-tight">
                  <span className="block truncate font-heading text-base font-black tracking-tight sm:text-lg">
                    repo:Invent <span className="text-primary">2026</span>
                  </span>
                  <span className="block truncate text-[10px] font-semibold text-muted-foreground sm:text-[11px]">
                    Nov 30 – Dec 4 • Las Vegas
                  </span>
                </div>
              </Link>

              {/* Desktop Navigation Links */}
              {!mobilePreview ? (
                <nav
                  aria-label="Desktop navigation"
                  className="ml-4 hidden items-center gap-2 md:flex"
                >
                  {TABS.map((tab) => {
                    const active =
                      tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
                    const Icon = tab.icon;
                    return (
                      <Link
                        key={tab.href}
                        href={tab.href}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-2xl border-2 px-3.5 py-1.5 text-xs font-extrabold transition-all",
                          active
                            ? "border-primary bg-primary text-primary-foreground shadow-tactile-primary"
                            : "border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                        <span>{tab.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openMore("surveys")}
                title="Gap Closure Quest & Surveys"
                className="chip-tactile hidden sm:inline-flex"
              >
                <Flame className="size-4 fill-amber-400 text-amber-500" />
                <span>Quest XP</span>
              </button>

              {signedIn ? (
                <Link href="/logout">
                  <Button variant="secondary" size="sm" title="Signed in to AWS Builder ID — Click to Sign Out" className="px-2.5 sm:px-3">
                    <LogOut className="size-3.5" />
                    <span className="hidden sm:inline">Sign Out</span>
                  </Button>
                </Link>
              ) : (
                <Link href="/login">
                  <Button variant="default" size="sm" title="Sign in with AWS Builder ID" className="px-2.5 sm:px-3">
                    <LogIn className="size-3.5" />
                    <span className="hidden sm:inline">Sign In</span>
                  </Button>
                </Link>
              )}

              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setMobilePreview((p) => !p)}
                title={mobilePreview ? "Switch to Fullscreen View" : "Preview Mobile Frame"}
                aria-label="Toggle mobile or fullscreen view"
                className="hidden sm:inline-flex"
              >
                {mobilePreview ? (
                  <Maximize2 className="size-4" />
                ) : (
                  <Smartphone className="size-4" />
                )}
              </Button>

              {mounted ? (
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                  aria-label="Toggle color theme"
                  title="Toggle Light / Dark Theme"
                >
                  {resolvedTheme === "dark" ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                </Button>
              ) : null}

              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => openMore("main")}
                aria-label="Open More menu"
              >
                <Menu className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content Container (Full-width responsive up to 7xl, or mobile frame) */}
        <main
          className={cn(
            "mx-auto w-full pb-28 pt-5",
            mobilePreview ? "max-w-[460px] px-4" : "max-w-7xl px-4 sm:px-6 lg:px-8",
          )}
        >
          {children}
        </main>

        {/* Bottom Navigation Bar + Tactile Floating MCP Agent Button (✦) */}
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-30 mx-auto flex items-end justify-between gap-3 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3",
            mobilePreview ? "max-w-[460px]" : "max-w-7xl sm:px-6 lg:px-8",
          )}
        >
          <nav
            aria-label="Bottom Navigation"
            className={cn(
              "grid flex-1 grid-cols-4 rounded-2xl border-2 border-border bg-card px-2 py-2 shadow-tactile",
              !mobilePreview ? "md:max-w-md" : "",
            )}
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
                    "flex flex-col items-center justify-center gap-1 rounded-xl py-1 text-xs font-extrabold transition-all",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 2} aria-hidden />
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
            className="btn-tactile-accent flex h-14 items-center gap-2 px-4 text-sm"
          >
            <Sparkles className="size-5" strokeWidth={2.3} />
            <span className="hidden sm:inline">Ask MCP Agent</span>
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

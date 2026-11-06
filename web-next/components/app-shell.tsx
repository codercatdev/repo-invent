"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, House, LibraryBig, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The frame every screen sits in: a small title bar, the page, and the tab bar.
 *
 * The tabs are real routes, not hash changes, so each one is linkable,
 * bookmarkable, and survives a reload. The active state comes from the path,
 * which means a shared link shows the right tab.
 */
const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/catalog", label: "Catalog", icon: LibraryBig },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/parties", label: "Parties", icon: PartyPopper },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            <span className="text-primary">re:</span>Invent 2026
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 backdrop-blur-md"
      >
        <div className="mx-auto grid w-full max-w-[560px] grid-cols-4">
          {TABS.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2 text-[11px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-[22px]" strokeWidth={1.8} aria-hidden />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

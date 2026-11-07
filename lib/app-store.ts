"use client";

import type { ScanResult } from "./types";

const LOCAL_FAVS_KEY = "repo-invent:favorites:v1";
const LOCAL_BLOCKS_KEY = "repo-invent:blocks:v1";
const LOCAL_REFLECTIONS_KEY = "repo-invent:reflections:v1";
const LAST_SCAN_KEY = "repo-invent:last-scan:v1";

export interface LocalReflection {
  sessionId: string;
  title: string;
  rating: number;
  note: string;
  updatedAt: string;
}

export interface LocalPersonalBlock {
  id: string;
  title: string;
  start: string;
  end: string;
  venue: string;
}

export function getLocalFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_FAVS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function toggleLocalFavorite(sessionId: string): { added: boolean; all: string[] } {
  const current = new Set(getLocalFavorites());
  let added = false;
  if (current.has(sessionId)) {
    current.delete(sessionId);
  } else {
    current.add(sessionId);
    added = true;
  }
  const all = [...current];
  try {
    window.localStorage.setItem(LOCAL_FAVS_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent("repo-invent:schedule-updated"));
  } catch {
    // ignore storage errors
  }
  return { added, all };
}

export function addLocalFavorite(sessionId: string): string[] {
  const current = new Set(getLocalFavorites());
  current.add(sessionId);
  const all = [...current];
  try {
    window.localStorage.setItem(LOCAL_FAVS_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent("repo-invent:schedule-updated"));
  } catch {
    // ignore
  }
  return all;
}

export function removeLocalFavorite(sessionId: string): string[] {
  const current = new Set(getLocalFavorites());
  current.delete(sessionId);
  const all = [...current];
  try {
    window.localStorage.setItem(LOCAL_FAVS_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent("repo-invent:schedule-updated"));
  } catch {
    // ignore
  }
  return all;
}

export function getLocalBlocks(): LocalPersonalBlock[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_BLOCKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LocalPersonalBlock[]) : [];
  } catch {
    return [];
  }
}

export function addLocalBlock(block: Omit<LocalPersonalBlock, "id">): LocalPersonalBlock {
  const entry: LocalPersonalBlock = {
    ...block,
    id: `local-pt-${Date.now()}`,
  };
  const next = [...getLocalBlocks(), entry];
  try {
    window.localStorage.setItem(LOCAL_BLOCKS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("repo-invent:schedule-updated"));
  } catch {
    // ignore
  }
  return entry;
}

export function removeLocalBlock(id: string): void {
  const next = getLocalBlocks().filter((b) => b.id !== id);
  try {
    window.localStorage.setItem(LOCAL_BLOCKS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("repo-invent:schedule-updated"));
  } catch {
    // ignore
  }
}

export function getLocalReflections(): LocalReflection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_REFLECTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LocalReflection[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalReflection(entry: LocalReflection): LocalReflection[] {
  const list = getLocalReflections().filter((r) => r.sessionId !== entry.sessionId);
  const next = [entry, ...list];
  try {
    window.localStorage.setItem(LOCAL_REFLECTIONS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function getLastScan(): ScanResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_SCAN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ScanResult;
  } catch {
    return null;
  }
}

export function saveLastScan(scan: ScanResult): void {
  if (typeof window === "undefined") return;
  try {
    const slim: ScanResult = {
      ...scan,
      sessions: [],
    };
    window.localStorage.setItem(LAST_SCAN_KEY, JSON.stringify(slim));
    window.dispatchEvent(new CustomEvent("repo-invent:scan-updated"));
  } catch {
    // ignore
  }
}

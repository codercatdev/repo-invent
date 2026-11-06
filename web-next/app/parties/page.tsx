"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PartyCard } from "@/components/party-card";
import type { Party } from "@/lib/types";

/**
 * Parties.
 *
 * The list is long and every item carries a place and a sponsor, so the two
 * fields people actually search are both indexed here: the search box matches
 * the party name, the venue and the sponsors, and the day strip narrows it to
 * one evening.
 */
export default function PartiesPage() {
  const [parties, setParties] = useState<Party[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/parties")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("parties"))))
      .then((data: { parties: Party[] }) => {
        if (!live) return;
        setParties(data.parties ?? []);
        setDay(data.parties?.[0]?.day ?? null);
      })
      .catch(() => {
        if (live) setParties([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const days = Array.from(new Set((parties ?? []).map((party) => party.day)));
  const count = parties?.length ?? 0;

  const filtered = (parties ?? []).filter((party) => {
    const needle = query.trim().toLowerCase();
    if (needle.length > 0) {
      const haystack = [party.title, party.venue, party.address ?? "", ...party.sponsors]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return day === null || party.day === day;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Parties</h1>
        <span className="text-xs text-muted-foreground">
          {parties === null ? "loading" : `${count} parties, ${days.length} nights`}
        </span>
      </div>

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search a party, sponsor or place"
        aria-label="Search parties"
        type="search"
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={value === day ? "default" : "secondary"}
            className="h-8 shrink-0 rounded-full px-3 text-xs"
            onClick={() => setDay(value)}
          >
            {value}
          </Button>
        ))}
      </div>

      {parties === null ? (
        Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)
      ) : parties.length === 0 ? (
        <p className="text-sm text-muted-foreground">The party list could not load.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing matches that on this day.</p>
      ) : (
        filtered.map((party) => <PartyCard key={`${party.date}-${party.title}-${party.timeLabel}`} party={party} />)
      )}
    </div>
  );
}

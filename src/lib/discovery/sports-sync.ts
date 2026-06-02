import "server-only";

import { getDb } from "@/db";
import { discoverySportsCache } from "@/db/schema";
import type {
  CachedSportEvent,
  SportEventTier,
  SportsEventsCachePayload,
} from "@/lib/discovery/sports-types";
import { normalizeDiscoveryTitle } from "@/lib/discovery/normalize-title";
import { eq } from "drizzle-orm";

const MMA_API = "https://api.balldontlie.io/mma/v1";

type MmaEventRow = {
  id: number;
  name?: string;
  short_name?: string | null;
  date?: string;
  venue_name?: string | null;
  venue_city?: string | null;
  status?: string | null;
  main_card_start_time?: string | null;
  prelims_start_time?: string | null;
  league?: { name?: string; abbreviation?: string | null } | null;
};

type MmaEventsResponse = {
  data?: MmaEventRow[];
};

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function eventKeywords(row: MmaEventRow): string[] {
  const parts = new Set<string>();
  const push = (s?: string | null) => {
    const n = normalizeDiscoveryTitle(s || "");
    if (n.length >= 2) parts.add(n);
  };
  push(row.name);
  push(row.short_name);
  const name = (row.name || "").toLowerCase();
  if (name.includes("ufc")) parts.add("ufc");
  if (name.includes("fight night")) parts.add("fight night");
  return [...parts];
}

function mapEvent(row: MmaEventRow): CachedSportEvent | null {
  if (!row.id || !row.name?.trim() || !row.date) return null;
  const startsAt = row.main_card_start_time || row.prelims_start_time || undefined;
  const tier: SportEventTier = /ufc\s+\d+/i.test(row.name)
    ? "main"
    : /fight night/i.test(row.name)
      ? "card"
      : "other";
  const venue = [row.venue_name, row.venue_city].filter(Boolean).join(", ");
  return {
    id: String(row.id),
    title: row.name.trim(),
    shortTitle: row.short_name?.trim() || undefined,
    date: row.date,
    startsAt,
    tier,
    league: row.league?.name || row.league?.abbreviation || "MMA",
    venue: venue || undefined,
    status: row.status || undefined,
    keywords: eventKeywords(row),
  };
}

async function fetchEventsForDate(
  date: string,
  apiKey: string
): Promise<CachedSportEvent[]> {
  const res = await fetch(
    `${MMA_API}/events?date=${encodeURIComponent(date)}&per_page=100`,
    {
      headers: { Authorization: apiKey },
      next: { revalidate: 0 },
    }
  );
  if (res.status === 429) {
    throw new Error("BALLDONTLIE rate limit (free tier: 5 req/min)");
  }
  if (!res.ok) {
    throw new Error(`BALLDONTLIE events ${date} failed: ${res.status}`);
  }
  const body = (await res.json()) as MmaEventsResponse;
  const out: CachedSportEvent[] = [];
  for (const row of body.data ?? []) {
    const ev = mapEvent(row);
    if (ev) out.push(ev);
  }
  return out;
}

export type SyncSportsEventsResult = {
  region: string;
  eventCount: number;
  syncedAt: Date;
};

export async function syncSportsEventsToDb(
  region = "US"
): Promise<SyncSportsEventsResult | null> {
  const apiKey = process.env.BALLDONTLIE_API_KEY?.trim();
  if (!apiKey) return null;

  const now = new Date();
  const today = formatYmd(now);
  const tomorrow = formatYmd(new Date(now.getTime() + 86_400_000));

  /** Free tier: 5 req/min — fetch today, then tomorrow sequentially. */
  const todayEvents = await fetchEventsForDate(today, apiKey);
  await new Promise((r) => setTimeout(r, 250));
  const tomorrowEvents = await fetchEventsForDate(tomorrow, apiKey);

  const byId = new Map<string, CachedSportEvent>();
  for (const ev of [...todayEvents, ...tomorrowEvents]) {
    byId.set(ev.id, ev);
  }
  const events = [...byId.values()].sort((a, b) => {
    const ad = a.startsAt || `${a.date}T00:00:00Z`;
    const bd = b.startsAt || `${b.date}T00:00:00Z`;
    return ad.localeCompare(bd);
  });

  const db = getDb();
  const syncedAt = new Date();
  const id = `mma:${region}`;
  const payload: SportsEventsCachePayload = { events };

  const existing = await db
    .select()
    .from(discoverySportsCache)
    .where(eq(discoverySportsCache.id, id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(discoverySportsCache)
      .set({ payloadJson: JSON.stringify(payload), syncedAt })
      .where(eq(discoverySportsCache.id, id));
  } else {
    await db.insert(discoverySportsCache).values({
      id,
      region,
      payloadJson: JSON.stringify(payload),
      syncedAt,
    });
  }

  return { region, eventCount: events.length, syncedAt };
}

export async function readSportsEventsFromDb(
  region = "US"
): Promise<{ events: CachedSportEvent[]; syncedAt: Date | null }> {
  const db = getDb();
  const rows = await db.select().from(discoverySportsCache);
  const row =
    rows.find((r) => r.id === `mma:${region}`) ?? rows.find((r) => r.id.startsWith("mma:"));
  if (!row) return { events: [], syncedAt: null };
  try {
    const payload = JSON.parse(row.payloadJson) as SportsEventsCachePayload;
    return { events: payload.events ?? [], syncedAt: row.syncedAt };
  } catch {
    return { events: [], syncedAt: row.syncedAt };
  }
}

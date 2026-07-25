import { POLY } from "./config";

export async function polyGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": POLY.ua,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  return res.json() as Promise<T>;
}

export function parseJsonField<T>(val: unknown): T | null {
  if (val == null) return null;
  if (typeof val === "object") return val as T;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  }
  return null;
}

export type GammaMarket = {
  question?: string;
  groupItemTitle?: string;
  slug?: string;
  endDate?: string;
  endDateIso?: string;
  closed?: boolean;
  active?: boolean;
  clobTokenIds?: string | string[];
  outcomePrices?: string | string[];
  volume?: string | number;
  volume24hr?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  spread?: number;
  bestBid?: number;
  bestAsk?: number;
};

export type GammaEvent = {
  id?: string;
  title?: string;
  slug?: string;
  volume?: number;
  volume24hr?: number;
  markets?: GammaMarket[];
};

export type ClobBook = {
  bids?: Array<{ price: string; size: string }>;
  asks?: Array<{ price: string; size: string }>;
};

export async function fetchEvents(limit: number): Promise<GammaEvent[]> {
  const seen = new Map<string, GammaEvent>();
  for (const order of ["volume24hr", "volume"] as const) {
    let offset = 0;
    while (seen.size < limit * 2 && offset < limit * 2) {
      const n = Math.min(50, limit);
      const qs = new URLSearchParams({
        active: "true",
        closed: "false",
        limit: String(n),
        offset: String(offset),
        order,
        ascending: "false",
      });
      const batch = await polyGet<GammaEvent[]>(`${POLY.gamma}/events?${qs}`);
      if (!batch?.length) break;
      for (const ev of batch) {
        const key = String(ev.id || ev.slug || "");
        if (key && !seen.has(key)) seen.set(key, ev);
      }
      offset += batch.length;
      if (batch.length < n) break;
    }
  }
  return [...seen.values()]
    .sort(
      (a, b) =>
        (b.volume24hr || 0) + 0.05 * (b.volume || 0) -
        ((a.volume24hr || 0) + 0.05 * (a.volume || 0)),
    )
    .slice(0, limit);
}

export async function fetchBook(tokenId: string): Promise<ClobBook> {
  return polyGet<ClobBook>(
    `${POLY.clob}/book?token_id=${encodeURIComponent(tokenId)}`,
  );
}

export function tokenIds(m: GammaMarket): { yes: string; no: string } | null {
  const ids = parseJsonField<string[]>(m.clobTokenIds);
  if (!ids || ids.length < 2) return null;
  return { yes: String(ids[0]), no: String(ids[1]) };
}

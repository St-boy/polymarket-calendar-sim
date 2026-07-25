import { CONFIG } from "./config";
import {
  bestBidAsk,
  capacityUsd,
  parseLevels,
} from "./orderbook";
import {
  fetchBook,
  fetchEvents,
  parseJsonField,
  tokenIds,
  type GammaEvent,
  type GammaMarket,
} from "./polymarket";
import type { CurveType, Opportunity } from "./types";

const SKIP_RE =
  /\b(vs\.?|spread|o\/u|moneyline|mlb|nba|nfl|nhl|ufc|epl|mls)\b/i;
const BY_RE = /\b(by\s+\.\.\.|by\s+\?|by\b|before\b|prior to\b)/i;
const THROUGH_RE =
  /\b(through|continues through|holds through|still|remain(?:s|ing)?)\b/i;

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function curveType(event: GammaEvent): CurveType | null {
  const blob = [
    event.title || "",
    event.slug || "",
    ...(event.markets || []).slice(0, 4).map((m) => m.question || ""),
  ].join(" ");
  if (SKIP_RE.test(blob)) return null;
  if (THROUGH_RE.test(blob) && !BY_RE.test(event.title || "")) return "through";
  if (BY_RE.test(blob) || /\bby\b/i.test(event.title || "")) return "by";
  return null;
}

export function parseEventDate(
  text: string,
  defaultYear = new Date().getUTCFullYear(),
): Date | null {
  if (!text) return null;
  const iso = text.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return new Date(
      Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])),
    );
  }
  const m = text.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?/i,
  );
  if (!m) return null;
  const key = m[1].toLowerCase();
  const month = MONTHS[key] || MONTHS[key.slice(0, 3)];
  if (!month) return null;
  const day = Number(m[2]);
  const year = m[3] ? Number(m[3]) : defaultYear;
  return new Date(Date.UTC(year, month - 1, day));
}

function label(m: GammaMarket) {
  return m.groupItemTitle || m.question || m.slug || "unknown";
}

function marketTs(m: GammaMarket): number | null {
  for (const t of [m.groupItemTitle, m.question, m.slug]) {
    const d = parseEventDate(String(t || ""));
    if (d) return d.getTime() / 1000;
  }
  if (m.endDate || m.endDateIso) {
    const d = new Date(String(m.endDate || m.endDateIso));
    if (!Number.isNaN(d.getTime())) return d.getTime() / 1000;
  }
  return null;
}

function openDated(event: GammaEvent): GammaMarket[] {
  const now = Date.now() / 1000;
  const ms: GammaMarket[] = [];
  for (const m of event.markets || []) {
    if (m.closed || m.active === false) continue;
    if (!tokenIds(m)) continue;
    const ts = marketTs(m);
    if (ts == null || ts < now - 86400) continue;
    ms.push(m);
  }
  ms.sort((a, b) => (marketTs(a) || 0) - (marketTs(b) || 0));
  const seen = new Set<number>();
  const uniq: GammaMarket[] = [];
  for (const m of ms) {
    const day = Math.floor((marketTs(m) || 0) / 86400);
    if (seen.has(day)) continue;
    seen.add(day);
    uniq.push(m);
  }
  return uniq;
}

/**
 * Executable edge from live books:
 * by:      edge ≈ nearBid - farAsk  (sell near YES / buy far YES)
 * through: edge ≈ farBid - nearAsk
 */
export function executableEdge(
  curve: CurveType,
  near: { bid: number; ask: number },
  far: { bid: number; ask: number },
): number {
  if (curve === "by") return near.bid - far.ask;
  return far.bid - near.ask;
}

export async function findOpportunities(
  watchKeys: Set<string> = new Set(),
): Promise<Opportunity[]> {
  const events = await fetchEvents(CONFIG.maxEvents);
  const opps: Opportunity[] = [];

  for (const ev of events) {
    const curve = curveType(ev);
    if (!curve) continue;
    const legs = openDated(ev);
    if (legs.length < 2) continue;

    const pairs: Array<[GammaMarket, GammaMarket]> = [];
    for (let i = 0; i < legs.length - 1; i++) pairs.push([legs[i], legs[i + 1]]);
    if (legs.length >= 3) pairs.push([legs[0], legs[legs.length - 1]]);

    const seen = new Set<string>();
    for (const [near, far] of pairs) {
      const nt = tokenIds(near);
      const ft = tokenIds(far);
      if (!nt || !ft) continue;
      const nts = marketTs(near);
      const fts = marketTs(far);
      if (!nts || !fts || nts >= fts) continue;
      const key = `${nt.yes}:${ft.yes}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const slug = ev.slug || "";
      const pairWatchKey = `${slug}|${label(near)}|${label(far)}|${curve}`;
      const watched = watchKeys.has(pairWatchKey);

      // Cheap mid prefilter — still always refresh books for open positions
      if (!watched) {
        const np = parseJsonField<string[]>(near.outcomePrices);
        const fp = parseJsonField<string[]>(far.outcomePrices);
        if (np?.[0] != null && fp?.[0] != null) {
          const nMid = Number(np[0]);
          const fMid = Number(fp[0]);
          const midEdge = curve === "by" ? nMid - fMid : fMid - nMid;
          if (midEdge < CONFIG.entryThresh - 0.015) continue;
        }
      }

      let nearBook;
      let farBook;
      try {
        nearBook = await fetchBook(nt.yes);
        await sleep(CONFIG.scanSleepMs);
        farBook = await fetchBook(ft.yes);
        await sleep(CONFIG.scanSleepMs);
      } catch {
        continue;
      }

      const nearBa = bestBidAsk(nearBook);
      const farBa = bestBidAsk(farBook);
      const edge = executableEdge(curve, nearBa, farBa);

      const nearAsks = parseLevels(nearBook.asks, "asks");
      const nearBids = parseLevels(nearBook.bids, "bids");
      const farAsks = parseLevels(farBook.asks, "asks");
      const farBids = parseLevels(farBook.bids, "bids");

      let capA = 0;
      let capB = 0;
      let hint = "";
      if (curve === "by") {
        // buy far YES asks + sell near YES bids
        capA = capacityUsd(farAsks, "buy", CONFIG.capacitySlip);
        capB = capacityUsd(nearBids, "sell", CONFIG.capacitySlip);
        hint = "买远端YES(吃ask) + 卖近端YES(吃bid)";
      } else {
        capA = capacityUsd(nearAsks, "buy", CONFIG.capacitySlip);
        capB = capacityUsd(farBids, "sell", CONFIG.capacitySlip);
        hint = "买近端YES(吃ask) + 卖远端YES(吃bid)";
      }
      const capacityUsdVal = Math.min(capA, capB);

      const nEnd = new Date(nts * 1000).toISOString().slice(0, 10);
      const fEnd = new Date(fts * 1000).toISOString().slice(0, 10);

      opps.push({
        event: ev.title || slug,
        eventSlug: slug,
        eventUrl: slug ? `https://polymarket.com/event/${slug}` : "",
        curve,
        nearLabel: label(near),
        farLabel: label(far),
        nearQuestion: near.question || "",
        farQuestion: far.question || "",
        nearEnd: nEnd,
        farEnd: fEnd,
        nearYesToken: nt.yes,
        farYesToken: ft.yes,
        nearNoToken: nt.no,
        farNoToken: ft.no,
        execEdge: edge,
        nearBid: nearBa.bid,
        nearAsk: nearBa.ask,
        farBid: farBa.bid,
        farAsk: farBa.ask,
        capacityUsd: capacityUsdVal,
        tradeHint: hint,
      });
    }
  }

  return opps.sort((a, b) => b.execEdge - a.execEdge);
}

export function sizeUsdFor(capacityUsdVal: number, bankroll: number): number {
  const thin = capacityUsdVal < CONFIG.thinCapUsd;
  const thick = capacityUsdVal >= CONFIG.thickCapUsd;
  if (thin) {
    return Math.min(
      bankroll * CONFIG.bankrollDeploy.thin,
      capacityUsdVal * CONFIG.depthDeploy.thin,
      CONFIG.thinMaxUsd,
    );
  }
  if (thick) {
    return Math.min(
      bankroll * CONFIG.bankrollDeploy.thick,
      capacityUsdVal * CONFIG.depthDeploy.thick,
    );
  }
  return Math.min(
    bankroll * CONFIG.bankrollDeploy.normal,
    capacityUsdVal * CONFIG.depthDeploy.normal,
  );
}

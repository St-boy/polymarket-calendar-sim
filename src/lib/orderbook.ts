import type { BookLevel, FillResult } from "./types";

export function parseLevels(
  raw: Array<{ price: string; size: string }> | undefined,
  side: "bids" | "asks",
): BookLevel[] {
  const levels = (raw || []).map((x) => ({
    price: Number(x.price),
    size: Number(x.size),
  }));
  if (side === "asks") levels.sort((a, b) => a.price - b.price);
  else levels.sort((a, b) => b.price - a.price);
  return levels.filter((l) => l.price > 0 && l.size > 0);
}

/** Walk book to buy `shares` (takes asks) or sell `shares` (hits bids). */
export function fillShares(
  levels: BookLevel[],
  side: "buy" | "sell",
  shares: number,
): FillResult {
  if (shares <= 0 || levels.length === 0) {
    return {
      ok: false,
      shares: 0,
      usd: 0,
      avgPrice: 0,
      bestPrice: 0,
      worstPrice: 0,
      slippage: 0,
      levelsUsed: 0,
      reason: "empty book or zero size",
    };
  }
  const best = levels[0].price;
  let left = shares;
  let got = 0;
  let usd = 0;
  let worst = best;
  let used = 0;
  for (const lv of levels) {
    const take = Math.min(left, lv.size);
    usd += take * lv.price;
    got += take;
    left -= take;
    worst = lv.price;
    used += 1;
    if (left <= 1e-9) break;
  }
  if (got < shares * 0.999) {
    return {
      ok: false,
      shares: got,
      usd,
      avgPrice: got ? usd / got : 0,
      bestPrice: best,
      worstPrice: worst,
      slippage: Math.abs((got ? usd / got : best) - best),
      levelsUsed: used,
      reason: `insufficient depth: need ${shares}, got ${got}`,
    };
  }
  const avg = usd / got;
  return {
    ok: true,
    shares: got,
    usd,
    avgPrice: avg,
    bestPrice: best,
    worstPrice: worst,
    slippage: Math.abs(avg - best),
    levelsUsed: used,
  };
}

/** Max USD notional fillable within absolute slip from best. */
export function capacityUsd(
  levels: BookLevel[],
  side: "buy" | "sell",
  slipCap: number,
): number {
  if (!levels.length) return 0;
  const best = levels[0].price;
  const limit = side === "buy" ? best + slipCap : best - slipCap;
  let usd = 0;
  for (const lv of levels) {
    if (side === "buy" && lv.price > limit + 1e-12) break;
    if (side === "sell" && lv.price < limit - 1e-12) break;
    usd += lv.price * lv.size;
  }
  return usd;
}

export function bestBidAsk(book: {
  bids?: Array<{ price: string; size: string }>;
  asks?: Array<{ price: string; size: string }>;
}): { bid: number; ask: number } {
  const bids = parseLevels(book.bids, "bids");
  const asks = parseLevels(book.asks, "asks");
  return {
    bid: bids[0]?.price ?? 0,
    ask: asks[0]?.price ?? 1,
  };
}

import { CONFIG } from "./config";
import { fillShares, parseLevels } from "./orderbook";
import { fetchBook } from "./polymarket";
import { sizeUsdFor } from "./strategy";
import type { LegFill, Opportunity, Position } from "./types";

function id() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function bookSides(tokenId: string) {
  const book = await fetchBook(tokenId);
  return {
    asks: parseLevels(book.asks, "asks"),
    bids: parseLevels(book.bids, "bids"),
  };
}

/**
 * Target shares from notional: for calendar pair, approximate capital per share
 * ≈ avg(buyPrice) for the buy leg (conservative uses buy leg ask).
 */
export async function openPosition(
  opp: Opportunity,
  bankroll: number,
): Promise<{ position?: Position; error?: string }> {
  const notional = sizeUsdFor(opp.capacityUsd, bankroll);
  if (notional < CONFIG.minTradeUsd) {
    return { error: `size too small $${notional.toFixed(2)}` };
  }

  if (opp.curve === "by") {
    const far = await bookSides(opp.farYesToken);
    const near = await bookSides(opp.nearYesToken);
    if (!far.asks[0] || !near.bids[0]) {
      return { error: "missing book levels" };
    }
    // shares limited by USD on buy leg and depth on both
    const estBuy = far.asks[0].price;
    let shares = notional / Math.max(estBuy, 0.01);
    // refine by available depth within capacity slip already reflected in capacityUsd
    const buyFill = fillShares(far.asks, "buy", shares);
    const sellFill = fillShares(near.bids, "sell", shares);
    if (!buyFill.ok || !sellFill.ok) {
      // downsize to min available
      shares = Math.min(buyFill.shares || 0, sellFill.shares || 0);
      if (shares * estBuy < CONFIG.minTradeUsd) {
        return {
          error: `depth insufficient: ${buyFill.reason || ""} ${sellFill.reason || ""}`,
        };
      }
    }
    const buy = fillShares(far.asks, "buy", shares);
    const sell = fillShares(near.bids, "sell", shares);
    if (!buy.ok || !sell.ok) {
      return { error: "fill failed after resize" };
    }
    // post-trade edge check using actual avg prices: sell near - buy far
    const realizedEntryEdge = sell.avgPrice - buy.avgPrice;
    if (realizedEntryEdge < CONFIG.minEdgeAfterSlip) {
      return {
        error: `edge after book fill too small: ${(realizedEntryEdge * 100).toFixed(2)}c`,
      };
    }

    const entryLegs: LegFill[] = [
      {
        tokenId: opp.farYesToken,
        outcome: "YES",
        side: "buy",
        role: "far",
        shares: buy.shares,
        avgPrice: buy.avgPrice,
        bestPrice: buy.bestPrice,
        worstPrice: buy.worstPrice,
        slippage: buy.slippage,
        usd: buy.usd,
        levelsUsed: buy.levelsUsed,
      },
      {
        tokenId: opp.nearYesToken,
        outcome: "YES",
        side: "sell",
        role: "near",
        shares: sell.shares,
        avgPrice: sell.avgPrice,
        bestPrice: sell.bestPrice,
        worstPrice: sell.worstPrice,
        slippage: sell.slippage,
        usd: sell.usd,
        levelsUsed: sell.levelsUsed,
      },
    ];
    // Cash: pay for buy, receive for sell
    const entryCostUsd = buy.usd - sell.usd;

    const position: Position = {
      id: id(),
      status: "open",
      openedAt: new Date().toISOString(),
      opportunity: opp,
      targetShares: buy.shares,
      entryLegs,
      entryCostUsd,
      markProceedsUsd: 0,
      unrealizedPnlUsd: 0,
      entryExecEdge: realizedEntryEdge,
    };
    await markPosition(position);
    return { position };
  }

  // through: buy near YES, sell far YES
  const near = await bookSides(opp.nearYesToken);
  const far = await bookSides(opp.farYesToken);
  if (!near.asks[0] || !far.bids[0]) return { error: "missing book levels" };
  const estBuy = near.asks[0].price;
  let shares = notional / Math.max(estBuy, 0.01);
  let buy = fillShares(near.asks, "buy", shares);
  let sell = fillShares(far.bids, "sell", shares);
  if (!buy.ok || !sell.ok) {
    shares = Math.min(buy.shares || 0, sell.shares || 0);
    if (shares * estBuy < CONFIG.minTradeUsd) {
      return { error: "depth insufficient (through)" };
    }
    buy = fillShares(near.asks, "buy", shares);
    sell = fillShares(far.bids, "sell", shares);
  }
  if (!buy.ok || !sell.ok) return { error: "fill failed (through)" };
  const realizedEntryEdge = sell.avgPrice - buy.avgPrice;
  if (realizedEntryEdge < CONFIG.minEdgeAfterSlip) {
    return {
      error: `edge after book fill too small: ${(realizedEntryEdge * 100).toFixed(2)}c`,
    };
  }
  const entryLegs: LegFill[] = [
    {
      tokenId: opp.nearYesToken,
      outcome: "YES",
      side: "buy",
      role: "near",
      shares: buy.shares,
      avgPrice: buy.avgPrice,
      bestPrice: buy.bestPrice,
      worstPrice: buy.worstPrice,
      slippage: buy.slippage,
      usd: buy.usd,
      levelsUsed: buy.levelsUsed,
    },
    {
      tokenId: opp.farYesToken,
      outcome: "YES",
      side: "sell",
      role: "far",
      shares: sell.shares,
      avgPrice: sell.avgPrice,
      bestPrice: sell.bestPrice,
      worstPrice: sell.worstPrice,
      slippage: sell.slippage,
      usd: sell.usd,
      levelsUsed: sell.levelsUsed,
    },
  ];
  const position: Position = {
    id: id(),
    status: "open",
    openedAt: new Date().toISOString(),
    opportunity: opp,
    targetShares: buy.shares,
    entryLegs,
    entryCostUsd: buy.usd - sell.usd,
    markProceedsUsd: 0,
    unrealizedPnlUsd: 0,
    entryExecEdge: realizedEntryEdge,
  };
  await markPosition(position);
  return { position };
}

/** Mark open position to market by reversing on the book. */
export async function markPosition(pos: Position): Promise<void> {
  const shares = pos.targetShares;
  let proceeds = 0;
  for (const leg of pos.entryLegs) {
    const sides = await bookSides(leg.tokenId);
    if (leg.side === "buy") {
      // close by selling on bids
      const fill = fillShares(sides.bids, "sell", shares);
      proceeds += fill.ok ? fill.usd : (sides.bids[0]?.price || 0) * shares;
    } else {
      // close short by buying back on asks
      const fill = fillShares(sides.asks, "buy", shares);
      proceeds -= fill.ok ? fill.usd : (sides.asks[0]?.price || 1) * shares;
    }
  }
  pos.markProceedsUsd = proceeds;
  // entryCostUsd = cash out at open (buy - sell). PnL = -entryCost + closeProceeds net
  // At open cashDelta = -entryCostUsd (since entryCost = buy - sell)
  // At close cashDelta = proceeds (sell longs - buy back shorts)
  // Total pnl = -entryCostUsd + markProceeds
  pos.unrealizedPnlUsd = proceeds - pos.entryCostUsd;
}

export async function closePosition(
  pos: Position,
  reason: string,
  exitExecEdge: number,
): Promise<{ ok: boolean; error?: string }> {
  const shares = pos.targetShares;
  const exitLegs: LegFill[] = [];
  let proceeds = 0;

  for (const leg of pos.entryLegs) {
    const sides = await bookSides(leg.tokenId);
    if (leg.side === "buy") {
      const fill = fillShares(sides.bids, "sell", shares);
      if (!fill.ok) {
        return { ok: false, error: `close sell fail: ${fill.reason}` };
      }
      exitLegs.push({
        tokenId: leg.tokenId,
        outcome: leg.outcome,
        side: "sell",
        role: leg.role,
        shares: fill.shares,
        avgPrice: fill.avgPrice,
        bestPrice: fill.bestPrice,
        worstPrice: fill.worstPrice,
        slippage: fill.slippage,
        usd: fill.usd,
        levelsUsed: fill.levelsUsed,
      });
      proceeds += fill.usd;
    } else {
      const fill = fillShares(sides.asks, "buy", shares);
      if (!fill.ok) {
        return { ok: false, error: `close buy fail: ${fill.reason}` };
      }
      exitLegs.push({
        tokenId: leg.tokenId,
        outcome: leg.outcome,
        side: "buy",
        role: leg.role,
        shares: fill.shares,
        avgPrice: fill.avgPrice,
        bestPrice: fill.bestPrice,
        worstPrice: fill.worstPrice,
        slippage: fill.slippage,
        usd: fill.usd,
        levelsUsed: fill.levelsUsed,
      });
      proceeds -= fill.usd;
    }
  }

  pos.status = "closed";
  pos.closedAt = new Date().toISOString();
  pos.exitLegs = exitLegs;
  pos.exitProceedsUsd = proceeds;
  pos.realizedPnlUsd = proceeds - pos.entryCostUsd;
  pos.unrealizedPnlUsd = 0;
  pos.markProceedsUsd = proceeds;
  pos.exitExecEdge = exitExecEdge;
  pos.closeReason = reason;
  return { ok: true };
}

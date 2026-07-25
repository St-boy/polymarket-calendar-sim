import { CONFIG } from "./config";
import { bestBidAsk } from "./orderbook";
import { closePosition, markPosition, openPosition } from "./paper";
import { fetchBook } from "./polymarket";
import { loadState, pushLog, saveState } from "./store";
import { executableEdge, findOpportunities } from "./strategy";
import type { DashboardPayload, Position, SimState } from "./types";

async function liveEdgeFor(pos: Position): Promise<number> {
  const o = pos.opportunity;
  const nearBook = await fetchBook(o.nearYesToken);
  const farBook = await fetchBook(o.farYesToken);
  return executableEdge(o.curve, bestBidAsk(nearBook), bestBidAsk(farBook));
}

function pairKey(p: Position) {
  const o = p.opportunity;
  return `${o.eventSlug}|${o.nearLabel}|${o.farLabel}|${o.curve}`;
}

function oppKey(o: {
  eventSlug: string;
  nearLabel: string;
  farLabel: string;
  curve: string;
}) {
  return `${o.eventSlug}|${o.nearLabel}|${o.farLabel}|${o.curve}`;
}

export function summarize(state: SimState): DashboardPayload["summary"] {
  const unrealized = state.positions.reduce(
    (s, p) => s + (p.unrealizedPnlUsd || 0),
    0,
  );
  const equity = state.cashUsd + unrealized;
  const wins = state.closedTrades.filter(
    (t) => (t.realizedPnlUsd || 0) > 0,
  ).length;
  const losses = state.closedTrades.filter(
    (t) => (t.realizedPnlUsd || 0) <= 0,
  ).length;
  const slipProxy = [...state.closedTrades, ...state.positions].reduce(
    (s, p) =>
      s +
      p.entryLegs.reduce((a, l) => a + l.slippage * l.shares, 0) +
      (p.exitLegs || []).reduce((a, l) => a + l.slippage * l.shares, 0),
    0,
  );
  return {
    equityUsd: equity,
    cashUsd: state.cashUsd,
    realizedPnlUsd: state.realizedPnlUsd,
    unrealizedPnlUsd: unrealized,
    openCount: state.positions.length,
    closedCount: state.closedTrades.length,
    winCount: wins,
    lossCount: losses,
    winRate: wins + losses ? wins / (wins + losses) : 0,
    totalFeesProxyUsd: slipProxy,
  };
}

export async function getDashboard(): Promise<DashboardPayload> {
  const state = await loadState();
  for (const p of state.positions) {
    try {
      await markPosition(p);
    } catch {
      /* keep last mark */
    }
  }
  return {
    state,
    summary: summarize(state),
    openMarked: state.positions,
  };
}

export async function runScan(): Promise<DashboardPayload> {
  const state = await loadState();
  const t0 = new Date().toISOString();
  pushLog(state, "Scan started (order-book executable edges)", "info");

  try {
    const watchKeys = new Set(state.positions.map(pairKey));
    const opps = await findOpportunities(watchKeys);
    const byKey = new Map(opps.map((o) => [oppKey(o), o]));

    // 1) Mark + exits
    const stillOpen: Position[] = [];
    for (const pos of state.positions) {
      await markPosition(pos);
      const live = byKey.get(pairKey(pos));
      let edge = live?.execEdge;
      if (edge == null) {
        try {
          edge = await liveEdgeFor(pos);
        } catch {
          edge = pos.opportunity.execEdge;
        }
      }
      const shouldExit = edge <= CONFIG.exitThresh;
      if (shouldExit) {
        const res = await closePosition(
          pos,
          `edge=${(edge * 100).toFixed(2)}c ≤ exit ${(CONFIG.exitThresh * 100).toFixed(1)}c`,
          edge,
        );
        if (res.ok) {
          // cash: at open we did cash -= entryCostUsd; at close cash += exitProceeds
          state.cashUsd += pos.exitProceedsUsd || 0;
          state.realizedPnlUsd += pos.realizedPnlUsd || 0;
          state.closedTrades.unshift(pos);
          pushLog(
            state,
            `CLOSE ${pos.opportunity.event} ${pos.opportunity.nearLabel}→${pos.opportunity.farLabel} pnl=$${(pos.realizedPnlUsd || 0).toFixed(2)}`,
            "trade",
          );
        } else {
          pushLog(state, `Close failed ${pos.id}: ${res.error}`, "warn");
          stillOpen.push(pos);
        }
      } else {
        stillOpen.push(pos);
      }
    }
    state.positions = stillOpen;

    // 2) Entries
    const openKeys = new Set(state.positions.map(pairKey));
    const candidates = opps.filter(
      (o) =>
        o.execEdge > CONFIG.entryThresh &&
        o.capacityUsd >= CONFIG.minTradeUsd &&
        !openKeys.has(oppKey(o)),
    );

    for (const opp of candidates) {
      if (state.positions.length >= CONFIG.maxOpenPositions) break;
      // available capital ≈ cash (positions already marked in equity separately)
      const bankroll = Math.max(state.cashUsd, 0);
      if (bankroll < CONFIG.minTradeUsd) break;

      const { position, error } = await openPosition(opp, bankroll);
      if (!position) {
        pushLog(
          state,
          `Skip ${opp.event} ${opp.nearLabel}→${opp.farLabel}: ${error}`,
          "warn",
        );
        continue;
      }
      state.cashUsd -= position.entryCostUsd;
      state.positions.push(position);
      openKeys.add(pairKey(position));
      pushLog(
        state,
        `OPEN ${opp.event} ${opp.nearLabel}→${opp.farLabel} edge=${(position.entryExecEdge * 100).toFixed(2)}c cost=$${position.entryCostUsd.toFixed(2)} shares=${position.targetShares.toFixed(2)}`,
        "trade",
      );
    }

    // 3) Equity point
    for (const p of state.positions) await markPosition(p);
    const summary = summarize(state);
    state.equityCurve.push({
      t: t0,
      equity: summary.equityUsd,
      cash: summary.cashUsd,
      unrealized: summary.unrealizedPnlUsd,
      realized: summary.realizedPnlUsd,
    });
    state.equityCurve = state.equityCurve.slice(-500);
    state.lastScanAt = t0;
    state.lastScanError = undefined;
    pushLog(
      state,
      `Scan done · opps=${opps.length} open=${state.positions.length} equity=$${summary.equityUsd.toFixed(2)}`,
      "info",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state.lastScanError = msg;
    pushLog(state, `Scan error: ${msg}`, "error");
  }

  await saveState(state);
  return {
    state,
    summary: summarize(state),
    openMarked: state.positions,
  };
}

export async function resetSim(): Promise<DashboardPayload> {
  const { saveState: save } = await import("./store");
  const now = new Date().toISOString();
  const state: SimState = {
    version: 1,
    createdAt: now,
    updatedAt: now,
    cashUsd: CONFIG.bankrollUsd,
    realizedPnlUsd: 0,
    positions: [],
    closedTrades: [],
    equityCurve: [
      {
        t: now,
        equity: CONFIG.bankrollUsd,
        cash: CONFIG.bankrollUsd,
        unrealized: 0,
        realized: 0,
      },
    ],
    scanLog: [
      {
        t: now,
        message: "Simulator reset",
        level: "info",
      },
    ],
    config: {
      entryThresh: CONFIG.entryThresh,
      exitThresh: CONFIG.exitThresh,
      bankrollUsd: CONFIG.bankrollUsd,
    },
  };
  await save(state);
  return getDashboard();
}

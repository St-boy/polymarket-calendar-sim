export type CurveType = "by" | "through";

export type BookLevel = { price: number; size: number };

export type FillResult = {
  ok: boolean;
  shares: number;
  usd: number;
  avgPrice: number;
  bestPrice: number;
  worstPrice: number;
  slippage: number;
  levelsUsed: number;
  reason?: string;
};

export type LegFill = {
  tokenId: string;
  outcome: "YES" | "NO";
  side: "buy" | "sell";
  role: "near" | "far";
  shares: number;
  avgPrice: number;
  bestPrice: number;
  worstPrice: number;
  slippage: number;
  usd: number;
  levelsUsed: number;
};

export type Opportunity = {
  event: string;
  eventSlug: string;
  eventUrl: string;
  curve: CurveType;
  nearLabel: string;
  farLabel: string;
  nearQuestion: string;
  farQuestion: string;
  nearEnd: string;
  farEnd: string;
  nearYesToken: string;
  farYesToken: string;
  nearNoToken: string;
  farNoToken: string;
  /** Executable edge from current books (positive = inversion) */
  execEdge: number;
  nearBid: number;
  nearAsk: number;
  farBid: number;
  farAsk: number;
  capacityUsd: number;
  tradeHint: string;
};

export type Position = {
  id: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt?: string;
  opportunity: Opportunity;
  targetShares: number;
  entryLegs: LegFill[];
  exitLegs?: LegFill[];
  entryCostUsd: number;
  exitProceedsUsd?: number;
  realizedPnlUsd?: number;
  /** Mark-to-market close proceeds if exited now */
  markProceedsUsd: number;
  unrealizedPnlUsd: number;
  entryExecEdge: number;
  exitExecEdge?: number;
  closeReason?: string;
};

export type EquityPoint = {
  t: string;
  equity: number;
  cash: number;
  unrealized: number;
  realized: number;
};

export type SimState = {
  version: 1;
  createdAt: string;
  updatedAt: string;
  lastScanAt?: string;
  lastScanError?: string;
  config: {
    entryThresh: number;
    exitThresh: number;
    bankrollUsd: number;
  };
  cashUsd: number;
  realizedPnlUsd: number;
  positions: Position[];
  closedTrades: Position[];
  equityCurve: EquityPoint[];
  scanLog: Array<{
    t: string;
    message: string;
    level: "info" | "trade" | "warn" | "error";
  }>;
};

export type DashboardPayload = {
  state: SimState;
  summary: {
    equityUsd: number;
    cashUsd: number;
    realizedPnlUsd: number;
    unrealizedPnlUsd: number;
    openCount: number;
    closedCount: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    totalFeesProxyUsd: number;
  };
  openMarked: Position[];
};

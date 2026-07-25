/** Strategy + paper-trading configuration (optimal band from threshold sweep). */
export const CONFIG = {
  /** Enter when executable edge exceeds this */
  entryThresh: 0.04,
  /** Exit when executable edge falls to this or below */
  exitThresh: 0.01,
  /** Skip if edge after modeled open slip still below this */
  minEdgeAfterSlip: 0.035,
  bankrollUsd: 2500,
  maxOpenPositions: 3,
  fidelityLookbackHours: 0, // live books only for signals
  maxEvents: 120,
  scanSleepMs: 80,
  /** Fraction of visible book depth to take (conservative) */
  depthDeploy: {
    thin: 0.35,
    normal: 0.55,
    thick: 0.6,
  },
  bankrollDeploy: {
    thin: 0.08,
    normal: 0.35,
    thick: 0.55,
  },
  thinCapUsd: 150,
  thickCapUsd: 1500,
  thinMaxUsd: 80,
  minTradeUsd: 20,
  /** Absolute slip budget when probing capacity from book */
  capacitySlip: 0.02,
} as const;

export const POLY = {
  gamma: "https://gamma-api.polymarket.com",
  clob: "https://clob.polymarket.com",
  ua: "polymarket-calendar-sim/1.0",
} as const;

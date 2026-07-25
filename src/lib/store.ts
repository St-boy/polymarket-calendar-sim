import { promises as fs } from "fs";
import path from "path";
import { CONFIG } from "./config";
import type { SimState } from "./types";

export const LOCAL_PATH = path.join(process.cwd(), "data", "sim-state.json");

function blankState(): SimState {
  const now = new Date().toISOString();
  return {
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
    scanLog: [],
    config: {
      entryThresh: CONFIG.entryThresh,
      exitThresh: CONFIG.exitThresh,
      bankrollUsd: CONFIG.bankrollUsd,
    },
  };
}

/** Public raw URL of committed state (GitHub Actions writes this file). */
export function resolveGithubStateUrl(): string | null {
  if (process.env.SIM_STATE_URL) return process.env.SIM_STATE_URL;
  const owner =
    process.env.SIM_REPO_OWNER ||
    process.env.VERCEL_GIT_REPO_OWNER ||
    process.env.GITHUB_REPOSITORY_OWNER;
  const repo =
    process.env.SIM_REPO_NAME ||
    process.env.VERCEL_GIT_REPO_SLUG ||
    process.env.GITHUB_REPOSITORY?.split("/")[1];
  const branch =
    process.env.SIM_REPO_BRANCH ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    "main";
  if (!owner || !repo) return null;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/data/sim-state.json`;
}

async function kvGet(): Promise<SimState | null> {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(`${url}/get/sim-state`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: string | null };
  if (!data.result) return null;
  return JSON.parse(data.result) as SimState;
}

async function kvSet(state: SimState): Promise<boolean> {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  const res = await fetch(`${url}/set/sim-state`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(JSON.stringify(state)),
  });
  return res.ok;
}

async function remoteGet(): Promise<SimState | null> {
  const url = resolveGithubStateUrl();
  if (!url) return null;
  const res = await fetch(`${url}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json", "User-Agent": "polymarket-calendar-sim" },
  });
  if (!res.ok) return null;
  try {
    return (await res.json()) as SimState;
  } catch {
    return null;
  }
}

async function fileGet(): Promise<SimState | null> {
  try {
    const raw = await fs.readFile(LOCAL_PATH, "utf8");
    return JSON.parse(raw) as SimState;
  } catch {
    return null;
  }
}

async function fileSet(state: SimState): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await fs.writeFile(LOCAL_PATH, JSON.stringify(state, null, 2), "utf8");
}

/**
 * Load priority:
 * 1) Upstash/KV (optional)
 * 2) Local file (Actions / local dev)
 * 3) GitHub raw URL (Vercel dashboard read path)
 * 4) Blank
 */
export async function loadState(): Promise<SimState> {
  const fromKv = await kvGet();
  if (fromKv) return fromKv;

  const fromFile = await fileGet();
  if (fromFile) return fromFile;

  const fromRemote = await remoteGet();
  if (fromRemote) return fromRemote;

  return blankState();
}

/**
 * Save priority:
 * - Always write local file when SIM_WRITE_FILE=1 (GitHub Actions) or not on Vercel
 * - Also write KV if configured
 */
export async function saveState(state: SimState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await kvSet(state);

  const onVercel = process.env.VERCEL === "1";
  const forceFile = process.env.SIM_WRITE_FILE === "1";
  if (forceFile || !onVercel) {
    await fileSet(state);
  }
}

export function pushLog(
  state: SimState,
  message: string,
  level: "info" | "trade" | "warn" | "error" = "info",
) {
  state.scanLog.unshift({ t: new Date().toISOString(), message, level });
  state.scanLog = state.scanLog.slice(0, 200);
}

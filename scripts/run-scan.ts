/**
 * CLI entry for GitHub Actions / local cron.
 * Usage: npx tsx scripts/run-scan.ts
 */
import { runScan, summarize } from "../src/lib/engine";

async function main() {
  process.env.SIM_WRITE_FILE = "1";
  console.log("[scan] starting…");
  const data = await runScan();
  const s = summarize(data.state);
  console.log(
    JSON.stringify(
      {
        lastScanAt: data.state.lastScanAt,
        lastScanError: data.state.lastScanError,
        equityUsd: s.equityUsd,
        cashUsd: s.cashUsd,
        realizedPnlUsd: s.realizedPnlUsd,
        unrealizedPnlUsd: s.unrealizedPnlUsd,
        openCount: s.openCount,
        closedCount: s.closedCount,
      },
      null,
      2,
    ),
  );
  if (data.state.lastScanError) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

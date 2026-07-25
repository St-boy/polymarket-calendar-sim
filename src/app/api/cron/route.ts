import { runScan } from "@/lib/engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Optional Vercel Cron fallback (primary scanner is GitHub Actions). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret) {
    if (process.env.VERCEL === "1") {
      return NextResponse.json(
        { error: "unauthorized: set CRON_SECRET" },
        { status: 401 },
      );
    }
  } else if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const data = await runScan();
    return NextResponse.json({
      ok: true,
      lastScanAt: data.state.lastScanAt,
      summary: data.summary,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

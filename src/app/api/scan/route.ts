import { runScan } from "@/lib/engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.SCAN_SECRET;
  // On Vercel, require a secret so strangers cannot burn scan quota / mutate KV
  if (!secret) return process.env.VERCEL !== "1";
  const header = req.headers.get("authorization") || "";
  const q = new URL(req.url).searchParams.get("secret");
  return header === `Bearer ${secret}` || q === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const data = await runScan();
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}

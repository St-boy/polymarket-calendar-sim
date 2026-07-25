import { resetSim } from "@/lib/engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET || process.env.SCAN_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") || "";
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const data = await resetSim();
  return NextResponse.json(data);
}

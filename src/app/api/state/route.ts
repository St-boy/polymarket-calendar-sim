import { getDashboard } from "@/lib/engine";
import { resolveGithubStateUrl } from "@/lib/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await getDashboard();
    return NextResponse.json({
      ...data,
      meta: {
        stateUrl: resolveGithubStateUrl(),
        onVercel: process.env.VERCEL === "1",
        scanner: "github-actions",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

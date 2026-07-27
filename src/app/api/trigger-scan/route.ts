import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * External cron entrypoint (e.g. cron-job.org).
 * Does NOT run the scan on Vercel — only wakes GitHub Actions via workflow_dispatch.
 *
 * Auth: Authorization: Bearer <CRON_SECRET|SCAN_SECRET>
 *   or  ?secret=<CRON_SECRET|SCAN_SECRET>
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.SCAN_SECRET;
  if (!secret) return process.env.VERCEL !== "1";
  const header = req.headers.get("authorization") || "";
  const q = new URL(req.url).searchParams.get("secret");
  return header === `Bearer ${secret}` || q === secret;
}

function resolveRepo(): { owner: string; repo: string; branch: string } | null {
  const owner =
    process.env.SIM_REPO_OWNER ||
    process.env.VERCEL_GIT_REPO_OWNER ||
    process.env.GITHUB_REPOSITORY_OWNER ||
    "St-boy";
  const repo =
    process.env.SIM_REPO_NAME ||
    process.env.VERCEL_GIT_REPO_SLUG ||
    process.env.GITHUB_REPOSITORY?.split("/")[1] ||
    "polymarket-calendar-sim";
  const branch =
    process.env.SIM_REPO_BRANCH ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    "main";
  if (!owner || !repo) return null;
  return { owner, repo, branch };
}

async function dispatchPaperScan(): Promise<Response> {
  const ref = resolveRepo();
  if (!ref) {
    return NextResponse.json(
      { ok: false, error: "missing repo owner/name" },
      { status: 500 },
    );
  }

  const token = process.env.SIM_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "missing SIM_GITHUB_TOKEN (fine-grained PAT with Actions: write on this repo)",
      },
      { status: 500 },
    );
  }

  const url = `https://api.github.com/repos/${ref.owner}/${ref.repo}/actions/workflows/paper-scan.yml/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "polymarket-calendar-sim",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: ref.branch }),
  });

  if (res.status === 204 || res.ok) {
    return NextResponse.json({
      ok: true,
      dispatched: true,
      repo: `${ref.owner}/${ref.repo}`,
      ref: ref.branch,
      workflow: "paper-scan.yml",
    });
  }

  const text = await res.text();
  return NextResponse.json(
    {
      ok: false,
      error: `github dispatch failed: ${res.status}`,
      detail: text.slice(0, 500),
    },
    { status: 502 },
  );
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return dispatchPaperScan();
}

export async function POST(req: Request) {
  return GET(req);
}

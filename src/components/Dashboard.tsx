"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardPayload, Position } from "@/lib/types";

type StateResponse = DashboardPayload & {
  meta?: { stateUrl?: string | null; onVercel?: boolean; scanner?: string };
};

function usd(n: number | undefined) {
  const v = n ?? 0;
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
}

function pct(n: number) {
  return `${(n * 100).toFixed(2)}¢`;
}

function fmtTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function PnL({ n }: { n: number }) {
  return <span className={n >= 0 ? "pos" : "neg"}>{usd(n)}</span>;
}

function LegTable({ pos }: { pos: Position }) {
  const legs = [
    ...pos.entryLegs.map((l) => ({ ...l, phase: "entry" as const })),
    ...(pos.exitLegs || []).map((l) => ({ ...l, phase: "exit" as const })),
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs mono">
        <thead className="text-[var(--muted)]">
          <tr>
            <th className="py-1 pr-2">阶段</th>
            <th className="py-1 pr-2">角色</th>
            <th className="py-1 pr-2">方向</th>
            <th className="py-1 pr-2">份数</th>
            <th className="py-1 pr-2">均价</th>
            <th className="py-1 pr-2">最优</th>
            <th className="py-1 pr-2">最差</th>
            <th className="py-1 pr-2">滑点</th>
            <th className="py-1 pr-2">USD</th>
            <th className="py-1">档位</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((l, i) => (
            <tr key={i} className="border-t border-[var(--line)]">
              <td className="py-1 pr-2">{l.phase}</td>
              <td className="py-1 pr-2">{l.role}</td>
              <td className="py-1 pr-2">
                {l.side} {l.outcome}
              </td>
              <td className="py-1 pr-2">{l.shares.toFixed(2)}</td>
              <td className="py-1 pr-2">{l.avgPrice.toFixed(4)}</td>
              <td className="py-1 pr-2">{l.bestPrice.toFixed(4)}</td>
              <td className="py-1 pr-2">{l.worstPrice.toFixed(4)}</td>
              <td className="py-1 pr-2">{pct(l.slippage)}</td>
              <td className="py-1 pr-2">{usd(l.usd)}</td>
              <td className="py-1">{l.levelsUsed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<StateResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "load failed");
      setData(json);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function scan() {
    setBusy(true);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "scan failed");
      setData(json);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const s = data?.summary;
  const state = data?.state;
  const trades = [
    ...(state?.positions || []).map((p) => ({ ...p, _open: true })),
    ...(state?.closedTrades || []).map((p) => ({ ...p, _open: false })),
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm tracking-wide text-[var(--accent)]">
            POLYMARKET PAPER SIM
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            日期曲线倒挂 · 订单簿模拟盘
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            进场 &gt;4¢ / 出场 ≤1¢（可成交价）。开平仓均按实时订单簿吃单计价，滑点=成交均价−最优价。
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            扫盘：GitHub Actions（约每 15 分钟）· 展示：Vercel
            {data?.meta?.stateUrl ? " · 状态来自仓库 sim-state.json" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-4 py-2 text-sm"
          >
            刷新
          </button>
          {/* On Vercel, scan/reset require a secret; Actions owns the scanner */}
          {!data?.meta?.onVercel && (
            <button
              type="button"
              disabled={busy}
              onClick={scan}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#062033] disabled:opacity-50"
            >
              {busy ? "扫描中…" : "立即扫描"}
            </button>
          )}
        </div>
      </header>

      {err && (
        <div className="mb-4 rounded-lg border border-[var(--bad)]/40 bg-[var(--bad)]/10 px-4 py-3 text-sm">
          {err}
        </div>
      )}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["权益 Equity", s?.equityUsd ?? 0, false],
            ["现金 Cash", s?.cashUsd ?? 0, false],
            ["已实现 Realized", s?.realizedPnlUsd ?? 0, true],
            ["未实现 Unrealized", s?.unrealizedPnlUsd ?? 0, true],
          ] as Array<[string, number, boolean]>
        ).map(([label, val, isPnl]) => (
          <div key={label} className="panel p-4">
            <div className="text-xs text-[var(--muted)]">{label}</div>
            <div className="mono mt-2 text-2xl">
              {isPnl ? <PnL n={val} /> : usd(val)}
            </div>
          </div>
        ))}
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-4 text-sm">
          <div className="text-[var(--muted)]">持仓 / 已平仓</div>
          <div className="mono mt-1 text-lg">
            {s?.openCount ?? 0} / {s?.closedCount ?? 0}
          </div>
        </div>
        <div className="panel p-4 text-sm">
          <div className="text-[var(--muted)]">胜率</div>
          <div className="mono mt-1 text-lg">
            {((s?.winRate || 0) * 100).toFixed(1)}%（{s?.winCount}/{s?.lossCount}）
          </div>
        </div>
        <div className="panel p-4 text-sm">
          <div className="text-[var(--muted)]">滑点累计(估)</div>
          <div className="mono mt-1 text-lg">{usd(s?.totalFeesProxyUsd)}</div>
        </div>
        <div className="panel p-4 text-sm">
          <div className="text-[var(--muted)]">上次扫描</div>
          <div className="mono mt-1 text-sm">{fmtTime(state?.lastScanAt)}</div>
          {state?.lastScanError && (
            <div className="mt-1 text-xs text-[var(--bad)]">
              {state.lastScanError}
            </div>
          )}
        </div>
      </section>

      <section className="panel mb-6 p-4">
        <h2 className="mb-3 text-lg font-medium">策略参数</h2>
        <div className="grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-3">
          <div>
            进场阈值：{" "}
            <span className="mono text-[var(--text)]">
              {pct(state?.config.entryThresh ?? 0.04)}
            </span>
          </div>
          <div>
            出场阈值：{" "}
            <span className="mono text-[var(--text)]">
              {pct(state?.config.exitThresh ?? 0.01)}
            </span>
          </div>
          <div>
            初始本金：{" "}
            <span className="mono text-[var(--text)]">
              {usd(state?.config.bankrollUsd)}
            </span>
          </div>
        </div>
      </section>

      <section className="panel mb-6 p-4">
        <h2 className="mb-3 text-lg font-medium">订单 / 持仓明细</h2>
        {!trades.length && (
          <p className="text-sm text-[var(--muted)]">
            暂无交易。点击「立即扫描」或等待 Cron。
          </p>
        )}
        <div className="space-y-3">
          {trades.map((t) => {
            const open = t.status === "open";
            const pnl = open ? t.unrealizedPnlUsd : t.realizedPnlUsd || 0;
            const show = expanded === t.id;
            return (
              <div
                key={t.id}
                className="rounded-xl border border-[var(--line)] bg-[var(--bg0)]/50 p-3"
              >
                <button
                  type="button"
                  className="flex w-full flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => setExpanded(show ? null : t.id)}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${open ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-[var(--line)] text-[var(--muted)]"}`}
                      >
                        {open ? "OPEN" : "CLOSED"}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {t.opportunity.curve}
                      </span>
                      <a
                        href={t.opportunity.eventUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t.opportunity.event}
                      </a>
                    </div>
                    <div className="mono mt-1 text-xs text-[var(--muted)]">
                      {t.opportunity.nearLabel} → {t.opportunity.farLabel} · shares{" "}
                      {t.targetShares.toFixed(2)} · entry edge{" "}
                      {pct(t.entryExecEdge)}
                      {t.exitExecEdge != null &&
                        ` · exit edge ${pct(t.exitExecEdge)}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[var(--muted)]">
                      {open ? "未实现" : "已实现"}
                    </div>
                    <div className="mono text-lg">
                      <PnL n={pnl} />
                    </div>
                  </div>
                </button>
                {show && (
                  <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
                    <div>
                      开仓：{fmtTime(t.openedAt)}
                      {t.closedAt && ` · 平仓：${fmtTime(t.closedAt)}`}
                      {t.closeReason && ` · ${t.closeReason}`}
                    </div>
                    <div className="mono">
                      entryCost={usd(t.entryCostUsd)} · mark/exit=
                      {usd(t.exitProceedsUsd ?? t.markProceedsUsd)} · hint=
                      {t.opportunity.tradeHint}
                    </div>
                    <div className="mono">
                      books @ signal: near {t.opportunity.nearBid.toFixed(3)}/
                      {t.opportunity.nearAsk.toFixed(3)} · far{" "}
                      {t.opportunity.farBid.toFixed(3)}/
                      {t.opportunity.farAsk.toFixed(3)} · cap@2¢=
                      {usd(t.opportunity.capacityUsd)}
                    </div>
                    <LegTable pos={t} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 text-lg font-medium">扫描日志</h2>
        <ul className="max-h-64 space-y-1 overflow-y-auto text-xs mono text-[var(--muted)]">
          {(state?.scanLog || []).map((l, i) => (
            <li key={i}>
              <span className="text-[var(--text)]/50">
                {fmtTime(l.t)}
              </span>{" "}
              <span
                className={
                  l.level === "trade"
                    ? "text-[var(--accent)]"
                    : l.level === "error"
                      ? "text-[var(--bad)]"
                      : l.level === "warn"
                        ? "text-[var(--warn)]"
                        : ""
                }
              >
                [{l.level}]
              </span>{" "}
              {l.message}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

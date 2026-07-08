"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtTime } from "./utils";
import type { Run } from "@/lib/types";

interface Stats {
  statusCounts: Record<string, number>;
  todayNew: number;
  lastRun: Run | null;
  running: boolean;
  aiCalls: number;
  aiCallLimit: number;
  hasApiKey: boolean;
}

const RUN_STATUS_LABEL: Record<string, string> = {
  success: "成功",
  partial: "部分成功",
  failed: "失败",
  running: "进行中",
};

export default function StatusBar() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [triggering, setTriggering] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) setStats(await res.json());
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function triggerRun() {
    setTriggering(true);
    await fetch("/api/runs/trigger", { method: "POST" });
    await load();
    setTriggering(false);
  }

  if (!stats) {
    return (
      <div className="bg-panel border border-line rounded-xl px-4 py-3 text-sm text-muted">
        加载中…
      </div>
    );
  }

  const budgetHit = stats.aiCalls >= stats.aiCallLimit;
  const sc = stats.statusCounts;

  return (
    <div className="bg-panel border border-line rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            stats.running ? "bg-good pulse-dot" : "bg-muted/50"
          }`}
        />
        <span className="text-muted">
          {stats.running ? (
            <span className="text-good">AI 正在采集…</span>
          ) : stats.lastRun ? (
            <>
              上次采集 {fmtTime(stats.lastRun.started_at)} ·{" "}
              <span
                className={
                  stats.lastRun.status === "success"
                    ? "text-good"
                    : stats.lastRun.status === "failed"
                      ? "text-bad"
                      : "text-warn"
                }
              >
                {RUN_STATUS_LABEL[stats.lastRun.status] ?? stats.lastRun.status}
              </span>
            </>
          ) : (
            "尚未运行过采集"
          )}
        </span>
      </div>

      <span className="text-muted">
        今日新增 <b className="text-foreground">{stats.todayNew}</b>
      </span>

      <span className="text-muted">
        待初筛 <b className="text-foreground">{sc.pending_screening ?? 0}</b>
        <span className="mx-1.5 text-line">|</span>
        待定 <b className="text-foreground">{sc.screened ?? 0}</b>
        <span className="mx-1.5 text-line">|</span>
        分析中 <b className="text-accent">{sc.analyzing ?? 0}</b>
        <span className="mx-1.5 text-line">|</span>
        已分析 <b className="text-good">{sc.analyzed ?? 0}</b>
      </span>

      <span className={budgetHit ? "text-bad font-semibold" : "text-muted"}>
        AI 调用 {stats.aiCalls}/{stats.aiCallLimit}
        {budgetHit && " ⚠ 已达上限，处理已暂停"}
      </span>

      {!stats.hasApiKey && (
        <span className="text-bad font-semibold">
          ⚠ 未配置 ANTHROPIC_API_KEY（.env.local）
        </span>
      )}

      <button
        onClick={triggerRun}
        disabled={stats.running || triggering}
        className="ml-auto text-xs border border-line rounded-lg px-3 py-1.5 hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:text-foreground"
      >
        {stats.running ? "采集运行中…" : "立即运行采集"}
      </button>
    </div>
  );
}

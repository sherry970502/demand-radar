"use client";

import { useCallback, useEffect, useState } from "react";
import type { Run, CollectorSummary } from "@/lib/types";
import { fmtTime } from "@/components/utils";

const RUN_STATUS: Record<string, { label: string; cls: string }> = {
  running: { label: "进行中", cls: "text-accent border-accent/40 bg-accent/10" },
  success: { label: "成功", cls: "text-good border-good/40 bg-good/10" },
  partial: { label: "部分成功", cls: "text-warn border-warn/40 bg-warn/10" },
  failed: { label: "失败", cls: "text-bad border-bad/40 bg-bad/10" },
};

const COLLECTOR_LABEL: Record<string, string> = {
  reddit: "Reddit",
  research: "研报搜索",
  explore: "定向探索",
};

const TRIGGER_LABEL: Record<string, string> = {
  cron: "定时",
  manual: "手动",
  explore: "探索",
};

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [triggering, setTriggering] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/runs");
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs);
        setRunning(data.running);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function trigger() {
    setTriggering(true);
    await fetch("/api/runs/trigger", { method: "POST" });
    await load();
    setTriggering(false);
  }

  return (
    <main className="flex-1 p-5 max-w-4xl w-full mx-auto flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold">运行日志</h1>
        <p className="text-xs text-muted">
          历次定时/手动采集的运行记录（感知 AI 工作状态的核心数据）
        </p>
        <button
          onClick={trigger}
          disabled={running || triggering}
          className="ml-auto bg-accent text-black font-semibold text-sm rounded-xl px-5 py-2 hover:opacity-90 disabled:opacity-40"
        >
          {running ? "运行中…" : "▶ 立即运行"}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {runs.length === 0 && (
          <p className="text-sm text-muted bg-panel border border-line rounded-xl p-5 text-center">
            还没有运行记录。点右上角「立即运行」开始第一次采集。
          </p>
        )}
        {runs.map((run) => {
          let summaries: CollectorSummary[] = [];
          try {
            summaries = run.summary ? JSON.parse(run.summary) : [];
          } catch {
            // ignore
          }
          const meta = RUN_STATUS[run.status] ?? RUN_STATUS.failed;
          const totalInserted = summaries.reduce((n, s) => n + s.inserted, 0);
          return (
            <div key={run.id} className="bg-panel border border-line rounded-xl">
              <button
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-sm text-left"
              >
                <span className={`border rounded px-1.5 py-0.5 text-[11px] ${meta.cls}`}>
                  {meta.label}
                </span>
                <span className="text-muted text-xs">
                  #{run.id} · {TRIGGER_LABEL[run.trigger_type] ?? run.trigger_type}
                </span>
                <span>{fmtTime(run.started_at)}</span>
                <span className="text-muted text-xs">
                  {run.finished_at ? `→ ${fmtTime(run.finished_at)}` : "…"}
                </span>
                <span className="ml-auto text-xs text-muted">
                  入库 <b className="text-foreground">{totalInserted}</b> 条
                </span>
                <span className="text-muted text-xs">{expanded === run.id ? "▲" : "▼"}</span>
              </button>

              {expanded === run.id && (
                <div className="border-t border-line px-4 py-3 flex flex-col gap-2 text-xs">
                  {run.error && <p className="text-bad">运行错误：{run.error}</p>}
                  {summaries.length === 0 && !run.error && (
                    <p className="text-muted">（无渠道明细）</p>
                  )}
                  {summaries.map((s) => (
                    <div
                      key={s.collector}
                      className="flex flex-wrap items-center gap-4 bg-panel2 border border-line rounded-lg px-3 py-2"
                    >
                      <span className="font-semibold">
                        {COLLECTOR_LABEL[s.collector] ?? s.collector}
                      </span>
                      {s.note && (
                        <span className="text-accent/80">「{s.note}」</span>
                      )}
                      <span className="text-muted">
                        采集 <b className="text-foreground">{s.collected}</b>
                      </span>
                      <span className="text-muted">
                        去重 <b className="text-foreground">{s.deduped}</b>
                      </span>
                      <span className="text-muted">
                        预过滤丢弃 <b className="text-foreground">{s.discarded}</b>
                      </span>
                      <span className="text-muted">
                        入库 <b className="text-good">{s.inserted}</b>
                      </span>
                      {s.error && <span className="text-bad w-full">错误：{s.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}

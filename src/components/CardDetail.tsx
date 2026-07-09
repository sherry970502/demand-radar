"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Card, CardLog } from "@/lib/types";
import {
  DEMAND_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  CAPABILITY_TYPE_LABELS,
  type Capability,
} from "@/lib/types";
import { VERDICT_META, PRIORITY_CLS, parseCategories, fmtTime } from "./utils";

const ACTOR_LABEL: Record<string, string> = {
  ai: "AI",
  human: "人工",
  system: "系统",
};

export default function CardDetail({
  cardId,
  onClose,
  onChanged,
}: {
  cardId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [card, setCard] = useState<Card | null>(null);
  const [logs, setLogs] = useState<CardLog[]>([]);
  const [sceneName, setSceneName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/cards/${cardId}`);
    if (res.ok) {
      const data = await res.json();
      setCard(data.card);
      setLogs(data.logs);
      setSceneName(data.sceneName ?? null);
    }
  }, [cardId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function patch(body: Record<string, string>) {
    setBusy(true);
    await fetch(`/api/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    onChanged();
    setBusy(false);
  }

  async function rerun(mode: "screen" | "analyze") {
    setBusy(true);
    await fetch(`/api/cards/${cardId}/rerun`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    await load();
    onChanged();
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-panel border-l border-line h-full overflow-y-auto p-6 flex flex-col gap-5">
        {!card ? (
          <p className="text-muted">加载中…</p>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-xs text-muted mb-1">
                  卡片 #{card.id} · {SOURCE_LABELS[card.source_type]} ·{" "}
                  {STATUS_LABELS[card.status]}
                  {card.human_touched === 1 && (
                    <span className="ml-2 text-accent">已人工干预</span>
                  )}
                  {sceneName && (
                    <span className="ml-2 text-violet-300">
                      🗺 {sceneName}
                      {card.stage ? ` · ${card.stage}` : ""}
                      {card.persona ? ` · ${card.persona}` : ""}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold leading-snug">
                  {card.title ?? "（待初筛）"}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="text-muted hover:text-foreground text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* 干预操作区 */}
            <div className="bg-panel2 border border-line rounded-xl p-4 flex flex-col gap-3 text-sm">
              <div className="text-xs text-muted font-semibold">人工干预</div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5">
                  <span className="text-muted text-xs">优先级</span>
                  <select
                    disabled={busy}
                    value={card.priority ?? ""}
                    onChange={(e) => e.target.value && patch({ priority: e.target.value })}
                    className="bg-panel border border-line rounded px-2 py-1 text-xs"
                  >
                    <option value="" disabled>
                      —
                    </option>
                    <option value="P0">P0</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted text-xs">初筛结论</span>
                  <select
                    disabled={busy}
                    value={card.screening_verdict ?? ""}
                    onChange={(e) =>
                      e.target.value && patch({ screening_verdict: e.target.value })
                    }
                    className="bg-panel border border-line rounded px-2 py-1 text-xs"
                  >
                    <option value="" disabled>
                      —
                    </option>
                    <option value="worth">值得做</option>
                    <option value="not_worth">不值得做</option>
                    <option value="uncertain">待定</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted text-xs">需求类型</span>
                  <select
                    disabled={busy}
                    value={card.demand_type ?? ""}
                    onChange={(e) => e.target.value && patch({ demand_type: e.target.value })}
                    className="bg-panel border border-line rounded px-2 py-1 text-xs"
                  >
                    <option value="" disabled>
                      —
                    </option>
                    <option value="existing">已有需求</option>
                    <option value="created">创造需求</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted text-xs">状态（推进/回退）</span>
                  <select
                    disabled={busy}
                    value={card.status}
                    onChange={(e) => patch({ status: e.target.value })}
                    className="bg-panel border border-line rounded px-2 py-1 text-xs"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={() => rerun("screen")}
                  className="border border-line rounded-lg px-3 py-1.5 text-xs hover:border-accent hover:text-accent disabled:opacity-40"
                >
                  重新初筛
                </button>
                <button
                  disabled={busy}
                  onClick={() => rerun("analyze")}
                  className="border border-line rounded-lg px-3 py-1.5 text-xs hover:border-accent hover:text-accent disabled:opacity-40"
                >
                  重新深度分析
                </button>
                <button
                  disabled={busy || card.status === "archived"}
                  onClick={() => patch({ status: "archived" })}
                  className="border border-line rounded-lg px-3 py-1.5 text-xs hover:border-warn hover:text-warn disabled:opacity-40"
                >
                  归档
                </button>
                <button
                  disabled={busy || card.status === "adopted"}
                  onClick={() => patch({ status: "adopted" })}
                  className="border border-good/40 text-good rounded-lg px-3 py-1.5 text-xs hover:bg-good/10 disabled:opacity-40"
                >
                  标记采纳 ✓
                </button>
              </div>
            </div>

            {/* AI 摘要与初筛 */}
            {card.summary && (
              <section>
                <h3 className="text-xs text-muted font-semibold mb-1.5">AI 需求摘要</h3>
                <p className="text-sm leading-relaxed">{card.summary}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px]">
                  {card.screening_verdict && (
                    <span
                      className={`border rounded px-1.5 py-0.5 ${VERDICT_META[card.screening_verdict].cls}`}
                    >
                      {VERDICT_META[card.screening_verdict].label}
                    </span>
                  )}
                  {card.priority && (
                    <span
                      className={`border rounded px-1.5 py-0.5 ${PRIORITY_CLS[card.priority]}`}
                    >
                      {card.priority} · {card.priority_score}
                    </span>
                  )}
                  {card.demand_type && (
                    <span
                      className={`border rounded px-1.5 py-0.5 ${
                        card.demand_type === "created"
                          ? "text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-400/10"
                          : "text-sky-300 border-sky-400/40 bg-sky-400/10"
                      }`}
                    >
                      {card.demand_type === "created" ? "✨ " : ""}
                      {DEMAND_LABELS[card.demand_type]}
                    </span>
                  )}
                  {parseCategories(card.category).map((c) => (
                    <span
                      key={c}
                      className="bg-panel2 border border-line rounded px-1.5 py-0.5 text-muted"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {card.screening_reason && (
              <section>
                <h3 className="text-xs text-muted font-semibold mb-1.5">初筛理由</h3>
                <p className="text-sm leading-relaxed text-foreground/90 bg-panel2 border border-line rounded-xl p-3">
                  {card.screening_reason}
                </p>
              </section>
            )}

            {/* 产品呈现方式与能力拆解 */}
            {card.delivery_mode && (
              <section>
                <h3 className="text-xs text-muted font-semibold mb-1.5">产品呈现方式</h3>
                <div className="bg-panel2 border border-line rounded-xl p-3 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    {card.delivery_mode === "skill" ? (
                      <>
                        <span className="border rounded px-2 py-0.5 text-emerald-300 border-emerald-400/40 bg-emerald-400/10 text-xs font-semibold">
                          🧩 单一 Skill
                        </span>
                        {card.skill_name && (
                          <span className="font-medium">{card.skill_name}</span>
                        )}
                      </>
                    ) : (
                      <span className="border rounded px-2 py-0.5 text-orange-300 border-orange-400/40 bg-orange-400/10 text-xs font-semibold">
                        🔗 组合交付（多能力/服务串联）
                      </span>
                    )}
                  </div>
                  {(() => {
                    let caps: Capability[] = [];
                    try {
                      caps = card.capabilities ? JSON.parse(card.capabilities) : [];
                    } catch {
                      // ignore
                    }
                    if (caps.length === 0) return null;
                    const typeCls: Record<string, string> = {
                      ai: "text-accent border-accent/40 bg-accent/10",
                      basic: "text-muted border-line bg-panel",
                      service: "text-warn border-warn/40 bg-warn/10",
                    };
                    return (
                      <div className="flex flex-col gap-1.5">
                        {caps.map((cap, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                            <span
                              className={`border rounded px-1.5 py-0.5 ${typeCls[cap.type] ?? typeCls.basic}`}
                            >
                              {CAPABILITY_TYPE_LABELS[cap.type] ?? cap.type}
                            </span>
                            <span className="font-medium">{cap.name}</span>
                            <span className="text-muted">{cap.role}</span>
                          </div>
                        ))}
                        <p className="text-[10px] text-muted/70 mt-1">
                          AI 只提出所需构件；是否已有对应 Skill 请对照内部清单判断
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </section>
            )}

            {/* 深度分析 */}
            <section>
              <h3 className="text-xs text-muted font-semibold mb-1.5">深度分析报告</h3>
              {card.deep_analysis ? (
                <div className="markdown-body text-sm bg-panel2 border border-line rounded-xl p-4">
                  <ReactMarkdown>{card.deep_analysis}</ReactMarkdown>
                </div>
              ) : card.status === "analyzing" ? (
                <p className="text-sm text-accent">
                  <span className="pulse-dot inline-block">●</span> AI 正在分析中…
                </p>
              ) : (
                <p className="text-sm text-muted">（尚未生成）</p>
              )}
            </section>

            {/* 原始内容 */}
            <section>
              <h3 className="text-xs text-muted font-semibold mb-1.5">
                原始内容
                {card.source_url && (
                  <a
                    href={card.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-accent underline font-normal"
                  >
                    查看原文 ↗
                  </a>
                )}
              </h3>
              <pre className="text-xs text-foreground/80 bg-panel2 border border-line rounded-xl p-3 whitespace-pre-wrap max-h-60 overflow-y-auto font-[inherit]">
                {card.raw_content}
              </pre>
            </section>

            {/* pipeline_log 时间线 */}
            <section>
              <h3 className="text-xs text-muted font-semibold mb-2">处理时间线</h3>
              <div className="flex flex-col gap-0">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-3 text-xs">
                    <div className="flex flex-col items-center">
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-1.5 ${
                          log.actor === "human"
                            ? "bg-accent"
                            : log.action === "error"
                              ? "bg-bad"
                              : "bg-muted"
                        }`}
                      />
                      <span className="flex-1 w-px bg-line" />
                    </div>
                    <div className="pb-3">
                      <span className="text-muted">{fmtTime(log.ts)}</span>{" "}
                      <span
                        className={
                          log.actor === "human" ? "text-accent" : "text-foreground/70"
                        }
                      >
                        [{ACTOR_LABEL[log.actor] ?? log.actor}]
                      </span>{" "}
                      <span className={log.action === "error" ? "text-bad" : ""}>
                        {log.detail ?? log.action}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  assetStatusLabel,
  type AssetListItem,
  type AssetStatus,
  type AssetType,
} from "@/lib/types";
import { fmtTime } from "@/components/utils";
import AssetDetail from "@/components/AssetDetail";

const STATUS_CLS: Record<AssetStatus, string> = {
  proposed: "text-muted border-line bg-panel2",
  defining: "text-sky-300 border-sky-400/40 bg-sky-400/10",
  developing: "text-warn border-warn/40 bg-warn/10",
  testing: "text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-400/10",
  accepted: "text-good border-good/40 bg-good/10",
  paused: "text-muted/60 border-line bg-panel2",
};

const TYPE_CLS: Record<AssetType, string> = {
  agent: "text-good border-good/40 bg-good/10",
  skill: "text-accent border-accent/40 bg-accent/10",
  ai_service: "text-sky-300 border-sky-400/40 bg-sky-400/10",
  knowledge: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
  mcp: "text-violet-300 border-violet-400/40 bg-violet-400/10",
  service: "text-orange-300 border-orange-400/40 bg-orange-400/10",
  ai: "text-muted border-line bg-panel2",
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [tab, setTab] = useState<"agents" | "resources">("agents");
  const [typeFilter, setTypeFilter] = useState<"" | AssetType>("");
  const [statusFilter, setStatusFilter] = useState<"" | AssetStatus>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/assets");
      if (res.ok) setAssets((await res.json()).assets);
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function sync() {
    setBusy(true);
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sync: true }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? `同步完成：新增 ${data.created} 项资产，新增 ${data.linked} 条卡片关联` : data.error ?? "同步失败");
    load();
  }

  async function merge() {
    if (!confirm("AI 归并会消耗 1 次 AI 调用，把名称不同但实质相同的能力合并。继续？")) return;
    setBusy(true);
    const res = await fetch("/api/assets/merge", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? `归并完成：${data.groups} 组，合并掉 ${data.merged} 项` : data.error ?? "归并失败");
    load();
  }

  const inTab = assets.filter((a) => (tab === "agents" ? a.type === "agent" : a.type !== "agent"));
  const agentCount = assets.filter((a) => a.type === "agent").length;
  const shown = inTab.filter(
    (a) => (!typeFilter || a.type === typeFilter) && (!statusFilter || a.status === statusFilter)
  );
  const statusCounts = inTab.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="flex-1 flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-bold text-lg">能力资产</h1>
          <p className="text-xs text-muted mt-0.5">
            入口是 AI 员工（生产工程交付回来的东西）：看它服务哪个需求/场景、由哪些资源组成。
            资源库是复用台账（跨员工共享的零件 + 生产中零件 + 雷达预估），也是工程比对复用的查询面
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={sync}
            disabled={busy}
            className="border border-line text-sm rounded-xl px-4 py-2 text-muted hover:text-foreground hover:border-accent/50 disabled:opacity-40"
          >
            ⟳ 同步雷达预估（免 AI）
          </button>
          <button
            onClick={merge}
            disabled={busy || assets.length < 2}
            className="border border-accent/50 text-accent text-sm rounded-xl px-4 py-2 hover:bg-accent/10 disabled:opacity-40"
          >
            ✨ AI 归并相似能力
          </button>
        </div>
      </div>

      {msg && <p className="text-xs text-accent">{msg}</p>}

      <div className="flex border border-line rounded-lg overflow-hidden text-xs self-start">
        <button
          onClick={() => { setTab("agents"); setTypeFilter(""); setStatusFilter(""); }}
          className={`px-3 py-1.5 ${tab === "agents" ? "bg-panel2 text-foreground" : "text-muted hover:text-foreground"}`}
        >
          🤖 AI 员工（{agentCount}）
        </button>
        <button
          onClick={() => { setTab("resources"); setTypeFilter(""); setStatusFilter(""); }}
          className={`px-3 py-1.5 border-l border-line ${tab === "resources" ? "bg-panel2 text-foreground" : "text-muted hover:text-foreground"}`}
        >
          资源库 · 复用台账（{assets.length - agentCount}）
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {tab === "resources" && (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "" | AssetType)}
            className="bg-panel border border-line rounded-lg px-2.5 py-1.5"
          >
            <option value="">全部类型</option>
            {Object.entries(ASSET_TYPE_LABELS)
              .filter(([k]) => k !== "agent")
              .map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
          </select>
        )}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setStatusFilter("")}
            className={`border rounded-lg px-2.5 py-1 ${statusFilter === "" ? "border-accent/60 text-accent bg-accent/10" : "border-line text-muted hover:text-foreground"}`}
          >
            全部（{inTab.length}）
          </button>
          {(Object.keys(ASSET_STATUS_LABELS) as AssetStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
              className={`border rounded-lg px-2.5 py-1 ${statusFilter === s ? STATUS_CLS[s] : "border-line text-muted hover:text-foreground"}`}
            >
              {tab === "agents" ? assetStatusLabel("agent", s) : ASSET_STATUS_LABELS[s]}（{statusCounts[s] ?? 0}）
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted text-sm">
          <div>
            <p className="text-3xl mb-3">🧩</p>
            <p>
              {tab === "agents"
                ? "还没有 AI 员工。需求卡片派发生产后，由生产工程回传创建并绑定。"
                : inTab.length === 0
                  ? "还没有资源。等工程回传，或点「同步雷达预估」先汇入深析拆解作参考。"
                  : "当前筛选下没有资产。"}
            </p>
          </div>
        </div>
      ) : tab === "agents" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {shown.map((a) => {
            const byType = (a.components ?? []).reduce<Record<string, typeof a.components>>((acc, c) => {
              (acc[c.type] = acc[c.type] ?? []).push(c);
              return acc;
            }, {});
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(a.id)}
                className="text-left bg-panel/60 border border-line rounded-xl p-4 flex flex-col gap-3 hover:border-accent/60 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🤖</span>
                      <h2 className="font-bold text-[15px]">{a.name}</h2>
                      <span className={`text-[11px] border rounded px-1.5 py-0.5 ${STATUS_CLS[a.status]}`}>
                        {assetStatusLabel("agent", a.status)}
                      </span>
                    </div>
                    {a.role && <p className="text-xs text-muted mt-1">{a.role}</p>}
                  </div>
                  {a.trial_url && (
                    <a
                      href={a.trial_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs border border-line rounded-lg px-2.5 py-1.5 text-muted hover:text-accent hover:border-accent/50 shrink-0"
                    >
                      抽样体验 →
                    </a>
                  )}
                </div>

                {(a.servedCards ?? []).length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-muted font-semibold">
                      服务的需求{a.sceneNames.length > 0 ? `（${a.sceneNames.join("、")}）` : ""}
                    </span>
                    {(a.servedCards ?? []).slice(0, 3).map((c) => (
                      <div key={c.id} className="text-[12px] text-foreground/85 leading-snug">
                        <span className="text-muted">#{c.id}</span> {c.title ?? "（待初筛）"}
                      </div>
                    ))}
                    {(a.servedCards ?? []).length > 3 && (
                      <span className="text-[10px] text-muted">…等 {(a.servedCards ?? []).length} 张</span>
                    )}
                  </div>
                )}

                {(a.components ?? []).length > 0 && (
                  <div className="flex flex-col gap-1.5 border-t border-line/60 pt-2.5">
                    <span className="text-[10px] text-muted font-semibold">组成资源（{(a.components ?? []).length}）</span>
                    <div className="flex flex-col gap-1">
                      {Object.entries(byType).map(([t, comps]) => (
                        <div key={t} className="flex flex-wrap items-center gap-1.5">
                          <span className={`text-[10px] border rounded px-1.5 py-0.5 shrink-0 ${TYPE_CLS[t as AssetType]}`}>
                            {ASSET_TYPE_LABELS[t as AssetType]} ×{comps!.length}
                          </span>
                          {comps!.map((c) => (
                            <span key={c.id} className="text-[11px] text-muted bg-panel2 border border-line rounded px-1.5 py-0.5">
                              {c.name}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {a.stage_detail && (
                  <p className="text-[11px] text-muted">📍 {a.stage_detail}</p>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="bg-panel/60 border border-line rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted border-b border-line">
                <th className="px-3 py-2.5 font-semibold">资产</th>
                <th className="px-3 py-2.5 font-semibold w-24">类型</th>
                <th className="px-3 py-2.5 font-semibold w-24">状态</th>
                <th className="px-3 py-2.5 font-semibold">当前阶段</th>
                <th className="px-3 py-2.5 font-semibold w-20">需求数</th>
                <th className="px-3 py-2.5 font-semibold">场景</th>
                <th className="px-3 py-2.5 font-semibold w-28">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className="border-b border-line/50 hover:bg-panel2/60 cursor-pointer"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-[13px]">{a.name}</div>
                    {a.role && <div className="text-[11px] text-muted mt-0.5 line-clamp-1">{a.role}</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[11px] border rounded px-1.5 py-0.5 ${TYPE_CLS[a.type]}`}>
                      {ASSET_TYPE_LABELS[a.type]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[11px] border rounded px-1.5 py-0.5 ${STATUS_CLS[a.status]}`}>
                      {assetStatusLabel(a.type, a.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-muted">{a.stage_detail ?? "—"}</td>
                  <td className="px-3 py-2.5 text-[13px] text-accent font-semibold">{a.cardCount}</td>
                  <td className="px-3 py-2.5 text-[11px] text-muted">{a.sceneNames.join("、") || "—"}</td>
                  <td className="px-3 py-2.5 text-[11px] text-muted/70">{fmtTime(a.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId !== null && (
        <AssetDetail assetId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
      )}
    </main>
  );
}

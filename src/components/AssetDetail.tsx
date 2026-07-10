"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  assetStatusLabel,
  type Asset,
  type AssetStatus,
  type AssetType,
} from "@/lib/types";
import { fmtTime } from "./utils";

interface LinkedCard {
  id: number;
  title: string | null;
  priority_score: number | null;
  status: string;
  scene_name: string | null;
}

interface AssetLog {
  id: number;
  ts: string;
  actor: string;
  action: string;
  detail: string | null;
}

interface RelatedAsset {
  id: number;
  type?: string;
  name: string;
  status: AssetStatus;
}

const ACTOR_LABEL: Record<string, string> = {
  ai: "AI",
  human: "人工",
  system: "系统",
  pipeline: "生产工程",
};

export default function AssetDetail({
  assetId,
  onClose,
  onChanged,
}: {
  assetId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  // 下钻导航：点组成资源进入其详情，可逐层返回（检查员工→技能包→认知包的设计链）
  const [stack, setStack] = useState<number[]>([assetId]);
  const currentId = stack[stack.length - 1];

  const [asset, setAsset] = useState<Asset | null>(null);
  const [cards, setCards] = useState<LinkedCard[]>([]);
  const [components, setComponents] = useState<RelatedAsset[]>([]);
  const [usedBy, setUsedBy] = useState<RelatedAsset[]>([]);
  const [logs, setLogs] = useState<AssetLog[]>([]);
  const [stageDetail, setStageDetail] = useState("");
  const [artifactUrl, setArtifactUrl] = useState("");
  const [trialUrl, setTrialUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/assets/${currentId}`);
    if (res.ok) {
      const data = await res.json();
      setAsset(data.asset);
      setCards(data.cards);
      setComponents(data.components ?? []);
      setUsedBy(data.usedBy ?? []);
      setLogs(data.logs);
      setStageDetail(data.asset.stage_detail ?? "");
      setArtifactUrl(data.asset.artifact_url ?? "");
      setTrialUrl(data.asset.trial_url ?? "");
      setNotes(data.asset.notes ?? "");
    }
  }, [currentId]);

  useEffect(() => {
    setAsset(null);
    load();
  }, [load]);

  function drillDown(id: number) {
    if (id !== currentId) setStack((s) => [...s, id]);
  }

  async function patch(body: Record<string, string>) {
    setBusy(true);
    await fetch(`/api/assets/${currentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    onChanged();
    setBusy(false);
  }

  async function remove() {
    if (!confirm(`删除资产「${asset?.name}」？关联关系与日志一并删除，卡片本身不受影响。`)) return;
    await fetch(`/api/assets/${currentId}`, { method: "DELETE" });
    onChanged();
    onClose();
  }

  const inputCls =
    "bg-panel2 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent w-full";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-panel border-l border-line h-full overflow-y-auto p-6 flex flex-col gap-5">
        {!asset ? (
          <p className="text-muted">加载中…</p>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-xs text-muted mb-1 flex items-center gap-2">
                  {stack.length > 1 && (
                    <button
                      onClick={() => setStack((s) => s.slice(0, -1))}
                      className="border border-line rounded px-1.5 py-0.5 text-muted hover:text-foreground hover:border-accent/50"
                    >
                      ← 返回上一层
                    </button>
                  )}
                  <span>资产 #{asset.id} · {ASSET_TYPE_LABELS[asset.type]}</span>
                </div>
                <h2 className="text-lg font-bold leading-snug">{asset.name}</h2>
                {asset.role && <p className="text-xs text-muted mt-1">{asset.role}</p>}
              </div>
              <button
                onClick={onClose}
                className="text-muted hover:text-foreground text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="bg-panel2 border border-line rounded-xl p-4 flex flex-col gap-3 text-sm">
              <div className="text-xs text-muted font-semibold">研发状态</div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5">
                  <span className="text-muted text-xs">类型</span>
                  <select
                    disabled={busy}
                    value={asset.type}
                    onChange={(e) => patch({ type: e.target.value })}
                    className="bg-panel border border-line rounded px-2 py-1 text-xs"
                  >
                    {(Object.keys(ASSET_TYPE_LABELS) as AssetType[])
                      .filter((t) => (t !== "ai" || asset.type === "ai") && (t !== "agent" || asset.type === "agent"))
                      .map((t) => (
                        <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
                      ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-muted text-xs">里程碑</span>
                  <select
                    disabled={busy}
                    value={asset.status}
                    onChange={(e) => patch({ status: e.target.value })}
                    className="bg-panel border border-line rounded px-2 py-1 text-xs"
                  >
                    {(Object.keys(ASSET_STATUS_LABELS) as AssetStatus[]).map((s) => (
                      <option key={s} value={s}>{assetStatusLabel(asset.type, s)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-muted text-xs">当前阶段说明（生产工程回调时也写这里）</span>
                <input
                  value={stageDetail}
                  onChange={(e) => setStageDetail(e.target.value)}
                  onBlur={() => stageDetail !== (asset.stage_detail ?? "") && patch({ stage_detail: stageDetail })}
                  placeholder="如：正在收集跨境电商行业认知包"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted text-xs">产物链接（仓库 / Skill 包）</span>
                <input
                  value={artifactUrl}
                  onChange={(e) => setArtifactUrl(e.target.value)}
                  onBlur={() => artifactUrl !== (asset.artifact_url ?? "") && patch({ artifact_url: artifactUrl })}
                  placeholder="https://…"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted text-xs">
                  抽样体验入口（配置到产品端后的试用链接，由生产工程回调写入）
                </span>
                <div className="flex gap-2">
                  <input
                    value={trialUrl}
                    onChange={(e) => setTrialUrl(e.target.value)}
                    onBlur={() => trialUrl !== (asset.trial_url ?? "") && patch({ trial_url: trialUrl })}
                    placeholder="https://产品端/skill/…"
                    className={inputCls}
                  />
                  {asset.trial_url && (
                    <a
                      href={asset.trial_url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 bg-accent text-black font-semibold text-xs rounded-lg px-4 py-2 hover:opacity-90 flex items-center"
                    >
                      抽样体验 →
                    </a>
                  )}
                </div>
              </label>
              {asset.trial_url && asset.status === "testing" && (
                <p className="text-[11px] text-warn">
                  {asset.type === "agent"
                    ? "⏳ 待签收：去产品端抽样体验后，在需求卡片的「生产交付」区块签收（签收以卡片为单位，员工状态会联动）。"
                    : "⏳ 待验证：去产品端试用后把里程碑推进，或写明问题打回。"}
                </p>
              )}
              <label className="flex flex-col gap-1">
                <span className="text-muted text-xs">备注</span>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => notes !== (asset.notes ?? "") && patch({ notes })}
                  className={`${inputCls} resize-none`}
                />
              </label>
            </div>

            {asset.structure && (
              <div>
                <h3 className="text-xs text-muted font-semibold mb-2">
                  {asset.type === "agent" ? "内部结构（工程回传，仅展示）" : "设计说明（工程回传）"}
                </h3>
                <pre className="bg-panel2 border border-line rounded-xl p-3 text-[11px] text-muted whitespace-pre-wrap leading-relaxed overflow-x-auto">
                  {asset.structure}
                </pre>
              </div>
            )}

            {components.length > 0 && (
              <div>
                <h3 className="text-xs text-muted font-semibold mb-2">
                  组成资源（{components.length}）——点击下钻查看工程回传的设计
                </h3>
                <div className="flex flex-col gap-1.5">
                  {components.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => drillDown(c.id)}
                      className="bg-panel2 border border-line rounded-lg px-3 py-2 text-[12px] flex items-center gap-2 text-left hover:border-accent/60 transition-colors"
                    >
                      <span className="text-muted shrink-0">#{c.id}</span>
                      <span className="flex-1">{c.name}</span>
                      {c.type && (
                        <span className="text-[10px] text-muted border border-line rounded px-1.5 py-0.5 shrink-0">
                          {ASSET_TYPE_LABELS[c.type as keyof typeof ASSET_TYPE_LABELS] ?? c.type}
                        </span>
                      )}
                      <span className="text-[10px] text-accent shrink-0">
                        {assetStatusLabel((c.type ?? "skill") as Parameters<typeof assetStatusLabel>[0], c.status)}
                      </span>
                      <span className="text-muted/60 shrink-0">→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {usedBy.length > 0 && (
              <div>
                <h3 className="text-xs text-muted font-semibold mb-2">
                  被这些上层资产使用（{usedBy.length}）
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {usedBy.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => drillDown(a.id)}
                      className={`text-[11px] border rounded px-2 py-1 hover:opacity-80 ${
                        a.type === "agent"
                          ? "border-good/40 bg-good/10 text-good"
                          : "border-accent/40 bg-accent/10 text-accent"
                      }`}
                    >
                      {a.type === "agent" ? "🤖 " : ""}
                      {a.name} · {assetStatusLabel((a.type ?? "skill") as Parameters<typeof assetStatusLabel>[0], a.status)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xs text-muted font-semibold mb-2">
                {asset.type === "agent" ? `服务的需求卡片（${cards.length}）` : `需要此能力的需求卡片（${cards.length}）`}
              </h3>
              <div className="flex flex-col gap-1.5">
                {cards.map((c) => (
                  <div key={c.id} className="bg-panel2 border border-line rounded-lg px-3 py-2 text-[12px] flex items-center gap-2">
                    <span className="text-muted shrink-0">#{c.id}</span>
                    <span className="flex-1 leading-snug">{c.title ?? "（待初筛）"}</span>
                    {c.scene_name && (
                      <span className="text-[10px] text-violet-300 border border-violet-400/30 rounded px-1.5 py-0.5 shrink-0">
                        {c.scene_name}
                      </span>
                    )}
                    {c.priority_score != null && (
                      <span className="text-accent font-semibold shrink-0">{c.priority_score}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs text-muted font-semibold mb-2">日志</h3>
              <div className="flex flex-col gap-1">
                {logs.map((l) => (
                  <div key={l.id} className="text-[11px] text-muted flex gap-2">
                    <span className="text-muted/60 shrink-0">{fmtTime(l.ts)}</span>
                    <span className="shrink-0 text-foreground/70">[{ACTOR_LABEL[l.actor] ?? l.actor}]</span>
                    <span>{l.detail ?? l.action}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={remove}
              className="self-start text-xs text-muted hover:text-bad border border-line hover:border-bad/50 rounded-lg px-3 py-1.5"
            >
              删除资产
            </button>
          </>
        )}
      </div>
    </div>
  );
}

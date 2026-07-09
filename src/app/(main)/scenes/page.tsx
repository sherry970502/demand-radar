"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OTHER_STAGE, type SceneStats } from "@/lib/types";

function CoverageBar({ scene }: { scene: SceneStats }) {
  const pct = scene.totalStages > 0 ? Math.round((scene.coveredStages / scene.totalStages) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-panel2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${pct >= 80 ? "bg-good" : pct >= 40 ? "bg-warn" : "bg-bad"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-muted whitespace-nowrap">
        覆盖 {scene.coveredStages}/{scene.totalStages} 环节 · {pct}%
      </span>
    </div>
  );
}

export default function ScenesPage() {
  const [scenes, setScenes] = useState<SceneStats[]>([]);
  const [unassigned, setUnassigned] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scenes");
      if (res.ok) {
        const data = await res.json();
        setScenes(data.scenes);
        setUnassigned(data.unassigned);
      }
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function create() {
    if (desc.trim().length < 4) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/scenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: desc.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      setDesc("");
      setShowCreate(false);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "创建失败，请重试");
    }
  }

  async function backfill() {
    setBackfilling(true);
    setMsg("");
    const res = await fetch("/api/scenes/backfill", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBackfilling(false);
    if (res.ok) {
      setMsg(`已归类 ${data.assigned}/${data.total} 张卡片，其余保持未归属`);
      load();
    } else {
      setMsg(data.error ?? "回填失败");
    }
  }

  return (
    <main className="flex-1 flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-bold text-lg">场景看板</h1>
          <p className="text-xs text-muted mt-0.5">
            每个业务场景一张蓝图（环节 × 角色），需求卡片挂到环节上——空环节就是情报缺口
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {unassigned > 0 && scenes.length > 0 && (
            <button
              onClick={backfill}
              disabled={backfilling}
              className="border border-line text-sm rounded-xl px-4 py-2 text-muted hover:text-foreground hover:border-accent/50 disabled:opacity-40"
            >
              {backfilling ? "AI 归类中…" : `🗂 AI 归类未归属卡片（${unassigned}）`}
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="bg-accent text-black font-semibold text-sm rounded-xl px-5 py-2 hover:opacity-90 shadow-lg shadow-accent/20"
          >
            ＋ 新建场景
          </button>
        </div>
      </div>

      {msg && <p className="text-xs text-accent">{msg}</p>}

      {scenes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted text-sm max-w-md">
            <p className="text-3xl mb-3">🗺️</p>
            <p>还没有场景。新建一个场景（AI 会自动拆解出环节蓝图），</p>
            <p>或在看板上发起「定向探索」时选择新建场景。</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {scenes.map((scene) => (
            <Link
              key={scene.id}
              href={`/scenes/${scene.id}`}
              className="bg-panel/60 border border-line rounded-xl p-4 flex flex-col gap-3 hover:border-accent/60 transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <h2 className="font-bold text-[15px]">{scene.name}</h2>
                  {scene.description && (
                    <p className="text-xs text-muted mt-1 line-clamp-2">{scene.description}</p>
                  )}
                </div>
                <span className="text-[11px] text-muted bg-panel2 rounded-full px-2 py-0.5 whitespace-nowrap">
                  {scene.cardCount} 需求
                </span>
              </div>

              <CoverageBar scene={scene} />

              <div className="flex flex-wrap gap-1">
                {scene.blueprint.stages.map((s) => {
                  const n = scene.stageCounts[s.name] ?? 0;
                  return (
                    <span
                      key={s.name}
                      className={`text-[10px] border rounded px-1.5 py-0.5 ${
                        n > 0
                          ? "border-good/40 bg-good/10 text-good"
                          : "border-bad/40 bg-bad/5 text-bad/80"
                      }`}
                    >
                      {s.name} {n > 0 ? n : "缺口"}
                    </span>
                  );
                })}
                {(scene.stageCounts[OTHER_STAGE] ?? 0) > 0 && (
                  <span className="text-[10px] border border-line rounded px-1.5 py-0.5 text-muted">
                    未归环节 {scene.stageCounts[OTHER_STAGE]}
                  </span>
                )}
              </div>

              {scene.blueprint.personas.length > 0 && (
                <div className="flex flex-wrap gap-1 text-[10px] text-violet-300">
                  {scene.blueprint.personas.map((p) => (
                    <span key={p.name} className="border border-violet-400/30 bg-violet-400/5 rounded px-1.5 py-0.5">
                      {p.name}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-lg bg-panel border border-line rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <h2 className="font-bold">新建场景 🗺️</h2>
              <p className="text-xs text-muted mt-1">
                描述一个业务场景/人群/行业，AI 会把它拆解成「环节 × 角色」的场景蓝图。
                蓝图生成后可在场景页里人工修订，之后的定向探索都沿蓝图进行。
              </p>
            </div>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
              autoFocus
              placeholder="例如：市场营销——品牌方与创作者围绕营销活动从策划、内容生产到投放复盘的全流程"
              className="bg-panel2 border border-line rounded-xl p-3 text-sm outline-none focus:border-accent resize-none"
            />
            {error && <p className="text-sm text-bad">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <span className="text-[11px] text-muted mr-auto">蓝图生成约需 20-40 秒</span>
              <button
                onClick={() => setShowCreate(false)}
                className="text-sm text-muted hover:text-foreground px-3 py-2"
              >
                取消
              </button>
              <button
                onClick={create}
                disabled={busy || desc.trim().length < 4}
                className="bg-accent text-black font-semibold text-sm rounded-lg px-5 py-2 disabled:opacity-40 hover:opacity-90"
              >
                {busy ? "生成蓝图中…" : "生成蓝图"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

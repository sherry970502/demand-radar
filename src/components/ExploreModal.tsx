"use client";

import { useEffect, useState } from "react";
import type { SceneStats } from "@/lib/types";

const EXAMPLES = [
  "BD 商务谈判：从找线索、约见到谈判跟进的全流程",
  "幼儿园老师的日常工作",
  "婚礼筹备中的新人",
  "小型跨境电商卖家的选品与客服",
];

export default function ExploreModal({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: () => void;
}) {
  const [scenes, setScenes] = useState<SceneStats[]>([]);
  const [sceneId, setSceneId] = useState<number | "new">("new");
  const [scene, setScene] = useState("");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/scenes")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setScenes(data.scenes))
      .catch(() => {});
  }, []);

  const isNew = sceneId === "new";
  const selected = isNew ? null : scenes.find((s) => s.id === sceneId);
  const canSubmit = isNew ? scene.trim().length >= 4 : !!selected;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/explore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isNew
          ? { scene: scene.trim(), focus: focus.trim() }
          : { sceneId, focus: focus.trim() }
      ),
    });
    setBusy(false);
    if (res.ok) {
      onStarted();
      onClose();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "启动失败，请重试");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-panel border border-line rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-bold">定向探索 🔭</h2>
          <p className="text-xs text-muted mt-1">
            AI 沿场景蓝图（环节 × 角色）搜集该场景下的用户需求（已有 + 可创造），
            逐条生成卡片挂到蓝图环节上，并自动初筛。
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-muted">归入场景</label>
          <select
            value={isNew ? "new" : sceneId}
            onChange={(e) =>
              setSceneId(e.target.value === "new" ? "new" : Number(e.target.value))
            }
            className="bg-panel2 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="new">＋ 新建场景（AI 先生成蓝图）</option>
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（覆盖 {s.coveredStages}/{s.totalStages} 环节 · {s.cardCount} 需求）
              </option>
            ))}
          </select>
        </div>

        {isNew ? (
          <>
            <textarea
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              rows={4}
              autoFocus
              placeholder="例如：BD 商务谈判场景——商务人员从寻找线索、约见、准备材料到谈判跟进的整个过程"
              className="bg-panel2 border border-line rounded-xl p-3 text-sm outline-none focus:border-accent resize-none"
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setScene(ex)}
                  className="text-[11px] border border-line rounded-lg px-2 py-1 text-muted hover:text-foreground hover:border-accent/50"
                >
                  {ex.slice(0, 16)}…
                </button>
              ))}
            </div>
          </>
        ) : (
          selected && (
            <div className="bg-panel2 border border-line rounded-xl p-3 text-xs text-muted flex flex-col gap-1.5">
              {selected.description && <p>{selected.description}</p>}
              <div className="flex flex-wrap gap-1">
                {selected.blueprint.stages.map((st) => {
                  const n = selected.stageCounts[st.name] ?? 0;
                  return (
                    <span
                      key={st.name}
                      className={`text-[10px] border rounded px-1.5 py-0.5 ${
                        n > 0
                          ? "border-good/40 bg-good/10 text-good"
                          : "border-bad/40 bg-bad/5 text-bad/80"
                      }`}
                    >
                      {st.name} {n > 0 ? n : "缺口"}
                    </span>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted/70">
                提示：在下方关注点里写上缺口环节，AI 会优先补齐。
              </p>
            </div>
          )
        )}

        <textarea
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          rows={3}
          placeholder={"（可选）你特别关注的环节或已有的想法，每行一条——AI 会逐一覆盖。例如：\n沟通前帮我收集合作商家的信息\n基于商家情况生成合作创意和方案"}
          className="bg-panel2 border border-line rounded-xl p-3 text-sm outline-none focus:border-accent resize-none"
        />

        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <span className="text-[11px] text-muted mr-auto">
            探索在后台运行 1-2 分钟，结果出现在场景看板与流水线
          </span>
          <button
            onClick={onClose}
            className="text-sm text-muted hover:text-foreground px-3 py-2"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy || !canSubmit}
            className="bg-accent text-black font-semibold text-sm rounded-lg px-5 py-2 disabled:opacity-40 hover:opacity-90"
          >
            {busy ? "启动中…" : "开始探索"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import CardItem, { type CardListItem } from "@/components/CardItem";
import CardDetail from "@/components/CardDetail";
import type { SceneBlueprint } from "@/lib/types";

interface SceneDetail {
  id: number;
  name: string;
  description: string | null;
  blueprint: SceneBlueprint;
}

/** 编辑草稿：环节额外携带原名，保存时据此生成改名映射（同步已挂载卡片） */
interface DraftBlueprint {
  stages: { name: string; description: string; orig?: string }[];
  personas: { name: string; description: string }[];
}

export default function SceneDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sceneId = Number(params.id);

  const [scene, setScene] = useState<SceneDetail | null>(null);
  const [cards, setCards] = useState<CardListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [persona, setPersona] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftBlueprint | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/scenes/${sceneId}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setScene(data.scene);
        setCards(data.cards);
      }
    } catch {
      // ignore transient errors
    }
  }, [sceneId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  function startEdit() {
    if (!scene) return;
    setDraft({
      stages: scene.blueprint.stages.map((s) => ({ ...s, orig: s.name })),
      personas: scene.blueprint.personas.map((p) => ({ ...p })),
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!draft) return;
    const kept = draft.stages.filter((s) => s.name.trim());
    if (kept.length === 0) return;
    const stageRenames: Record<string, string> = {};
    for (const s of kept) {
      if (s.orig && s.orig !== s.name) stageRenames[s.orig] = s.name;
    }
    setBusy(true);
    await fetch(`/api/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blueprint: {
          stages: kept.map(({ name, description }) => ({ name, description })),
          personas: draft.personas.filter((p) => p.name.trim()),
        },
        stageRenames,
      }),
    });
    setBusy(false);
    setEditing(false);
    load();
  }

  async function removeScene() {
    if (!confirm(`删除场景「${scene?.name}」？卡片不会被删除，只是解除归属。`)) return;
    await fetch(`/api/scenes/${sceneId}`, { method: "DELETE" });
    router.push("/scenes");
  }

  if (notFound) {
    return (
      <main className="flex-1 flex items-center justify-center text-muted text-sm">
        场景不存在。<Link href="/scenes" className="text-accent ml-1">返回场景看板</Link>
      </main>
    );
  }
  if (!scene) {
    return <main className="flex-1 flex items-center justify-center text-muted text-sm">加载中…</main>;
  }

  const shown = persona ? cards.filter((c) => c.persona === persona) : cards;
  const stageNames = new Set(scene.blueprint.stages.map((s) => s.name));
  const otherCards = shown.filter((c) => !c.stage || !stageNames.has(c.stage));
  const covered = scene.blueprint.stages.filter((s) =>
    cards.some((c) => c.stage === s.name)
  ).length;
  const total = scene.blueprint.stages.length;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <main className="flex-1 flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-64">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Link href="/scenes" className="hover:text-foreground">场景看板</Link>
            <span>/</span>
          </div>
          <h1 className="font-bold text-lg mt-0.5">{scene.name}</h1>
          {scene.description && <p className="text-xs text-muted mt-1">{scene.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right mr-2">
            <div className={`text-xl font-bold ${pct >= 80 ? "text-good" : pct >= 40 ? "text-warn" : "text-bad"}`}>
              {pct}%
            </div>
            <div className="text-[10px] text-muted">环节覆盖 {covered}/{total}</div>
          </div>
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="text-sm text-muted hover:text-foreground px-3 py-2"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                disabled={busy}
                className="bg-accent text-black font-semibold text-sm rounded-lg px-4 py-2 disabled:opacity-40"
              >
                {busy ? "保存中…" : "保存蓝图"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                className="border border-line text-sm rounded-lg px-3 py-2 text-muted hover:text-foreground hover:border-accent/50"
              >
                ✏️ 编辑蓝图
              </button>
              <button
                onClick={removeScene}
                className="border border-line text-sm rounded-lg px-3 py-2 text-muted hover:text-bad hover:border-bad/50"
              >
                删除
              </button>
            </>
          )}
        </div>
      </div>

      {scene.blueprint.personas.length > 0 && !editing && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted mr-1">角色：</span>
          <button
            onClick={() => setPersona("")}
            className={`border rounded-lg px-2.5 py-1 ${persona === "" ? "border-accent/60 text-accent bg-accent/10" : "border-line text-muted hover:text-foreground"}`}
          >
            全部
          </button>
          {scene.blueprint.personas.map((p) => (
            <button
              key={p.name}
              onClick={() => setPersona(persona === p.name ? "" : p.name)}
              title={p.description}
              className={`border rounded-lg px-2.5 py-1 ${persona === p.name ? "border-violet-400/60 text-violet-300 bg-violet-400/10" : "border-line text-muted hover:text-foreground"}`}
            >
              {p.name}（{cards.filter((c) => c.persona === p.name).length}）
            </button>
          ))}
          {cards.some((c) => !c.persona) && (
            <span className="text-[10px] text-muted/60 ml-1">
              另有 {cards.filter((c) => !c.persona).length} 张未标角色
            </span>
          )}
        </div>
      )}

      {editing && draft ? (
        <div className="flex flex-col gap-4 max-w-3xl">
          <div className="bg-panel/60 border border-line rounded-xl p-4 flex flex-col gap-2">
            <h3 className="text-sm font-bold">环节（按旅程顺序）</h3>
            {draft.stages.map((s, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  value={s.name}
                  onChange={(e) =>
                    setDraft({ ...draft, stages: draft.stages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })
                  }
                  className="w-40 bg-panel2 border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:border-accent"
                  placeholder="环节名"
                />
                <input
                  value={s.description}
                  onChange={(e) =>
                    setDraft({ ...draft, stages: draft.stages.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })
                  }
                  className="flex-1 bg-panel2 border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:border-accent"
                  placeholder="环节说明"
                />
                <button
                  onClick={() => setDraft({ ...draft, stages: draft.stages.filter((_, j) => j !== i) })}
                  className="text-muted hover:text-bad px-1.5 py-1.5 text-sm"
                  title="删除环节"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => setDraft({ ...draft, stages: [...draft.stages, { name: "", description: "" }] })}
              className="self-start text-xs text-accent hover:opacity-80 mt-1"
            >
              ＋ 添加环节
            </button>
          </div>
          <div className="bg-panel/60 border border-line rounded-xl p-4 flex flex-col gap-2">
            <h3 className="text-sm font-bold">角色</h3>
            {draft.personas.map((p, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  value={p.name}
                  onChange={(e) =>
                    setDraft({ ...draft, personas: draft.personas.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })
                  }
                  className="w-40 bg-panel2 border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:border-accent"
                  placeholder="角色名"
                />
                <input
                  value={p.description}
                  onChange={(e) =>
                    setDraft({ ...draft, personas: draft.personas.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })
                  }
                  className="flex-1 bg-panel2 border border-line rounded-lg px-2 py-1.5 text-sm outline-none focus:border-accent"
                  placeholder="角色说明"
                />
                <button
                  onClick={() => setDraft({ ...draft, personas: draft.personas.filter((_, j) => j !== i) })}
                  className="text-muted hover:text-bad px-1.5 py-1.5 text-sm"
                  title="删除角色"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => setDraft({ ...draft, personas: [...draft.personas, { name: "", description: "" }] })}
              className="self-start text-xs text-accent hover:opacity-80 mt-1"
            >
              ＋ 添加角色
            </button>
          </div>
          <p className="text-[11px] text-muted">
            改环节名会同步已挂载的卡片；删除环节后，原环节下的卡片会进入「未归入环节」。
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 items-start min-w-max pb-2">
            {scene.blueprint.stages.map((s, i) => {
              const stageCards = shown.filter((c) => c.stage === s.name);
              const isGap = !cards.some((c) => c.stage === s.name);
              return (
                <div
                  key={s.name}
                  className={`w-72 shrink-0 bg-panel/60 border rounded-xl flex flex-col max-h-[calc(100vh-18rem)] ${
                    isGap ? "border-bad/40" : "border-line"
                  }`}
                >
                  <div className="px-3 py-2.5 border-b border-line sticky top-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted/70">{i + 1}</span>
                      <span className={`text-xs font-bold ${isGap ? "text-bad" : "text-foreground"}`}>
                        {s.name}
                      </span>
                      <span className="text-[10px] text-muted bg-panel2 rounded-full px-1.5 py-0.5">
                        {stageCards.length}
                      </span>
                      {isGap && (
                        <span className="text-[10px] text-bad border border-bad/40 bg-bad/10 rounded px-1.5 py-0.5 ml-auto">
                          缺口
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted mt-1 line-clamp-2">{s.description}</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                    {stageCards.length === 0 ? (
                      <p className="text-[11px] text-muted/60 text-center py-6">
                        {isGap ? "尚未收集到该环节的需求" : "当前筛选下无卡片"}
                      </p>
                    ) : (
                      stageCards.map((card) => (
                        <CardItem key={card.id} card={card} onClick={() => setSelectedId(card.id)} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
            {otherCards.length > 0 && (
              <div className="w-72 shrink-0 bg-panel/40 border border-dashed border-line rounded-xl flex flex-col max-h-[calc(100vh-18rem)]">
                <div className="px-3 py-2.5 border-b border-line">
                  <span className="text-xs font-bold text-muted">未归入环节</span>
                  <span className="text-[10px] text-muted bg-panel2 rounded-full px-1.5 py-0.5 ml-2">
                    {otherCards.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                  {otherCards.map((card) => (
                    <CardItem key={card.id} card={card} onClick={() => setSelectedId(card.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedId !== null && (
        <CardDetail cardId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
      )}
    </main>
  );
}

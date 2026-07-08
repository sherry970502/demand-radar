"use client";

import { useCallback, useEffect, useState } from "react";
import StatusBar from "@/components/StatusBar";
import CardItem, { type CardListItem } from "@/components/CardItem";
import CardTable from "@/components/CardTable";
import CardDetail from "@/components/CardDetail";
import SubmitModal from "@/components/SubmitModal";
import ExploreModal from "@/components/ExploreModal";
import { CATEGORY_OPTIONS, type CardStatus } from "@/lib/types";

function mergeCategories(dynamic: string[]): string[] {
  return [...new Set([...CATEGORY_OPTIONS, ...dynamic])];
}

const COLUMNS: { key: string; label: string; statuses: CardStatus[]; accent: string }[] = [
  { key: "pending", label: "待初筛", statuses: ["pending_screening"], accent: "text-muted" },
  { key: "screened", label: "已初筛 · 待定", statuses: ["screened"], accent: "text-warn" },
  { key: "analyzing", label: "分析中", statuses: ["analyzing"], accent: "text-accent" },
  { key: "analyzed", label: "已分析", statuses: ["analyzed"], accent: "text-good" },
  { key: "done", label: "已归档 / 已采纳", statuses: ["archived", "adopted"], accent: "text-muted" },
];

export default function BoardPage() {
  const [cards, setCards] = useState<CardListItem[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [demand, setDemand] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showExplore, setShowExplore] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("adr_view") === "list") setView("list");
  }, []);

  function switchView(v: "board" | "list") {
    setView(v);
    localStorage.setItem("adr_view", v);
  }

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (source) params.set("source", source);
    if (priority) params.set("priority", priority);
    if (category) params.set("category", category);
    if (demand) params.set("demand", demand);
    if (view === "list" && statusFilter) params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/cards?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCards(data.cards);
        setAllCategories(data.categories ?? []);
      }
    } catch {
      // ignore transient errors
    }
  }, [source, priority, category, demand, view, statusFilter]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <main className="flex-1 flex flex-col gap-4 p-5">
      <StatusBar />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex border border-line rounded-lg overflow-hidden text-xs">
          <button
            onClick={() => switchView("board")}
            className={`px-3 py-1.5 ${view === "board" ? "bg-panel2 text-foreground" : "text-muted hover:text-foreground"}`}
          >
            流程看板
          </button>
          <button
            onClick={() => switchView("list")}
            className={`px-3 py-1.5 border-l border-line ${view === "list" ? "bg-panel2 text-foreground" : "text-muted hover:text-foreground"}`}
          >
            列表审阅
          </button>
        </div>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="bg-panel border border-line rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="">全部来源</option>
          <option value="reddit">Reddit</option>
          <option value="report">研报</option>
          <option value="manual">人工创意</option>
          <option value="explore">定向探索</option>
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="bg-panel border border-line rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="">全部优先级</option>
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-panel border border-line rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="">全部分类</option>
          {mergeCategories(allCategories).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={demand}
          onChange={(e) => setDemand(e.target.value)}
          className="bg-panel border border-line rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="">全部需求类型</option>
          <option value="existing">已有需求</option>
          <option value="created">✨ 创造需求</option>
        </select>
        {view === "list" && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-panel border border-line rounded-lg px-2.5 py-1.5 text-xs"
          >
            <option value="">全部状态</option>
            <option value="pending_screening">待初筛</option>
            <option value="screened">已初筛 · 待定</option>
            <option value="analyzing">分析中</option>
            <option value="analyzed">已分析</option>
            <option value="archived">已归档</option>
            <option value="adopted">已采纳</option>
          </select>
        )}

        <button
          onClick={() => setShowExplore(true)}
          className="ml-auto border border-accent/50 text-accent font-semibold text-sm rounded-xl px-4 py-2 hover:bg-accent/10"
        >
          🔭 定向探索
        </button>
        <button
          onClick={() => setShowSubmit(true)}
          className="bg-accent text-black font-semibold text-sm rounded-xl px-5 py-2 hover:opacity-90 shadow-lg shadow-accent/20"
        >
          💡 投递创意
        </button>
      </div>

      {view === "list" ? (
        <CardTable cards={cards} onSelect={setSelectedId} />
      ) : (
      <div className="flex-1 grid grid-cols-2 lg:grid-cols-5 gap-3 items-start">
        {COLUMNS.map((col) => {
          const colCards = cards.filter((c) => col.statuses.includes(c.status));
          return (
            <div
              key={col.key}
              className="bg-panel/60 border border-line rounded-xl flex flex-col max-h-[calc(100vh-16rem)]"
            >
              <div className="px-3 py-2.5 border-b border-line flex items-center gap-2 sticky top-0">
                <span className={`text-xs font-bold ${col.accent}`}>{col.label}</span>
                <span className="text-[10px] text-muted bg-panel2 rounded-full px-1.5 py-0.5">
                  {colCards.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                {colCards.length === 0 ? (
                  <p className="text-[11px] text-muted/60 text-center py-6">暂无卡片</p>
                ) : (
                  colCards.map((card) => (
                    <CardItem
                      key={card.id}
                      card={card}
                      onClick={() => setSelectedId(card.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {selectedId !== null && (
        <CardDetail
          cardId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
      {showSubmit && (
        <SubmitModal onClose={() => setShowSubmit(false)} onSubmitted={load} />
      )}
      {showExplore && (
        <ExploreModal onClose={() => setShowExplore(false)} onStarted={load} />
      )}
    </main>
  );
}

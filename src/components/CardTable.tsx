"use client";

import type { CardListItem } from "./CardItem";
import { DEMAND_LABELS, SOURCE_LABELS, STATUS_LABELS } from "@/lib/types";
import { VERDICT_META, PRIORITY_CLS, parseCategories, fmtTime } from "./utils";

export default function CardTable({
  cards,
  onSelect,
}: {
  cards: CardListItem[];
  onSelect: (id: number) => void;
}) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted bg-panel border border-line rounded-xl p-8 text-center">
        当前筛选条件下暂无卡片
      </p>
    );
  }
  return (
    <div className="bg-panel border border-line rounded-xl overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted border-b border-line text-left">
            <th className="px-3 py-2.5 font-semibold">#</th>
            <th className="px-3 py-2.5 font-semibold w-full">需求标题</th>
            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">评分</th>
            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">结论</th>
            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">类型</th>
            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">分类</th>
            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">来源</th>
            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">状态</th>
            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">时间</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="border-b border-line/50 last:border-0 hover:bg-panel2 cursor-pointer transition-colors"
            >
              <td className="px-3 py-2.5 text-muted whitespace-nowrap">{c.id}</td>
              <td className="px-3 py-2.5">
                <span className="text-[13px]">
                  {c.title ?? <span className="text-muted">{c.snippet ?? "…"}</span>}
                </span>
                {c.human_touched === 1 && (
                  <span className="ml-1.5 text-accent text-[10px]">已干预</span>
                )}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {c.priority ? (
                  <span className={`border rounded px-1.5 py-0.5 ${PRIORITY_CLS[c.priority]}`}>
                    {c.priority} · {c.priority_score}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {c.screening_verdict ? (
                  <span
                    className={`border rounded px-1.5 py-0.5 ${VERDICT_META[c.screening_verdict].cls}`}
                  >
                    {VERDICT_META[c.screening_verdict].label}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {c.demand_type ? (
                  <span
                    className={
                      c.demand_type === "created" ? "text-fuchsia-300" : "text-sky-300"
                    }
                  >
                    {c.demand_type === "created" ? "✨" : ""}
                    {DEMAND_LABELS[c.demand_type]}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                {parseCategories(c.category).join(" / ") || "—"}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                {SOURCE_LABELS[c.source_type]}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                {STATUS_LABELS[c.status]}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-muted/70">
                {fmtTime(c.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import type { Card } from "@/lib/types";
import { DEMAND_LABELS, SOURCE_LABELS } from "@/lib/types";
import { VERDICT_META, PRIORITY_CLS, parseCategories, fmtTime } from "./utils";

export type CardListItem = Card & { snippet?: string };

const SOURCE_ICON: Record<string, string> = {
  reddit: "👽",
  report: "📄",
  manual: "💡",
  explore: "🔭",
};

export default function CardItem({
  card,
  onClick,
}: {
  card: CardListItem;
  onClick: () => void;
}) {
  const categories = parseCategories(card.category);
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-panel2 border border-line rounded-xl p-3 hover:border-accent/60 transition-colors flex flex-col gap-2"
    >
      <div className="text-[13px] leading-snug font-medium">
        {card.title ?? (
          <span className="text-muted font-normal">{card.snippet ?? "…"}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-muted">
          {SOURCE_ICON[card.source_type]} {SOURCE_LABELS[card.source_type]}
        </span>
        {card.priority && (
          <span className={`border rounded px-1.5 py-0.5 ${PRIORITY_CLS[card.priority]}`}>
            {card.priority}
          </span>
        )}
        {card.priority_score != null && (
          <span className="text-accent font-semibold">{card.priority_score}</span>
        )}
        {card.screening_verdict && (
          <span
            className={`border rounded px-1.5 py-0.5 ${VERDICT_META[card.screening_verdict].cls}`}
          >
            {VERDICT_META[card.screening_verdict].label}
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
        {card.human_touched === 1 && (
          <span className="border border-accent/40 bg-accent/10 text-accent rounded px-1.5 py-0.5">
            已干预
          </span>
        )}
        {card.status === "adopted" && (
          <span className="border border-good/40 bg-good/10 text-good rounded px-1.5 py-0.5">
            已采纳
          </span>
        )}
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1 text-[10px] text-muted">
          {categories.map((c) => (
            <span key={c} className="bg-panel border border-line rounded px-1 py-0.5">
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="text-[10px] text-muted/70">{fmtTime(card.created_at)}</div>
    </button>
  );
}

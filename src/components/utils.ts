import type { Priority, Verdict } from "@/lib/types";

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const VERDICT_META: Record<Verdict, { label: string; cls: string }> = {
  worth: { label: "值得做", cls: "text-good border-good/40 bg-good/10" },
  not_worth: { label: "不值得做", cls: "text-bad border-bad/40 bg-bad/10" },
  uncertain: { label: "待定", cls: "text-warn border-warn/40 bg-warn/10" },
};

export const PRIORITY_CLS: Record<Priority, string> = {
  P0: "text-bad border-bad/40 bg-bad/10",
  P1: "text-warn border-warn/40 bg-warn/10",
  P2: "text-muted border-line bg-panel2",
};

export function parseCategories(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

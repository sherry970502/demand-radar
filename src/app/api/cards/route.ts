import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { submitIdea } from "@/lib/pipeline";
import type { Card } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  const priority = url.searchParams.get("priority");
  const category = url.searchParams.get("category");
  const demand = url.searchParams.get("demand");

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (status) {
    const list = status.split(",");
    clauses.push(`status IN (${list.map(() => "?").join(",")})`);
    params.push(...list);
  }
  if (source) {
    clauses.push("source_type = ?");
    params.push(source);
  }
  if (priority) {
    clauses.push("priority = ?");
    params.push(priority);
  }
  if (category) {
    clauses.push("category LIKE ?");
    params.push(`%"${category}"%`);
  }
  if (demand === "existing" || demand === "created") {
    clauses.push("demand_type = ?");
    params.push(demand);
  }
  const delivery = url.searchParams.get("delivery");
  if (delivery === "skill" || delivery === "combo") {
    clauses.push("delivery_mode = ?");
    params.push(delivery);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const cards = getDb()
    .prepare(
      `SELECT id, source_type, source_url, title, summary, category, demand_type,
              delivery_mode, skill_name, screening_verdict,
              screening_reason, priority, priority_score, status, human_touched,
              scene_id, stage, persona,
              created_at, updated_at, substr(raw_content, 1, 140) AS snippet
       FROM cards ${where}
       ORDER BY priority_score DESC NULLS LAST, created_at DESC
       LIMIT 500`
    )
    .all(...params) as Partial<Card>[];

  // 全库出现过的分类（含 AI 自拟的新标签），供看板筛选器动态展示
  const categoryRows = getDb()
    .prepare("SELECT category FROM cards WHERE category IS NOT NULL")
    .all() as { category: string }[];
  const categories = new Set<string>();
  for (const row of categoryRows) {
    try {
      for (const c of JSON.parse(row.category) as string[]) categories.add(c);
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ cards, categories: [...categories].sort() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    categories?: string[];
  };
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "内容不能为空" }, { status: 400 });
  }
  const id = submitIdea(content, body.categories ?? []);
  return NextResponse.json({ id }, { status: 201 });
}

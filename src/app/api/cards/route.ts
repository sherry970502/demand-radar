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
    clauses.push(`c.status IN (${list.map(() => "?").join(",")})`);
    params.push(...list);
  }
  if (source) {
    clauses.push("c.source_type = ?");
    params.push(source);
  }
  if (priority) {
    clauses.push("c.priority = ?");
    params.push(priority);
  }
  if (category) {
    clauses.push("c.category LIKE ?");
    params.push(`%"${category}"%`);
  }
  if (demand === "existing" || demand === "created") {
    clauses.push("c.demand_type = ?");
    params.push(demand);
  }
  // 生产工单筛选：none=未派发，其余为工单状态值（审核入口：?work=pending_signoff）
  const work = url.searchParams.get("work");
  if (work === "none") {
    clauses.push("c.work_status IS NULL");
  } else if (work) {
    clauses.push("c.work_status = ?");
    params.push(work);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const cards = getDb()
    .prepare(
      `SELECT c.id, c.source_type, c.source_url, c.title, c.summary, c.category, c.demand_type,
              c.screening_verdict, c.screening_reason, c.priority, c.priority_score,
              c.status, c.human_touched, c.scene_id, c.stage, c.persona,
              c.agent_asset_id, c.work_status, a.name AS agent_name,
              c.created_at, c.updated_at, substr(c.raw_content, 1, 140) AS snippet
       FROM cards c LEFT JOIN assets a ON a.id = c.agent_asset_id
       ${where}
       ORDER BY c.priority_score DESC NULLS LAST, c.created_at DESC
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

import { appFetch } from "../http";
import type { Collector, RawItem } from "./types";

const UA = "ai-demand-radar/0.1 (internal research tool)";

interface RedditPost {
  data: {
    title: string;
    selftext: string;
    permalink: string;
    stickied: boolean;
    over_18: boolean;
  };
}

// ---------- 官方 OAuth（配置 REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET 时启用） ----------

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOAuthToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const res = await appFetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Reddit OAuth 获取 token 失败：HTTP ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("Reddit OAuth 响应中没有 access_token");
  }
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

// ---------- 抓取 ----------

async function fetchSubreddit(sub: string): Promise<RawItem[]> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  let url: string;
  const headers: Record<string, string> = { "User-Agent": UA };

  if (clientId && clientSecret) {
    // 官方 OAuth API：稳定、正规（部分网络环境下公开接口被 Reddit WAF 拦截，必须走这里）
    const token = await getOAuthToken(clientId, clientSecret);
    url = `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/hot?limit=20&raw_json=1`;
    headers.Authorization = `Bearer ${token}`;
  } else {
    // 公开 JSON 接口：零配置，但可能被 Reddit 风控（返回 403 时请配置 OAuth 凭证）
    url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/hot.json?limit=20&raw_json=1`;
  }

  const res = await appFetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    const hint =
      res.status === 403 && !clientId
        ? "（公开接口被 Reddit 拦截，请在 .env.local 配置 REDDIT_CLIENT_ID/SECRET 走官方 API）"
        : "";
    throw new Error(`r/${sub} 请求失败：HTTP ${res.status}${hint}`);
  }
  const json = (await res.json()) as { data?: { children?: RedditPost[] } };
  const posts = json.data?.children ?? [];

  return posts
    .filter((p) => !p.data.stickied && !p.data.over_18)
    .map((p) => ({
      sourceType: "reddit" as const,
      sourceUrl: `https://www.reddit.com${p.data.permalink}`,
      title: p.data.title,
      content: `[r/${sub}] ${p.data.title}\n\n${p.data.selftext ?? ""}`.trim(),
    }));
}

export const redditCollector: Collector = {
  name: "reddit",
  needsPrefilter: true,
  isEnabled: (s) => s.collector_reddit_enabled,
  async collect(settings) {
    const items: RawItem[] = [];
    const errors: string[] = [];
    for (const sub of settings.subreddits) {
      try {
        items.push(...(await fetchSubreddit(sub.trim())));
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (items.length === 0 && errors.length > 0) {
      throw new Error(errors.join("；"));
    }
    return items;
  },
};

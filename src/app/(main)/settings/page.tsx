"use client";

import { useEffect, useState } from "react";
import type { AppSettings } from "@/lib/settings";
import { ANALYSIS_SYSTEM } from "@/lib/ai/prompts";

const MODEL_PRESETS: { id: string; label: string }[] = [
  { id: "claude-sonnet-5", label: "claude-sonnet-5（快·性价比，初筛推荐）" },
  { id: "claude-opus-4-8", label: "claude-opus-4-8（最强，深度分析推荐）" },
  { id: "claude-haiku-4-5", label: "claude-haiku-4-5（最便宜最快）" },
  { id: "claude-sonnet-4-6", label: "claude-sonnet-4-6（上一代 Sonnet）" },
];

function ModelPicker({
  value,
  onChange,
  inputCls,
}: {
  value: string;
  onChange: (v: string) => void;
  inputCls: string;
}) {
  const isPreset = MODEL_PRESETS.some((m) => m.id === value);
  const [custom, setCustom] = useState(false);
  const showCustom = custom || !isPreset;

  return (
    <div className="flex flex-col gap-2">
      <select
        value={showCustom ? "__custom" : value}
        onChange={(e) => {
          if (e.target.value === "__custom") {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        className={inputCls}
      >
        {MODEL_PRESETS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
        <option value="__custom">自定义模型 ID…</option>
      </select>
      {showCustom && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例如 claude-sonnet-5"
          className={inputCls}
        />
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings);
        setHasApiKey(data.hasApiKey);
      });
  }, []);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    setSaved(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  if (!settings) {
    return <main className="p-5 text-muted text-sm">加载中…</main>;
  }

  const inputCls =
    "bg-panel2 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent w-full";
  const labelCls = "text-xs text-muted font-semibold";

  return (
    <main className="flex-1 p-5 max-w-3xl w-full mx-auto flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold">设置</h1>
        <button
          onClick={save}
          disabled={saving}
          className="ml-auto bg-accent text-black font-semibold text-sm rounded-xl px-6 py-2 hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "保存中…" : saved ? "已保存 ✓" : "保存设置"}
        </button>
      </div>

      {!hasApiKey && (
        <div className="bg-bad/10 border border-bad/40 text-bad text-sm rounded-xl p-4">
          ⚠ 未检测到 ANTHROPIC_API_KEY。请在项目根目录的 <code>.env.local</code> 中配置：
          <code className="block mt-1 bg-panel px-2 py-1 rounded">
            ANTHROPIC_API_KEY=sk-ant-…
          </code>
          然后重启服务。密钥只存于环境变量，不入库、不进前端。
        </div>
      )}

      <section className="bg-panel border border-line rounded-xl p-5 flex flex-col gap-4">
        <h2 className="text-sm font-bold">定时任务与成本护栏</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>每日采集时间</span>
            <input
              type="time"
              value={settings.daily_run_time}
              onChange={(e) => update("daily_run_time", e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>每日入库上限（条）</span>
            <input
              type="number"
              min={1}
              value={settings.daily_intake_limit}
              onChange={(e) => update("daily_intake_limit", Number(e.target.value))}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>每日 AI 调用上限（次）</span>
            <input
              type="number"
              min={1}
              value={settings.daily_ai_call_limit}
              onChange={(e) => update("daily_ai_call_limit", Number(e.target.value))}
              className={inputCls}
            />
          </label>
        </div>
        <p className="text-[11px] text-muted">
          定时任务在应用进程常驻时生效；本地关掉服务则退化为手动触发。超过 AI
          调用上限后当日处理暂停，看板顶部会报警。
        </p>
      </section>

      <section className="bg-panel border border-line rounded-xl p-5 flex flex-col gap-4">
        <h2 className="text-sm font-bold">采集渠道</h2>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.collector_reddit_enabled}
              onChange={(e) => update("collector_reddit_enabled", e.target.checked)}
            />
            启用 Reddit 采集
          </label>
          <label className="flex flex-col gap-1.5 mt-2">
            <span className={labelCls}>监控的 subreddit（每行一个，不带 r/）</span>
            <textarea
              rows={4}
              value={settings.subreddits.join("\n")}
              onChange={(e) =>
                update(
                  "subreddits",
                  e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                )
              }
              className={inputCls}
            />
          </label>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-line pt-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.collector_research_enabled}
              onChange={(e) => update("collector_research_enabled", e.target.checked)}
            />
            启用研报/文章搜索（Claude Web Search）
          </label>
          <label className="flex flex-col gap-1.5 mt-2">
            <span className={labelCls}>搜索关键词（每行一个）</span>
            <textarea
              rows={4}
              value={settings.research_keywords.join("\n")}
              onChange={(e) =>
                update(
                  "research_keywords",
                  e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
                )
              }
              className={inputCls}
            />
          </label>
        </div>
      </section>

      <section className="bg-panel border border-line rounded-xl p-5 flex flex-col gap-4">
        <h2 className="text-sm font-bold">初筛策略</h2>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>
            平台契合度描述（会注入初筛 prompt 的评分维度，公司战略变化时在这里改）
          </span>
          <textarea
            rows={5}
            value={settings.fit_description}
            onChange={(e) => update("fit_description", e.target.value)}
            className={inputCls}
          />
        </label>
      </section>

      <section className="bg-panel border border-line rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold">深度分析策略</h2>
          {settings.analysis_system_prompt !== ANALYSIS_SYSTEM && (
            <button
              onClick={() => update("analysis_system_prompt", ANALYSIS_SYSTEM)}
              className="ml-auto text-xs text-muted hover:text-foreground border border-line rounded-lg px-2.5 py-1"
            >
              恢复默认提示词
            </button>
          )}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>
            深度分析 System Prompt（保存后实时生效，下一次分析即使用新提示词）
          </span>
          <textarea
            rows={16}
            value={settings.analysis_system_prompt}
            onChange={(e) => update("analysis_system_prompt", e.target.value)}
            className={`${inputCls} font-mono text-xs leading-relaxed`}
          />
        </label>
        <p className="text-[11px] text-muted">
          ⚠ 末尾的 <code>&lt;delivery&gt;</code> 机器可读块说明不要删——系统靠它解析「资源预估」
          （capabilities 草图）；删掉后报告仍能生成，但预估字段会为空。清空整个文本框则回退到代码内默认提示词。
        </p>
      </section>

      <section className="bg-panel border border-line rounded-xl p-5 flex flex-col gap-4">
        <h2 className="text-sm font-bold">模型</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>初筛 / 预过滤模型（研报搜索也用它）</span>
            <ModelPicker
              value={settings.screening_model}
              onChange={(v) => update("screening_model", v)}
              inputCls={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>深度分析模型</span>
            <ModelPicker
              value={settings.analysis_model}
              onChange={(v) => update("analysis_model", v)}
              inputCls={inputCls}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

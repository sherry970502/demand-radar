"use client";

import { useState } from "react";

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
  const [scene, setScene] = useState("");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (scene.trim().length < 4) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/explore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene: scene.trim(), focus: focus.trim() }),
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
            描述一个你关心的场景 / 人群 / 行业，AI 会去网络上搜集这个场景下的用户需求
            （已有需求 + 可创造的需求），逐条生成卡片进入流水线自动初筛。
          </p>
        </div>
        <textarea
          value={scene}
          onChange={(e) => setScene(e.target.value)}
          rows={4}
          autoFocus
          placeholder="例如：BD 商务谈判场景——商务人员从寻找线索、约见、准备材料到谈判跟进的整个过程"
          className="bg-panel2 border border-line rounded-xl p-3 text-sm outline-none focus:border-accent resize-none"
        />
        <textarea
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          rows={3}
          placeholder="（可选）你特别关注的环节或已有的想法，每行一条——AI 会逐一覆盖。例如：\n沟通前帮我收集合作商家的信息\n基于商家情况生成合作创意和方案\n寻找更多潜在合作对象"
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
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <span className="text-[11px] text-muted mr-auto">
            探索在后台运行 1-2 分钟，结果以「探索」来源出现在看板
          </span>
          <button
            onClick={onClose}
            className="text-sm text-muted hover:text-foreground px-3 py-2"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy || scene.trim().length < 4}
            className="bg-accent text-black font-semibold text-sm rounded-lg px-5 py-2 disabled:opacity-40 hover:opacity-90"
          >
            {busy ? "启动中…" : "开始探索"}
          </button>
        </div>
      </div>
    </div>
  );
}

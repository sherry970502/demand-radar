"use client";

import { useState } from "react";
import { CATEGORY_OPTIONS } from "@/lib/types";

export default function SubmitModal({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [content, setContent] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function toggleCategory(c: string) {
    setCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  async function submit() {
    if (!content.trim()) return;
    setBusy(true);
    const res = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.trim(), categories }),
    });
    setBusy(false);
    if (res.ok) {
      onSubmitted();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-panel border border-line rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-bold">投递创意 💡</h2>
          <p className="text-xs text-muted mt-1">
            随手写一句就行，例如「我想要一个能帮我整理会议纪要的 AI」。它会进入待初筛，走和采集数据完全相同的流水线。
          </p>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          autoFocus
          placeholder="我想要一个能帮我……的 AI"
          className="bg-panel2 border border-line rounded-xl p-3 text-sm outline-none focus:border-accent resize-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_OPTIONS.map((c) => (
            <button
              key={c}
              onClick={() => toggleCategory(c)}
              className={`text-xs border rounded-lg px-2 py-1 transition-colors ${
                categories.includes(c)
                  ? "border-accent text-accent bg-accent/10"
                  : "border-line text-muted hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm text-muted hover:text-foreground px-3 py-2"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy || !content.trim()}
            className="bg-accent text-black font-semibold text-sm rounded-lg px-5 py-2 disabled:opacity-40 hover:opacity-90"
          >
            {busy ? "投递中…" : "投递"}
          </button>
        </div>
      </div>
    </div>
  );
}

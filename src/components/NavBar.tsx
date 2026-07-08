"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "看板" },
  { href: "/runs", label: "运行日志" },
  { href: "/settings", label: "设置" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  }

  return (
    <nav className="border-b border-line bg-panel px-5 py-3 flex items-center gap-6 sticky top-0 z-30">
      <span className="font-bold text-[15px] tracking-wide">
        <span className="text-accent">◈</span> AI 需求情报看板
      </span>
      <div className="flex items-center gap-1">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              pathname === l.href
                ? "bg-panel2 text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
      <button
        onClick={logout}
        className="ml-auto text-xs text-muted hover:text-foreground"
      >
        退出
      </button>
    </nav>
  );
}

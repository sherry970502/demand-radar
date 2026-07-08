import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 需求情报看板",
  description: "AI 自主运转的用户需求情报流水线",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

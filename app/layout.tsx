import type { Metadata } from "next";
import "./globals.css";
import "./watch.css";

export const metadata: Metadata = {
  title: "链上观察 · 多链喊单看板",
  description: "公共合约收录、首次市值和个人收藏，多链行情独立刷新。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}

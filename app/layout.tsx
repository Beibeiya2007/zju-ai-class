import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "课间 · Lecture Atlas",
  description: "连接课件、课堂录音与知识点的个人学习工作台。",
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

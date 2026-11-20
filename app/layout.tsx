import type { Metadata } from "next";
export const metadata: Metadata = { title: "抽奖台", description: "中南民族大学校园活动现场抽奖", icons: { icon: "/mark.svg?v=2" } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

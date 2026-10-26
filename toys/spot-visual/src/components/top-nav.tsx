"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Compass,
  MapPin,
  UtensilsCrossed,
  GraduationCap,
  BookOpen,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MODULES = [
  { href: "/", label: "景点览胜", icon: MapPin, desc: "探索全国精选景点" },
  {
    href: "/food",
    label: "中国味道",
    icon: UtensilsCrossed,
    desc: "一省一菜·口味地图",
  },
  {
    href: "/gaokao",
    label: "志愿探索",
    icon: GraduationCap,
    desc: "分数位次·冲稳保",
  },
  { href: "/about", label: "作品介绍", icon: BookOpen, desc: "这作品做了什么" },
  {
    href: "/sources",
    label: "数据来源",
    icon: Database,
    desc: "出处与覆盖边界",
  },
];

export function TopNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 保留分享链接的 ?sharecode=... ，避免子路由跳转/刷新时丢失访问参数
  const qs = searchParams?.toString() ?? "";
  const withQuery = (path: string) => (qs ? `${path}?${qs}` : path);
  return (
    <header className="sticky top-0 z-50 h-[var(--nav-h,52px)] flex items-center gap-3 px-4 border-b border-gray-200/80 bg-white/85 backdrop-blur-md">
      <Link href={withQuery("/")} className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <Compass className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-gray-900 text-sm tracking-tight">
          华夏探索
        </span>
        <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
          1024 造物节
        </span>
      </Link>

      <nav className="flex items-center gap-1 ml-auto">
        {MODULES.map((m) => {
          const active = pathname === m.href;
          const Icon = m.icon;
          return (
            <Link
              key={m.href}
              href={withQuery(m.href)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "text-emerald-700"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-50",
              )}
            >
              {active && (
                <motion.span
                  layoutId="topnav-active"
                  className="absolute inset-0 rounded-lg bg-emerald-50 border border-emerald-200"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className="w-4 h-4 relative z-10" />
              <span className="relative z-10 hidden sm:inline">{m.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

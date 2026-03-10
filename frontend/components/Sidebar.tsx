"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◈" },
  { href: "/campaigns", label: "Pipeline", icon: "⟳" },
  { href: "/leads", label: "Leads", icon: "◉" },
  { href: "/optimizer", label: "Optimizer", icon: "✦" },
  { href: "/reddit", label: "Reddit", icon: "◆" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-gray-800">
        <span className="font-bold text-brand-500 text-lg tracking-tight">ProspectAI</span>
        <p className="text-xs text-gray-500 mt-0.5">outreach · automated</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              path.startsWith(item.href)
                ? "bg-brand-500/10 text-brand-500 font-medium"
                : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-gray-800">
        <Link href="/onboarding" className="text-xs text-gray-500 hover:text-gray-300">
          + New workspace
        </Link>
      </div>
    </aside>
  );
}

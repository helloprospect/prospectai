"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
        <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.4" />
        <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.4" />
        <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.7" />
      </svg>
    ),
  },
  {
    href: "/campaigns",
    label: "Pipeline",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/leads",
    label: "Leads",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/optimizer",
    label: "Optimizer",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2l1.5 3 3.5.5-2.5 2.5.5 3.5L8 10l-3 1.5.5-3.5L3 5.5l3.5-.5L8 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.2 3.2l.85.85M11.95 11.95l.85.85M3.2 12.8l.85-.85M11.95 4.05l.85-.85" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/reddit",
    label: "Reddit",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="9" r="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 9.5c0-.5.5-1 1-1M9.5 9.5c0-.5.5-1 1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="5.5" cy="8" r="1" fill="currentColor" />
        <circle cx="10.5" cy="8" r="1" fill="currentColor" />
        <path d="M6 11.5c.5.5 3.5.5 4 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="11.5" cy="3.5" r="1" fill="currentColor" />
        <path d="M8 4l3 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const path = usePathname();

  // Hide sidebar on onboarding
  if (path === "/onboarding") return null;

  return (
    <aside className="w-[220px] flex-shrink-0 bg-[#111113] border-r border-[#27272a] flex flex-col min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 11L7 3l5 8H2z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <div>
            <span className="font-semibold text-[#fafafa] text-sm tracking-tight">ProspectAI</span>
            <p className="text-[10px] text-[#71717a] leading-none mt-0.5">outreach · automated</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-[#27272a] mb-3" />

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {NAV.map((item) => {
          const active = path.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                active
                  ? "bg-brand-500/10 text-brand-400"
                  : "text-[#71717a] hover:text-[#a1a1aa] hover:bg-[#18181b]"
              )}
            >
              <span className={clsx("flex-shrink-0", active ? "text-brand-400" : "text-[#52525b]")}>
                {item.icon}
              </span>
              <span className={clsx("font-medium", active ? "text-brand-400" : "")}>{item.label}</span>
              {active && (
                <span className="ml-auto w-1 h-1 rounded-full bg-brand-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 mt-2">
        <div className="h-px bg-[#27272a] mb-3" />
        <Link
          href="/onboarding"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#18181b] transition-all duration-150"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New workspace
        </Link>
      </div>
    </aside>
  );
}

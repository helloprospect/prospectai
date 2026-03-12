"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => { router.replace("/pipeline"); }, [router]);
  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-brand-500 animate-pulse" />
        <span className="text-sm text-[#52525b]">Loading…</span>
      </div>
    </div>
  );
}

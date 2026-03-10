"use client";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { useState } from "react";
import StatCard from "@/components/StatCard";

const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID || "";
const PIPELINE_ORDER = ["raw", "researched", "scored", "personalized", "sent", "replied", "converted", "archived"];

const STAGE_META: Record<string, { bar: string; dot: string }> = {
  raw:          { bar: "bg-[#52525b]", dot: "bg-[#71717a]" },
  researched:   { bar: "bg-blue-600", dot: "bg-blue-500" },
  scored:       { bar: "bg-violet-600", dot: "bg-violet-400" },
  personalized: { bar: "bg-yellow-600", dot: "bg-yellow-500" },
  sent:         { bar: "bg-brand-600", dot: "bg-brand-500" },
  replied:      { bar: "bg-green-600", dot: "bg-green-500" },
  converted:    { bar: "bg-emerald-500", dot: "bg-emerald-400" },
  archived:     { bar: "bg-[#3f3f46]", dot: "bg-[#52525b]" },
};

export default function CampaignsPage() {
  const { data: workspaces } = useSWR("workspaces", () => api.getWorkspaces());
  const wsId = workspaces?.[0]?.id || WORKSPACE_ID;

  const { data: status } = useSWR(
    wsId ? `pipeline:status:${wsId}` : null,
    () => api.getPipelineStatus(wsId),
    { refreshInterval: 10000 }
  );
  const { data: counts } = useSWR(
    wsId ? `pipeline:counts:${wsId}` : null,
    () => api.getPipelineCounts(wsId),
    { refreshInterval: 10000 }
  );

  const [triggering, setTriggering] = useState(false);

  async function runPipeline() {
    if (!wsId) return;
    setTriggering(true);
    await api.runPipeline(wsId);
    setTimeout(() => {
      mutate(`pipeline:status:${wsId}`);
      mutate(`pipeline:counts:${wsId}`);
      setTriggering(false);
    }, 2000);
  }

  const total = counts
    ? Object.values(counts as Record<string, number>).reduce((a, b) => a + b, 0)
    : 0;
  const isActive = status?.workspace_status === "active";

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-[#fafafa]">Pipeline</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-400" : "bg-yellow-500"}`} />
            <p className="text-sm text-[#71717a]">
              <span className={isActive ? "text-emerald-400" : "text-yellow-400"}>
                {status?.workspace_status || "—"}
              </span>
              {status && ` · ${status.daily_lead_target} leads / day`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={runPipeline}
          disabled={triggering || !wsId}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-all duration-150"
        >
          {triggering ? (
            <>
              <svg className="animate-spin" width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 10" />
              </svg>
              Running…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M2 2l9 4.5L2 11V2z" fill="currentColor" />
              </svg>
              Run Pipeline
            </>
          )}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Total Leads" value={total} />
        <StatCard
          label="Emails (24h)"
          value={status?.emails_last_24h ?? "—"}
          sub={`of ${status?.daily_lead_target ?? "?"} target`}
        />
      </div>

      {/* Pipeline Funnel */}
      <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6">
        <h2 className="text-xs font-medium text-[#71717a] uppercase tracking-widest mb-5">Pipeline Funnel</h2>
        <div className="space-y-3.5">
          {PIPELINE_ORDER.map((stage) => {
            const count = (counts as any)?.[stage] || 0;
            const maxCount = total || 1;
            const width = Math.max((count / maxCount) * 100, count > 0 ? 1.5 : 0);
            const meta = STAGE_META[stage] || { bar: "bg-[#52525b]", dot: "bg-[#71717a]" };
            return (
              <div key={stage} className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-28 flex-shrink-0">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
                  <span className="text-xs text-[#71717a] capitalize">{stage}</span>
                </div>
                <div className="flex-1 bg-[#18181b] rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${meta.bar}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-[#fafafa] w-10 text-right tabular-nums">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

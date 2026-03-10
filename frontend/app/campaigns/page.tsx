"use client";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import { useState } from "react";
import StatCard from "@/components/StatCard";

const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID || "";
const PIPELINE_ORDER = ["raw", "researched", "scored", "personalized", "sent", "replied", "converted", "archived"];

export default function CampaignsPage() {
  const { data: workspaces } = useSWR("workspaces", () => api.getWorkspaces());
  const wsId = workspaces?.[0]?.id || WORKSPACE_ID;

  const { data: status } = useSWR(wsId ? `pipeline:status:${wsId}` : null, () =>
    api.getPipelineStatus(wsId), { refreshInterval: 10000 }
  );
  const { data: counts } = useSWR(wsId ? `pipeline:counts:${wsId}` : null, () =>
    api.getPipelineCounts(wsId), { refreshInterval: 10000 }
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

  const total = counts ? Object.values(counts as Record<string, number>).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Pipeline</h1>
          <p className="text-gray-500 text-sm mt-1">
            Status: <span className={`font-medium ${status?.workspace_status === "active" ? "text-green-400" : "text-yellow-400"}`}>
              {status?.workspace_status || "—"}
            </span>
            {status && ` · Target: ${status.daily_lead_target} leads/day`}
          </p>
        </div>
        <button
          onClick={runPipeline}
          disabled={triggering || !wsId}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {triggering ? "Running…" : "Run Pipeline Now"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard label="Total Leads" value={total} />
        <StatCard
          label="Emails (24h)"
          value={status?.emails_last_24h ?? "—"}
          sub={`of ${status?.daily_lead_target ?? "?"} target`}
        />
      </div>

      {/* Pipeline funnel visualization */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-5">Pipeline Funnel</h2>
        <div className="space-y-3">
          {PIPELINE_ORDER.map((stage) => {
            const count = (counts as any)?.[stage] || 0;
            const maxCount = total || 1;
            const width = Math.max((count / maxCount) * 100, count > 0 ? 2 : 0);
            return (
              <div key={stage} className="flex items-center gap-4">
                <span className="text-xs text-gray-500 w-24 capitalize">{stage}</span>
                <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${stageColor(stage)}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-white w-10 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function stageColor(stage: string) {
  const map: Record<string, string> = {
    raw: "bg-gray-600",
    researched: "bg-blue-600",
    scored: "bg-purple-600",
    personalized: "bg-yellow-600",
    sent: "bg-brand-500",
    replied: "bg-green-500",
    converted: "bg-emerald-400",
    archived: "bg-gray-700",
  };
  return map[stage] || "bg-gray-600";
}

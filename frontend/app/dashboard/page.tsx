"use client";
import useSWR from "swr";
import { api } from "@/lib/api";
import StatCard from "@/components/StatCard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID || "";

const fetcher = (key: string): Promise<any> => {
  if (key.startsWith("stats:")) return api.getWorkspaceStats(key.slice(6));
  if (key.startsWith("perf:")) return api.getPerformanceSummary(key.slice(5), 7);
  if (key.startsWith("pipeline:")) return api.getPipelineCounts(key.slice(9));
  return api.getWorkspaces();
};

const STATUS_META: Record<string, { color: string; bg: string }> = {
  raw:          { color: "#71717a", bg: "bg-[#71717a]" },
  researched:   { color: "#3b82f6", bg: "bg-blue-500" },
  scored:       { color: "#a78bfa", bg: "bg-violet-400" },
  personalized: { color: "#eab308", bg: "bg-yellow-500" },
  sent:         { color: "#8b5cf6", bg: "bg-brand-500" },
  replied:      { color: "#22c55e", bg: "bg-green-500" },
  converted:    { color: "#34d399", bg: "bg-emerald-400" },
  archived:     { color: "#3f3f46", bg: "bg-[#3f3f46]" },
};

export default function DashboardPage() {
  const { data: workspaces } = useSWR("workspaces", () => api.getWorkspaces());
  const wsId = workspaces?.[0]?.id || WORKSPACE_ID;

  const { data: stats } = useSWR(wsId ? `stats:${wsId}` : null, fetcher);
  const { data: perf } = useSWR(wsId ? `perf:${wsId}` : null, fetcher);
  const { data: counts } = useSWR(wsId ? `pipeline:${wsId}` : null, fetcher);

  const summary = (perf as any)?.summary || {};
  const daily = (perf as any)?.daily || [];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#fafafa]">Dashboard</h1>
        <p className="text-sm text-[#71717a] mt-1">Last 7 days · auto-refreshes every 5 min</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Emails Sent"
          value={summary.total_sent ?? "—"}
          sub="last 7 days"
        />
        <StatCard
          label="Open Rate"
          value={summary.open_rate_pct != null ? `${summary.open_rate_pct}%` : "—"}
          sub={summary.open_rate_pct > 30 ? "above avg" : undefined}
          trend={summary.open_rate_pct > 30 ? "up" : "neutral"}
        />
        <StatCard
          label="Reply Rate"
          value={summary.reply_rate_pct != null ? `${summary.reply_rate_pct}%` : "—"}
          sub={summary.reply_rate_pct > 5 ? "above avg" : summary.reply_rate_pct < 3 ? "below avg" : undefined}
          trend={summary.reply_rate_pct > 5 ? "up" : summary.reply_rate_pct < 3 ? "down" : "neutral"}
        />
        <StatCard
          label="Positive Replies"
          value={summary.positive_replies ?? "—"}
        />
      </div>

      {/* Pipeline + Chart */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Pipeline Status */}
        <div className="bg-[#111113] border border-[#27272a] rounded-xl p-5">
          <h2 className="text-xs font-medium text-[#71717a] uppercase tracking-widest mb-4">Pipeline Status</h2>
          {counts ? (
            <div className="space-y-2.5">
              {Object.entries(counts as Record<string, number>).map(([status, count]) => {
                const meta = STATUS_META[status] || { color: "#71717a", bg: "bg-[#71717a]" };
                return (
                  <div key={status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.bg}`} />
                      <span className="text-sm text-[#a1a1aa] capitalize">{status}</span>
                    </div>
                    <span className="text-sm font-medium text-[#fafafa] tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-4 bg-[#18181b] rounded animate-pulse" />
              ))}
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="bg-[#111113] border border-[#27272a] rounded-xl p-5">
          <h2 className="text-xs font-medium text-[#71717a] uppercase tracking-widest mb-4">Daily Sends & Replies</h2>
          {daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={daily} barSize={6} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  tickFormatter={(d) => d.slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#71717a" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#fafafa",
                  }}
                  labelStyle={{ color: "#a1a1aa" }}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <Bar dataKey="sent" fill="#8b5cf6" opacity={0.8} radius={[2, 2, 0, 0]} />
                <Bar dataKey="replied" fill="#22c55e" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-sm text-[#52525b]">
              No data yet
            </div>
          )}
        </div>
      </div>

      {/* A/B breakdown */}
      {(perf as any)?.ab_breakdown?.length > 0 && (
        <div className="bg-[#111113] border border-[#27272a] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#27272a]">
            <h2 className="text-xs font-medium text-[#71717a] uppercase tracking-widest">A/B Variant Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#71717a] text-xs uppercase tracking-wider border-b border-[#27272a]">
                  <th className="text-left px-5 py-3 font-medium">Body</th>
                  <th className="text-left px-5 py-3 font-medium">Subject</th>
                  <th className="text-right px-5 py-3 font-medium">Sent</th>
                  <th className="text-right px-5 py-3 font-medium">Opened</th>
                  <th className="text-right px-5 py-3 font-medium">Replied</th>
                </tr>
              </thead>
              <tbody>
                {(perf as any).ab_breakdown.map((row: any, i: number) => (
                  <tr key={i} className="border-b border-[#27272a]/50 hover:bg-[#18181b] transition-colors">
                    <td className="px-5 py-3 text-[#fafafa] font-medium">Body {row.body_variant}</td>
                    <td className="px-5 py-3 text-[#a1a1aa]">Subject {row.subject_variant}</td>
                    <td className="px-5 py-3 text-right text-[#a1a1aa] tabular-nums">{row.sent}</td>
                    <td className="px-5 py-3 text-right text-[#a1a1aa] tabular-nums">
                      {row.sent ? `${((row.opened / row.sent) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className={`px-5 py-3 text-right font-medium tabular-nums ${
                      row.sent && row.replied / row.sent > 0.05 ? "text-emerald-400" : "text-[#a1a1aa]"
                    }`}>
                      {row.sent ? `${((row.replied / row.sent) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

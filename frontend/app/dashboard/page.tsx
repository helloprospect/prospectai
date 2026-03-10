"use client";
import useSWR from "swr";
import { api } from "@/lib/api";
import StatCard from "@/components/StatCard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// For now, using first workspace. Multi-workspace selector can be added later.
const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID || "";

const fetcher = (key: string): Promise<any> => {
  if (key.startsWith("stats:")) return api.getWorkspaceStats(key.slice(6));
  if (key.startsWith("perf:")) return api.getPerformanceSummary(key.slice(5), 7);
  if (key.startsWith("pipeline:")) return api.getPipelineCounts(key.slice(9));
  return api.getWorkspaces();
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Last 7 days · auto-refreshes every 5 min</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Emails Sent"
          value={summary.total_sent ?? "—"}
          sub="last 7 days"
        />
        <StatCard
          label="Open Rate"
          value={summary.open_rate_pct != null ? `${summary.open_rate_pct}%` : "—"}
          trend={summary.open_rate_pct > 30 ? "up" : "neutral"}
        />
        <StatCard
          label="Reply Rate"
          value={summary.reply_rate_pct != null ? `${summary.reply_rate_pct}%` : "—"}
          trend={summary.reply_rate_pct > 5 ? "up" : summary.reply_rate_pct < 3 ? "down" : "neutral"}
        />
        <StatCard
          label="Positive Replies"
          value={summary.positive_replies ?? "—"}
        />
      </div>

      {/* Pipeline funnel */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Pipeline Status</h2>
          <div className="space-y-2">
            {counts && Object.entries(counts as Record<string, number>).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${statusColor(status)}`} />
                  <span className="text-sm text-gray-300 capitalize">{status}</span>
                </div>
                <span className="text-sm font-medium text-white">{count}</span>
              </div>
            ))}
            {!counts && <p className="text-gray-500 text-sm">Loading...</p>}
          </div>
        </div>

        {/* Daily sends chart */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Daily Sends & Replies</h2>
          {daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={daily} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#9ca3af" }}
                />
                <Bar dataKey="sent" fill="#0ea5e9" opacity={0.7} radius={[2,2,0,0]} />
                <Bar dataKey="replied" fill="#10b981" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-600 text-sm mt-4">No data yet</p>
          )}
        </div>
      </div>

      {/* A/B breakdown */}
      {(perf as any)?.ab_breakdown?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-400 mb-4">A/B Variant Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="pb-2 pr-4">Body</th>
                  <th className="pb-2 pr-4">Subject</th>
                  <th className="pb-2 pr-4">Sent</th>
                  <th className="pb-2 pr-4">Opened</th>
                  <th className="pb-2">Replied</th>
                </tr>
              </thead>
              <tbody>
                {(perf as any).ab_breakdown.map((row: any, i: number) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td className="py-2 pr-4 text-white font-medium">Body {row.body_variant}</td>
                    <td className="py-2 pr-4 text-gray-300">Subject {row.subject_variant}</td>
                    <td className="py-2 pr-4 text-gray-300">{row.sent}</td>
                    <td className="py-2 pr-4 text-gray-300">
                      {row.sent ? `${((row.opened / row.sent) * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className={`py-2 font-medium ${row.sent && row.replied / row.sent > 0.05 ? "text-green-400" : "text-gray-300"}`}>
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

function statusColor(status: string) {
  const map: Record<string, string> = {
    raw: "bg-gray-600",
    researched: "bg-blue-500",
    scored: "bg-purple-500",
    personalized: "bg-yellow-500",
    sent: "bg-brand-500",
    replied: "bg-green-500",
    converted: "bg-emerald-400",
    archived: "bg-gray-700",
  };
  return map[status] || "bg-gray-600";
}

"use client";
import useSWR from "swr";
import { api } from "@/lib/api";
import StatCard from "@/components/StatCard";

const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID || "";

export default function RedditPage() {
  const { data: workspaces } = useSWR("workspaces", () => api.getWorkspaces());
  const wsId = workspaces?.[0]?.id || WORKSPACE_ID;

  const { data: stats } = useSWR(wsId ? `reddit:stats:${wsId}` : null, () => api.getRedditStats(wsId));
  const { data: actions } = useSWR(wsId ? `reddit:actions:${wsId}` : null, () => api.getRedditActions(wsId));

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Reddit GTM</h1>
        <p className="text-gray-500 text-sm mt-1">Monitors target subreddits every 30 min</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Posts Processed" value={(stats as any)?.total_processed ?? "—"} />
        <StatCard label="Comments Posted" value={(stats as any)?.comments ?? "—"} />
        <StatCard label="DMs Sent" value={(stats as any)?.dms ?? "—"} />
        <StatCard
          label="Warm Leads Found"
          value={(stats as any)?.warm_leads_found ?? "—"}
          trend="up"
          sub="enriched via SearchLeads"
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-medium text-gray-400">Recent Actions</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-gray-800 text-xs uppercase tracking-wider">
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Subreddit</th>
              <th className="px-5 py-3">Post</th>
              <th className="px-5 py-3">Author</th>
              <th className="px-5 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {actions?.map((a) => (
              <tr key={a.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    a.action_type === "comment" ? "bg-blue-500/10 text-blue-400" :
                    a.action_type === "dm" ? "bg-purple-500/10 text-purple-400" :
                    "bg-gray-700 text-gray-400"
                  }`}>{a.action_type}</span>
                </td>
                <td className="px-5 py-3 text-gray-400">r/{a.subreddit}</td>
                <td className="px-5 py-3 text-gray-300 max-w-xs truncate">{a.post_title}</td>
                <td className="px-5 py-3 text-gray-400">u/{a.reddit_author}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">
                  {new Date(a.performed_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {actions?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                  No Reddit activity yet. Enable Reddit in workspace settings.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

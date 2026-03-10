"use client";
import useSWR from "swr";
import { api } from "@/lib/api";
import StatCard from "@/components/StatCard";

const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID || "";

export default function RedditPage() {
  const { data: workspaces } = useSWR("workspaces", () => api.getWorkspaces());
  const wsId = workspaces?.[0]?.id || WORKSPACE_ID;

  const { data: stats } = useSWR(
    wsId ? `reddit:stats:${wsId}` : null,
    () => api.getRedditStats(wsId)
  );
  const { data: actions } = useSWR(
    wsId ? `reddit:actions:${wsId}` : null,
    () => api.getRedditActions(wsId)
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#fafafa]">Reddit GTM</h1>
        <p className="text-sm text-[#71717a] mt-1">Monitors target subreddits every 30 min</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Posts Processed" value={(stats as any)?.total_processed ?? "—"} />
        <StatCard label="Comments Posted" value={(stats as any)?.comments ?? "—"} />
        <StatCard label="DMs Sent" value={(stats as any)?.dms ?? "—"} />
        <StatCard
          label="Warm Leads Found"
          value={(stats as any)?.warm_leads_found ?? "—"}
          trend="up"
          sub="via SearchLeads"
        />
      </div>

      {/* Actions table */}
      <div className="bg-[#111113] border border-[#27272a] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#27272a]">
          <h2 className="text-xs font-medium text-[#71717a] uppercase tracking-widest">Recent Actions</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#71717a] text-left border-b border-[#27272a] text-xs uppercase tracking-wider">
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Subreddit</th>
              <th className="px-5 py-3 font-medium">Post</th>
              <th className="px-5 py-3 font-medium">Author</th>
              <th className="px-5 py-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {actions?.map((a) => (
              <tr key={a.id} className="border-b border-[#27272a]/50 hover:bg-[#18181b] transition-colors duration-100">
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                    a.action_type === "comment"
                      ? "bg-blue-500/10 text-blue-400"
                      : a.action_type === "dm"
                      ? "bg-violet-500/10 text-violet-400"
                      : "bg-[#27272a] text-[#71717a]"
                  }`}>
                    {a.action_type}
                  </span>
                </td>
                <td className="px-5 py-3 text-[#71717a]">r/{a.subreddit}</td>
                <td className="px-5 py-3 text-[#a1a1aa] max-w-[220px] truncate">{a.post_title}</td>
                <td className="px-5 py-3 text-[#71717a]">u/{a.reddit_author}</td>
                <td className="px-5 py-3 text-xs text-[#52525b]">
                  {new Date(a.performed_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {actions?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-[#52525b]">
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

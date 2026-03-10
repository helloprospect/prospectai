"use client";
import useSWR from "swr";
import { api, Lead } from "@/lib/api";
import { useState } from "react";

const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID || "";
const STATUSES = ["", "raw", "researched", "scored", "personalized", "sent", "replied", "converted", "archived"];

const STATUS_BADGE: Record<string, string> = {
  raw:          "bg-[#27272a] text-[#71717a]",
  researched:   "bg-blue-500/10 text-blue-400",
  scored:       "bg-violet-500/10 text-violet-400",
  personalized: "bg-yellow-500/10 text-yellow-400",
  sent:         "bg-brand-500/10 text-brand-400",
  replied:      "bg-green-500/10 text-green-400",
  converted:    "bg-emerald-500/10 text-emerald-400",
  archived:     "bg-[#18181b] text-[#52525b]",
};

export default function LeadsPage() {
  const { data: workspaces } = useSWR("workspaces", () => api.getWorkspaces());
  const wsId = workspaces?.[0]?.id || WORKSPACE_ID;
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data: leads, isLoading } = useSWR(
    wsId ? `leads:${wsId}:${status}:${offset}` : null,
    () => api.getLeads(wsId, { status: status || undefined, limit, offset })
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#fafafa]">Leads</h1>
      </div>

      {/* Status filter */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => { setStatus(s); setOffset(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border ${
              status === s
                ? "bg-brand-500/15 border-brand-500/50 text-brand-400"
                : "bg-[#18181b] border-[#27272a] text-[#71717a] hover:text-[#a1a1aa] hover:border-[#3f3f46]"
            }`}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[#111113] border border-[#27272a] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#71717a] text-left border-b border-[#27272a] text-xs uppercase tracking-wider">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Company</th>
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Industry</th>
              <th className="px-5 py-3 font-medium text-right">Score</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Added</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-[#52525b]">
                  Loading…
                </td>
              </tr>
            )}
            {leads?.map((lead: Lead) => (
              <tr
                key={lead.id}
                className="border-b border-[#27272a]/50 hover:bg-[#18181b] transition-colors duration-100"
              >
                <td className="px-5 py-3">
                  <p className="text-[#fafafa] font-medium">
                    {lead.first_name} {lead.last_name}
                  </p>
                  <p className="text-xs text-[#52525b] mt-0.5">{lead.email}</p>
                </td>
                <td className="px-5 py-3 text-[#a1a1aa]">{lead.company || "—"}</td>
                <td className="px-5 py-3 text-[#71717a] max-w-[180px] truncate">{lead.title || "—"}</td>
                <td className="px-5 py-3 text-[#71717a] capitalize">{lead.industry || "—"}</td>
                <td className="px-5 py-3 text-right">
                  {lead.total_score != null ? (
                    <span className={`font-semibold tabular-nums ${
                      lead.total_score >= 70 ? "text-emerald-400" :
                      lead.total_score >= 50 ? "text-yellow-400" :
                      "text-red-400"
                    }`}>
                      {lead.total_score}
                    </span>
                  ) : (
                    <span className="text-[#52525b]">—</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                    STATUS_BADGE[lead.status] || "bg-[#27272a] text-[#71717a]"
                  }`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-[#52525b]">
                  {new Date(lead.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {leads?.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-[#52525b]">
                  No leads found
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#27272a]">
          <span className="text-xs text-[#52525b]">
            Showing {offset + 1}–{offset + (leads?.length || 0)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-3 py-1.5 text-xs bg-[#18181b] border border-[#27272a] rounded-lg disabled:opacity-40 hover:border-[#3f3f46] text-[#a1a1aa] transition-all"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => setOffset(offset + limit)}
              disabled={(leads?.length || 0) < limit}
              className="px-3 py-1.5 text-xs bg-[#18181b] border border-[#27272a] rounded-lg disabled:opacity-40 hover:border-[#3f3f46] text-[#a1a1aa] transition-all"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

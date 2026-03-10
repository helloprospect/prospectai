"use client";
import useSWR from "swr";
import { api, Lead } from "@/lib/api";
import { useState } from "react";

const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID || "";
const STATUSES = ["", "raw", "researched", "scored", "personalized", "sent", "replied", "converted", "archived"];

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
        <h1 className="text-2xl font-bold text-white">Leads</h1>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            onClick={() => { setStatus(s); setOffset(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              status === s
                ? "bg-brand-500 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Leads table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b border-gray-800 text-xs uppercase tracking-wider">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Company</th>
              <th className="px-5 py-3">Title</th>
              <th className="px-5 py-3">Industry</th>
              <th className="px-5 py-3">Score</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Added</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-gray-500">Loading...</td>
              </tr>
            )}
            {leads?.map((lead: Lead) => (
              <tr key={lead.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-5 py-3 text-white">
                  {lead.first_name} {lead.last_name}
                  <p className="text-xs text-gray-500">{lead.email}</p>
                </td>
                <td className="px-5 py-3 text-gray-300">{lead.company || "—"}</td>
                <td className="px-5 py-3 text-gray-400 max-w-xs truncate">{lead.title || "—"}</td>
                <td className="px-5 py-3 text-gray-400">{lead.industry || "—"}</td>
                <td className="px-5 py-3">
                  {lead.total_score != null ? (
                    <span className={`font-medium ${
                      lead.total_score >= 70 ? "text-green-400" :
                      lead.total_score >= 50 ? "text-yellow-400" :
                      "text-red-400"
                    }`}>{lead.total_score}</span>
                  ) : "—"}
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(lead.status)}`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">
                  {new Date(lead.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {leads?.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-gray-500">No leads found</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800">
          <span className="text-xs text-gray-500">Showing {offset + 1}–{offset + (leads?.length || 0)}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-3 py-1 text-xs bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700"
            >
              ← Prev
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={(leads?.length || 0) < limit}
              className="px-3 py-1 text-xs bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    raw: "bg-gray-700 text-gray-400",
    researched: "bg-blue-500/10 text-blue-400",
    scored: "bg-purple-500/10 text-purple-400",
    personalized: "bg-yellow-500/10 text-yellow-400",
    sent: "bg-sky-500/10 text-sky-400",
    replied: "bg-green-500/10 text-green-400",
    converted: "bg-emerald-500/10 text-emerald-400",
    archived: "bg-gray-800 text-gray-600",
  };
  return map[status] || "bg-gray-700 text-gray-400";
}

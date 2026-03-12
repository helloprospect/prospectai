"use client";
import { useEffect, useState, useCallback } from "react";

interface Lead {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  industry: string;
  status: string;
  total_score: number | null;
  variant_type: string | null;
  interest_status: number;
  updated_at: string;
}

interface PipelineCounts {
  raw: number;
  researched: number;
  scored: number;
  personalized: number;
  sent: number;
  replied: number;
}

const STATUS_ORDER = ["raw", "researched", "scored", "personalized", "sent", "replied"];
const STATUS_LABEL: Record<string, string> = {
  raw: "Raw",
  researched: "Researched",
  scored: "Scored",
  personalized: "Personalized",
  sent: "Sent",
  replied: "Replied",
};

function interestBadge(status: number) {
  if (status > 0) return <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">▲ {status}</span>;
  if (status < 0) return <span className="inline-flex items-center gap-1 text-xs text-red-400 font-medium">▼ {Math.abs(status)}</span>;
  return <span className="text-xs text-[#52525b]">—</span>;
}

function variantBadge(v: string | null) {
  if (!v) return null;
  const colors: Record<string, string> = {
    CHAMPION: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    CHALLENGER: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    EXPLORER: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${colors[v] || "text-[#71717a]"}`}>
      {v}
    </span>
  );
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counts, setCounts] = useState<PipelineCounts | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningPipeline, setRunningPipeline] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsData, countsData] = await Promise.all([
        fetch(`/api/mock/leads${activeFilter ? `?status=${activeFilter}` : ""}`).then(r => r.json()),
        fetch("/api/mock/pipeline/counts").then(r => r.json()),
      ]);
      setLeads(leadsData);
      setCounts(countsData);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalLeads = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#fafafa]">Lead Pipeline</h1>
          <p className="text-sm text-[#71717a] mt-0.5">{totalLeads} total leads across all stages</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#27272a] bg-[#18181b] text-sm text-[#a1a1aa] cursor-pointer hover:border-[#3f3f46] transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h10M2 3h10M2 11h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Upload CSV
            <input type="file" accept=".csv" className="hidden" onChange={() => {}} />
          </label>
          <button
            onClick={() => {
              setRunningPipeline(true);
              setTimeout(() => setRunningPipeline(false), 2000);
            }}
            disabled={runningPipeline}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {runningPipeline ? (
              <><span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> Running…</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7l8-4v8L3 7z" fill="white" />
              </svg> Run Pipeline</>
            )}
          </button>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setActiveFilter(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            activeFilter === null
              ? "bg-brand-500/15 text-brand-400 border border-brand-500/30"
              : "text-[#71717a] border border-[#27272a] hover:border-[#3f3f46] hover:text-[#a1a1aa]"
          }`}
        >
          All ({totalLeads})
        </button>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => setActiveFilter(activeFilter === s ? null : s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeFilter === s
                ? "bg-brand-500/15 text-brand-400 border border-brand-500/30"
                : "text-[#71717a] border border-[#27272a] hover:border-[#3f3f46] hover:text-[#a1a1aa]"
            }`}
          >
            {STATUS_LABEL[s]} ({counts?.[s as keyof PipelineCounts] ?? 0})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#27272a]">
              {["Name", "Company", "Title", "Status", "Score", "Variant", "Interest", "Updated"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#52525b] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({length: 8}).map((_, i) => (
                <tr key={i} className="border-b border-[#27272a]/50">
                  {Array.from({length: 8}).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-[#27272a] rounded animate-pulse" style={{width: `${40 + Math.random() * 40}%`}} />
                    </td>
                  ))}
                </tr>
              ))
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[#52525b] text-sm">
                  No leads found. Upload a CSV to get started.
                </td>
              </tr>
            ) : leads.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => setSelectedLead(lead)}
                className="border-b border-[#27272a]/50 hover:bg-[#18181b] cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-[#fafafa]">
                  {lead.first_name} {lead.last_name}
                </td>
                <td className="px-4 py-3 text-[#a1a1aa]">{lead.company}</td>
                <td className="px-4 py-3 text-[#71717a] text-xs">{lead.title}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    lead.status === "replied" ? "bg-emerald-500/10 text-emerald-400" :
                    lead.status === "sent" ? "bg-blue-500/10 text-blue-400" :
                    lead.status === "personalized" ? "bg-purple-500/10 text-purple-400" :
                    lead.status === "scored" ? "bg-amber-500/10 text-amber-400" :
                    lead.status === "researched" ? "bg-sky-500/10 text-sky-400" :
                    "text-[#52525b] bg-[#27272a]"
                  }`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#a1a1aa]">
                  {lead.total_score != null ? (
                    <span className={lead.total_score >= 70 ? "text-emerald-400" : lead.total_score >= 50 ? "text-amber-400" : "text-[#71717a]"}>
                      {lead.total_score}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3">{variantBadge(lead.variant_type)}</td>
                <td className="px-4 py-3">{interestBadge(lead.interest_status)}</td>
                <td className="px-4 py-3 text-[#52525b] text-xs">
                  {new Date(lead.updated_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lead detail slide-over */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setSelectedLead(null)} />
          <div className="w-[420px] bg-[#111113] border-l border-[#27272a] overflow-y-auto">
            <div className="px-6 py-5 border-b border-[#27272a] flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[#fafafa]">{selectedLead.first_name} {selectedLead.last_name}</h2>
                <p className="text-sm text-[#71717a]">{selectedLead.title} @ {selectedLead.company}</p>
              </div>
              <button onClick={() => setSelectedLead(null)} className="text-[#52525b] hover:text-[#a1a1aa] transition-colors">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[#52525b] text-xs mb-1">Email</p>
                  <p className="text-[#a1a1aa] break-all">{selectedLead.email}</p>
                </div>
                <div>
                  <p className="text-[#52525b] text-xs mb-1">Industry</p>
                  <p className="text-[#a1a1aa]">{selectedLead.industry}</p>
                </div>
                <div>
                  <p className="text-[#52525b] text-xs mb-1">Status</p>
                  <p className="text-[#fafafa]">{selectedLead.status}</p>
                </div>
                <div>
                  <p className="text-[#52525b] text-xs mb-1">Score</p>
                  <p className="text-[#fafafa]">{selectedLead.total_score ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[#52525b] text-xs mb-1">Variant</p>
                  <div>{variantBadge(selectedLead.variant_type) ?? <span className="text-[#52525b]">—</span>}</div>
                </div>
                <div>
                  <p className="text-[#52525b] text-xs mb-1">Interest</p>
                  {interestBadge(selectedLead.interest_status)}
                </div>
              </div>
              <div className="pt-2 border-t border-[#27272a]">
                <p className="text-[#52525b] text-xs mb-2">Research & Email Preview</p>
                <div className="bg-[#18181b] rounded-lg p-3 text-xs text-[#71717a]">
                  {selectedLead.status === "raw"
                    ? "This lead hasn't been researched yet. Run Pipeline to generate research and email copy."
                    : "Research and email preview available after pipeline runs. Upgrade to see full AI-generated personalization."}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

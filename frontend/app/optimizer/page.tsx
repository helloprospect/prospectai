"use client";
import useSWR, { mutate } from "swr";
import { api, OptimizationRun } from "@/lib/api";
import { useState } from "react";

const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID || "";

export default function OptimizerPage() {
  const { data: workspaces } = useSWR("workspaces", () => api.getWorkspaces());
  const wsId = workspaces?.[0]?.id || WORKSPACE_ID;

  const { data: runs, isLoading } = useSWR(
    wsId ? `optimizer:${wsId}` : null,
    () => api.getOptimizationRuns(wsId)
  );

  const [running, setRunning] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  async function handleTrigger() {
    if (!wsId) return;
    setRunning(true);
    try {
      await api.triggerOptimization(wsId);
      setTimeout(() => { mutate(`optimizer:${wsId}`); setRunning(false); }, 3000);
    } catch {
      setRunning(false);
    }
  }

  async function handleApprove(runId: string) {
    if (!wsId) return;
    setApproving(runId);
    await api.approveOptimization(wsId, runId);
    mutate(`optimizer:${wsId}`);
    setApproving(null);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-[#fafafa]">Optimizer</h1>
          <p className="text-sm text-[#71717a] mt-1">Self-improving prompt & scoring engine · runs nightly</p>
        </div>
        <button
          type="button"
          onClick={handleTrigger}
          disabled={running || !wsId}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-all duration-150"
        >
          {running ? (
            <>
              <svg className="animate-spin" width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 10" />
              </svg>
              Running…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1.5L8.5 5.5H11.5L9 8L10 11.5L6.5 9.5L3 11.5L4 8L1.5 5.5H4.5L6.5 1.5Z" fill="currentColor" />
              </svg>
              Run Now
            </>
          )}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-[#52525b]">
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 10" />
          </svg>
          Loading…
        </div>
      )}

      <div className="space-y-3">
        {runs?.map((run) => (
          <RunCard key={run.id} run={run} onApprove={handleApprove} approving={approving} />
        ))}
        {runs?.length === 0 && !isLoading && (
          <div className="bg-[#111113] border border-[#27272a] rounded-xl p-10 text-center">
            <p className="text-[#52525b]">No optimization runs yet.</p>
            <p className="text-xs text-[#3f3f46] mt-1">First run requires 30+ sent emails.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RunCard({
  run,
  onApprove,
  approving,
}: {
  run: OptimizationRun;
  onApprove: (id: string) => void;
  approving: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const changes = run.changes_made || {};
  const promptChanges = (changes as any).prompt_changes || [];
  const weightChanges = (changes as any).weight_changes;

  return (
    <div className="bg-[#111113] border border-[#27272a] rounded-xl overflow-hidden">
      <div
        className="p-5 flex items-start gap-4 cursor-pointer hover:bg-[#18181b] transition-colors duration-150"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusBadge status={run.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1.5">
            <span className="text-sm font-medium text-[#fafafa]">
              {run.period_start} → {run.period_end}
            </span>
            <span className="text-xs text-[#52525b] bg-[#18181b] px-2 py-0.5 rounded">
              {run.run_type}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#71717a]">
            <span>{run.emails_analyzed} emails</span>
            <span>Open {pct(run.avg_open_rate)} vs {pct(run.benchmark_reply_rate)} benchmark</span>
            <span>Reply {pct(run.avg_reply_rate)}</span>
            <span className={run.confidence && run.confidence >= 0.65 ? "text-emerald-400" : "text-yellow-400"}>
              {pct(run.confidence)} confidence
            </span>
          </div>
          {(promptChanges.length > 0 || weightChanges) && (
            <p className="text-xs text-brand-400 mt-1.5">
              {promptChanges.length > 0 && `${promptChanges.length} prompt(s) updated`}
              {promptChanges.length > 0 && weightChanges && " · "}
              {weightChanges && "Scoring weights adjusted"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-[#52525b]">{new Date(run.ran_at).toLocaleString()}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className={`text-[#52525b] transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#27272a] p-5 space-y-5 animate-fade-in">
          {run.claude_reasoning && (
            <div>
              <h3 className="text-[10px] font-medium text-[#52525b] uppercase tracking-widest mb-2">
                Claude Analysis
              </h3>
              <p className="text-sm text-[#a1a1aa] whitespace-pre-wrap leading-relaxed">
                {run.claude_reasoning}
              </p>
            </div>
          )}

          {promptChanges.length > 0 && (
            <div>
              <h3 className="text-[10px] font-medium text-[#52525b] uppercase tracking-widest mb-2">
                Prompt Changes
              </h3>
              <div className="space-y-2">
                {promptChanges.map((c: any, i: number) => (
                  <div key={i} className="bg-[#18181b] border border-[#27272a] rounded-lg p-3">
                    <span className="text-xs text-brand-400 font-medium">{c.template_type}</span>
                    <p className="text-xs text-[#71717a] mt-1">{c.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {run.status === "needs_review" && (
            <button
              type="button"
              onClick={() => onApprove(run.id)}
              disabled={approving === run.id}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-all duration-150"
            >
              {approving === run.id ? "Applying…" : "Approve & Apply Changes"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  completed:                  "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  needs_review:               "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  paused_anomaly:             "bg-red-500/10 text-red-400 border border-red-500/20",
  skipped_insufficient_data:  "bg-[#27272a] text-[#71717a]",
};
const STATUS_LABELS: Record<string, string> = {
  completed:                  "Applied",
  needs_review:               "Review",
  paused_anomaly:             "Paused",
  skipped_insufficient_data:  "Skipped",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-md font-medium flex-shrink-0 ${
      STATUS_STYLES[status] || "bg-[#27272a] text-[#71717a]"
    }`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function pct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

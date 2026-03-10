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
    } catch (e) {
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Optimizer</h1>
          <p className="text-gray-500 text-sm mt-1">Self-improving prompt & scoring engine · runs nightly</p>
        </div>
        <button
          onClick={handleTrigger}
          disabled={running || !wsId}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {running ? "Running…" : "Run Now"}
        </button>
      </div>

      {isLoading && <p className="text-gray-500">Loading...</p>}

      <div className="space-y-4">
        {runs?.map((run) => (
          <RunCard key={run.id} run={run} onApprove={handleApprove} approving={approving} />
        ))}
        {runs?.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-500">No optimization runs yet.</p>
            <p className="text-gray-600 text-sm mt-1">First run requires 30+ sent emails.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RunCard({ run, onApprove, approving }: {
  run: OptimizationRun;
  onApprove: (id: string) => void;
  approving: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const changes = run.changes_made || {};
  const promptChanges = (changes as any).prompt_changes || [];
  const weightChanges = (changes as any).weight_changes;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div
        className="p-5 flex items-start gap-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusBadge status={run.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-sm font-medium text-white">
              {run.period_start} → {run.period_end}
            </span>
            <span className="text-xs text-gray-500">{run.run_type}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>{run.emails_analyzed} emails</span>
            <span>Open {pct(run.avg_open_rate)} vs benchmark {pct(run.benchmark_reply_rate)}</span>
            <span>Reply {pct(run.avg_reply_rate)}</span>
            <span>Confidence {pct(run.confidence)}</span>
          </div>
          {(promptChanges.length > 0 || weightChanges) && (
            <p className="text-xs text-brand-500 mt-1">
              {promptChanges.length > 0 && `${promptChanges.length} prompt(s) updated`}
              {promptChanges.length > 0 && weightChanges && " · "}
              {weightChanges && "Scoring weights adjusted"}
            </p>
          )}
        </div>
        <span className="text-gray-600 text-xs">{new Date(run.ran_at).toLocaleString()}</span>
        <span className="text-gray-600 text-sm">{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div className="border-t border-gray-800 p-5 space-y-4">
          {run.claude_reasoning && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Claude Analysis</h3>
              <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                {run.claude_reasoning}
              </p>
            </div>
          )}

          {promptChanges.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Prompt Changes</h3>
              <div className="space-y-2">
                {promptChanges.map((c: any, i: number) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-3">
                    <span className="text-xs text-brand-500 font-medium">{c.template_type}</span>
                    <p className="text-xs text-gray-400 mt-1">{c.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {run.status === "needs_review" && (
            <button
              onClick={() => onApprove(run.id)}
              disabled={approving === run.id}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {approving === run.id ? "Applying…" : "Approve & Apply Changes"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-500/10 text-green-400 border-green-500/20",
    needs_review: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    paused_anomaly: "bg-red-500/10 text-red-400 border-red-500/20",
    skipped_insufficient_data: "bg-gray-700 text-gray-400 border-gray-600",
  };
  const labels: Record<string, string> = {
    completed: "Applied",
    needs_review: "Review",
    paused_anomaly: "Paused",
    skipped_insufficient_data: "Skipped",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${styles[status] || "bg-gray-700 text-gray-400"}`}>
      {labels[status] || status}
    </span>
  );
}

function pct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

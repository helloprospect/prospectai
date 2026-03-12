"use client";
import { useEffect, useState } from "react";

interface Variant {
  id: string;
  name: string;
  role: "CHAMPION" | "CHALLENGER" | "EXPLORER";
  body_preview: string;
  subject_preview: string;
  sent: number;
  positive: number;
  negative: number;
  positive_rate: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  weight_pct: number;
  status: string;
}

interface ExplorerSuggestion {
  analysis: string;
  new_prompt: string;
  generated_at: string;
}

const MIN_SAMPLE_SIZE = 50;

function ConfidenceBadge({ confidence, sent }: { confidence: string; sent: number }) {
  const remaining = Math.max(0, MIN_SAMPLE_SIZE - sent);
  if (confidence === "HIGH") {
    return <span className="text-xs text-emerald-400 font-medium">HOCH ✓</span>;
  }
  if (confidence === "MEDIUM") {
    return <span className="text-xs text-amber-400 font-medium">MITTEL</span>;
  }
  return (
    <span className="text-xs text-[#71717a]">
      NIEDRIG {remaining > 0 ? `(noch ${remaining} nötig)` : ""}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    CHAMPION: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    CHALLENGER: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    EXPLORER: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${styles[role] || "text-[#71717a]"}`}>
      {role}
    </span>
  );
}

export default function OptimizerPage() {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [suggestion, setSuggestion] = useState<ExplorerSuggestion | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(true);
  const [generatingSuggestion, setGeneratingSuggestion] = useState(false);
  const [appliedExplorer, setAppliedExplorer] = useState(false);
  const [expandedBody, setExpandedBody] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mock/variants")
      .then(r => r.json())
      .then(setVariants)
      .finally(() => setLoadingVariants(false));
  }, []);

  const generateExplorer = async () => {
    setGeneratingSuggestion(true);
    setAppliedExplorer(false);
    // Simulate LLM analysis delay
    await new Promise(r => setTimeout(r, 1800));
    const data = await fetch("/api/mock/explorer-suggestion").then(r => r.json());
    setSuggestion(data);
    setGeneratingSuggestion(false);
  };

  const totalSent = variants.reduce((s, v) => s + v.sent, 0);
  const totalPositive = variants.reduce((s, v) => s + v.positive, 0);
  const overallRate = totalSent > 0 ? ((totalPositive / totalSent) * 100).toFixed(1) : "0.0";

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#fafafa]">Optimizer</h1>
          <p className="text-sm text-[#71717a] mt-0.5">
            CCC framework · {totalSent} sent · {overallRate}% positive rate
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-[#52525b]">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500" /> Champion 60%
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500" /> Challenger 25%
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500" /> Explorer 15%
          </div>
        </div>
      </div>

      {/* Variants table */}
      <div className="card overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-[#27272a] flex items-center justify-between">
          <h2 className="text-sm font-medium text-[#a1a1aa]">Variant Performance</h2>
          <span className="text-xs text-[#52525b]">Min. sample size: {MIN_SAMPLE_SIZE} leads</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#27272a]">
              {["Variant", "Role", "Subject Preview", "Sent", "Positive", "Negative", "Rate %", "Confidence", "Weight"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#52525b] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingVariants ? (
              Array.from({length: 3}).map((_, i) => (
                <tr key={i} className="border-b border-[#27272a]/50">
                  {Array.from({length: 9}).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-[#27272a] rounded animate-pulse" style={{width: "60%"}} />
                    </td>
                  ))}
                </tr>
              ))
            ) : variants.map((v) => (
              <tr key={v.id} className="border-b border-[#27272a]/50 hover:bg-[#18181b] transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-[#fafafa]">{v.name}</p>
                    <button
                      onClick={() => setExpandedBody(expandedBody === v.id ? null : v.id)}
                      className="text-[10px] text-[#52525b] hover:text-brand-400 transition-colors mt-0.5"
                    >
                      {expandedBody === v.id ? "hide body" : "show body"}
                    </button>
                    {expandedBody === v.id && (
                      <p className="text-xs text-[#71717a] mt-2 max-w-[300px] leading-relaxed border-t border-[#27272a] pt-2">
                        {v.body_preview}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3"><RoleBadge role={v.role} /></td>
                <td className="px-4 py-3 text-[#71717a] text-xs max-w-[200px] truncate" title={v.subject_preview}>
                  {v.subject_preview}
                </td>
                <td className="px-4 py-3 text-[#a1a1aa]">{v.sent}</td>
                <td className="px-4 py-3 text-emerald-400 font-medium">{v.positive}</td>
                <td className="px-4 py-3 text-red-400">{v.negative}</td>
                <td className="px-4 py-3">
                  <span className={`font-semibold ${
                    v.positive_rate >= 10 ? "text-emerald-400" :
                    v.positive_rate >= 7 ? "text-amber-400" : "text-[#71717a]"
                  }`}>
                    {v.positive_rate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ConfidenceBadge confidence={v.confidence} sent={v.sent} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-[#27272a] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          v.role === "CHAMPION" ? "bg-emerald-500" :
                          v.role === "CHALLENGER" ? "bg-amber-500" : "bg-blue-500"
                        }`}
                        style={{width: `${v.weight_pct}%`}}
                      />
                    </div>
                    <span className="text-xs text-[#52525b]">{v.weight_pct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Explorer Generator */}
      <div className="card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium text-[#a1a1aa] mb-1">Explorer Prompt Generator</h2>
            <p className="text-xs text-[#52525b]">
              AI analyzes Champion vs. Challenger performance and generates a new Explorer hypothesis for Make.com.
            </p>
          </div>
          <button
            onClick={generateExplorer}
            disabled={generatingSuggestion}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:opacity-50 flex-shrink-0 ml-4"
          >
            {generatingSuggestion ? (
              <><span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> Analyzing…</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1l1.2 2.4 2.8.4-2 2 .4 2.8L7 7.4l-2.4 1.2.4-2.8-2-2 2.8-.4L7 1z" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
              </svg> Generate new Explorer</>
            )}
          </button>
        </div>

        {suggestion ? (
          <div className="space-y-4">
            {/* Analysis */}
            <div className="bg-[#18181b] rounded-lg p-4">
              <p className="text-xs text-[#52525b] uppercase tracking-wide mb-2 font-medium">AI Analysis</p>
              <p className="text-sm text-[#a1a1aa] leading-relaxed">{suggestion.analysis}</p>
            </div>
            {/* New prompt */}
            <div className="bg-[#18181b] rounded-lg p-4">
              <p className="text-xs text-[#52525b] uppercase tracking-wide mb-2 font-medium">Generated Explorer Prompt</p>
              <pre className="text-xs text-[#fafafa] leading-relaxed whitespace-pre-wrap font-mono">
                {suggestion.new_prompt}
              </pre>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAppliedExplorer(true)}
                disabled={appliedExplorer}
                className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:bg-emerald-600"
              >
                {appliedExplorer ? "✓ Applied as Explorer" : "Apply as Explorer"}
              </button>
              <button
                onClick={() => setSuggestion(null)}
                className="px-4 py-2 rounded-lg border border-[#27272a] text-[#71717a] hover:text-[#a1a1aa] text-sm transition-colors"
              >
                Discard
              </button>
              <p className="text-xs text-[#52525b] ml-auto">
                Copy this prompt into Make.com as the Explorer body template.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-[#18181b] rounded-lg p-8 text-center">
            <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center mx-auto mb-3">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 3l2 4 4 .5-3 3 .5 4.5L10 13l-3.5 2 .5-4.5-3-3 4-.5L10 3z" stroke="#8b5cf6" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm text-[#52525b]">
              Click "Generate new Explorer" to get an AI-powered<br />
              prompt based on current Champion/Challenger data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

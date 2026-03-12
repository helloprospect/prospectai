"use client";
import useSWR, { mutate as globalMutate } from "swr";
import { api, Lead, CsvPreview, CsvImportResult } from "@/lib/api";
import { useState, useRef } from "react";

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

const FIELD_LABELS: Record<string, string> = {
  email:        "Email *",
  first_name:   "First Name",
  last_name:    "Last Name",
  company:      "Company",
  title:        "Job Title",
  linkedin_url: "LinkedIn URL",
  website:      "Website",
  industry:     "Industry",
  company_size: "Company Size",
  location:     "Country / Location",
};

export default function LeadsPage() {
  const { data: workspaces } = useSWR("workspaces", () => api.getWorkspaces());
  const wsId = workspaces?.[0]?.id || WORKSPACE_ID;
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [showCsvModal, setShowCsvModal] = useState(false);

  const { data: leads, isLoading } = useSWR(
    wsId ? `leads:${wsId}:${status}:${offset}` : null,
    () => api.getLeads(wsId, { status: status || undefined, limit, offset })
  );

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#fafafa]">Leads</h1>
        {wsId && (
          <button
            type="button"
            onClick={() => setShowCsvModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] rounded-lg text-sm text-[#a1a1aa] hover:text-[#fafafa] transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload CSV
          </button>
        )}
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

      {/* CSV Import Modal */}
      {showCsvModal && wsId && (
        <CsvImportModal
          wsId={wsId}
          onClose={() => setShowCsvModal(false)}
          onImported={() => {
            setShowCsvModal(false);
            globalMutate(`leads:${wsId}:${status}:${offset}`);
          }}
        />
      )}
    </div>
  );
}


// ─── CSV Import Modal ──────────────────────────────────────────────────────────

type ModalStep = "upload" | "map" | "done";

function CsvImportModal({
  wsId,
  onClose,
  onImported,
}: {
  wsId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ModalStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelect(f: File) {
    setFile(f);
    setLoading(true);
    setError(null);
    try {
      const data = await api.csvPreview(wsId, f);
      setPreview(data);
      setMapping(data.auto_mapping);
      setStep("map");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to parse CSV");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.importCsv(wsId, file, mapping);
      setResult(res);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  const mappedEmail = mapping["email"];
  const canImport = !!mappedEmail && preview !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#111113] border border-[#27272a] rounded-2xl w-full max-w-2xl mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#27272a]">
          <div>
            <h2 className="text-base font-semibold text-[#fafafa]">Import Leads from CSV</h2>
            <p className="text-xs text-[#52525b] mt-0.5">
              {step === "upload" && "Upload a CSV file with your lead list"}
              {step === "map" && "Map your CSV columns to lead fields"}
              {step === "done" && "Import complete"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#52525b] hover:text-[#a1a1aa] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Step: Upload */}
          {step === "upload" && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFileSelect(f);
              }}
              className="border-2 border-dashed border-[#27272a] rounded-xl p-12 text-center cursor-pointer hover:border-[#3f3f46] transition-all group"
            >
              <svg className="w-10 h-10 mx-auto text-[#3f3f46] group-hover:text-[#52525b] mb-3 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm text-[#71717a] group-hover:text-[#a1a1aa] transition-colors">
                {loading ? "Parsing CSV…" : "Drop a CSV file here, or click to browse"}
              </p>
              <p className="text-xs text-[#3f3f46] mt-1">Only email is required — all other fields optional</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </div>
          )}

          {/* Step: Map columns */}
          {step === "map" && preview && (
            <div className="space-y-4">
              <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-3">
                <p className="text-xs text-[#52525b]">
                  <span className="text-[#a1a1aa] font-medium">{file?.name}</span>
                  {" — "}{preview.headers.length} columns detected.
                  Auto-mapped {Object.keys(preview.auto_mapping).length} fields.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                {(preview.importable_fields as string[]).map((field) => (
                  <div key={field}>
                    <label className="block text-xs text-[#71717a] mb-1">
                      {FIELD_LABELS[field] || field}
                    </label>
                    <select
                      value={mapping[field] || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMapping((m) => {
                          const next = { ...m };
                          if (val) next[field] = val;
                          else delete next[field];
                          return next;
                        });
                      }}
                      className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-[#a1a1aa] focus:outline-none focus:border-[#52525b]"
                    >
                      <option value="">— skip —</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview table */}
              {preview.preview.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-[#52525b] mb-2">Preview (first {preview.preview.length} rows)</p>
                  <div className="overflow-x-auto rounded-lg border border-[#27272a]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#27272a]">
                          {preview.headers.slice(0, 6).map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-[#52525b] font-medium whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.preview.map((row, i) => (
                          <tr key={i} className="border-b border-[#27272a]/50">
                            {preview.headers.slice(0, 6).map((h) => (
                              <td key={h} className="px-3 py-1.5 text-[#71717a] max-w-[120px] truncate whitespace-nowrap">
                                {row[h] || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && result && (
            <div className="py-4 text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold text-[#fafafa]">{result.imported} leads imported</p>
                <p className="text-sm text-[#52525b] mt-1">
                  {result.skipped > 0 && `${result.skipped} rows skipped (duplicates or invalid email)`}
                </p>
              </div>
              {result.errors.length > 0 && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-left">
                  <p className="text-xs text-red-400 font-medium mb-1">Errors ({result.errors.length})</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-300/70">{e}</p>
                  ))}
                </div>
              )}
              <p className="text-xs text-[#52525b]">
                Leads are ready in the pipeline as &quot;raw&quot; — run the pipeline to start researching them.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#27272a]">
          {step === "done" ? (
            <div className="ml-auto">
              <button
                type="button"
                onClick={onImported}
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm font-medium text-white transition-all"
              >
                View Leads
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={step === "map" ? () => setStep("upload") : onClose}
                className="px-4 py-2 text-sm text-[#71717a] hover:text-[#a1a1aa] transition-colors"
              >
                {step === "map" ? "← Back" : "Cancel"}
              </button>
              {step === "map" && (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!canImport || loading}
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 rounded-lg text-sm font-medium text-white transition-all"
                >
                  {loading ? "Importing…" : `Import Leads`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

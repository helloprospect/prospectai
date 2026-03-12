"use client";
import useSWR, { mutate } from "swr";
import { api, PromptTemplate } from "@/lib/api";
import { useState } from "react";

const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID || "";

const PROMPT_LABELS: Record<string, string> = {
  research:        "Lead Research",
  scoring:         "Lead Scoring",
  personalization: "Email Personalization",
  reddit_comment:  "Reddit Comment",
  reddit_dm:       "Reddit DM",
  optimization:    "Optimization Analysis",
};

export default function SettingsPage() {
  const { data: workspaces } = useSWR("workspaces", () => api.getWorkspaces());
  const wsId = workspaces?.[0]?.id || WORKSPACE_ID;

  const [tab, setTab] = useState<"business" | "prompts">("business");

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#fafafa]">Settings</h1>
        <p className="text-sm text-[#71717a] mt-1">Manage your workspace, ICP, and prompt templates.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[#18181b] border border-[#27272a] rounded-lg w-fit mb-8">
        {(["business", "prompts"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
              tab === t
                ? "bg-[#27272a] text-[#fafafa]"
                : "text-[#71717a] hover:text-[#a1a1aa]"
            }`}
          >
            {t === "business" ? "Business & ICP" : "Prompt Templates"}
          </button>
        ))}
      </div>

      {tab === "business" && wsId && <BusinessTab wsId={wsId} />}
      {tab === "prompts" && wsId && <PromptsTab wsId={wsId} />}
    </div>
  );
}

// ─── Business Tab ─────────────────────────────────────────────────────────────

function BusinessTab({ wsId }: { wsId: string }) {
  const { data: workspace, mutate: mutateWs } = useSWR(
    `workspace:${wsId}`,
    () => api.getWorkspace(wsId)
  );

  const bp = (workspace?.business_profile || {}) as Record<string, any>;
  const icp = (workspace as any)?.icp_config as Record<string, any> | undefined;

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [campaignList, setCampaignList] = useState<{id:string;name:string}[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignError, setCampaignError] = useState("");

  // Init form once workspace loads
  const current = form ?? {
    company_name: bp.company_name || "",
    website: bp.website || "",
    product_description: bp.product_description || "",
    value_prop: bp.value_prop || "",
    case_study: bp.case_study || "",
    role_description: bp.role_description || "",
    icp_titles: (icp?.titles || []).join("\n"),
    icp_geographies: (icp?.geographies || []).join(", "),
    instantly_api_key: (workspace as any)?.instantly_api_key || "",
    instantly_campaign_id: (workspace as any)?.instantly_campaign_id || "",
  };

  function set(key: string, val: string) {
    setForm({ ...current, [key]: val });
  }

  async function loadCampaigns() {
    if (!current.instantly_api_key.trim()) return;
    setLoadingCampaigns(true); setCampaignError("");
    try {
      const result = await api.listInstantlyCampaigns(current.instantly_api_key.trim());
      setCampaignList(result);
    } catch { setCampaignError("Could not load campaigns. Check your API key."); }
    finally { setLoadingCampaigns(false); }
  }

  async function handleSave() {
    setSaving(true); setSaveError("");
    try {
      const payload: Record<string, any> = {
        business_profile: {
          ...bp,
          ...(current.company_name && { company_name: current.company_name }),
          ...(current.website && { website: current.website }),
          ...(current.product_description && { product_description: current.product_description }),
          ...(current.value_prop && { value_prop: current.value_prop }),
          ...(current.case_study && { case_study: current.case_study }),
          ...(current.role_description && { role_description: current.role_description }),
        },
        icp_config: {
          ...(icp || {}),
          titles: current.icp_titles.split("\n").map((s: string) => s.trim()).filter(Boolean),
          geographies: current.icp_geographies.split(",").map((s: string) => s.trim()).filter(Boolean),
        },
      };
      if (current.instantly_api_key) payload.instantly_api_key = current.instantly_api_key;
      if (current.instantly_campaign_id) payload.instantly_campaign_id = current.instantly_campaign_id;

      await api.updateWorkspace(wsId, payload);
      mutateWs();
      setForm(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setSaveError(e.message || "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!workspace) {
    return <div className="text-sm text-[#52525b]">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <Section title="Business Profile">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company Name">
            <Input value={current.company_name} onChange={(v) => set("company_name", v)} placeholder="Acme Inc." />
          </Field>
          <Field label="Website">
            <Input value={current.website} onChange={(v) => set("website", v)} placeholder="https://acme.com" />
          </Field>
        </div>
        <Field label="What you sell">
          <Textarea value={current.product_description} onChange={(v) => set("product_description", v)} placeholder="We help SaaS companies…" rows={3} />
        </Field>
        <Field label="Value Prop" hint="We help X achieve Y by Z">
          <Input value={current.value_prop} onChange={(v) => set("value_prop", v)} placeholder="We help B2B founders get 10+ demos/month…" />
        </Field>
        <Field label="Proof / Case Study" hint="Used in every email — be specific with numbers">
          <Input value={current.case_study} onChange={(v) => set("case_study", v)} placeholder="50 meetings for Figure8 (Belgian agency) in 90 days" />
        </Field>
        <Field label="Email Persona" hint="How you present yourself — injected as {{sender_role}}">
          <Input value={current.role_description} onChange={(v) => set("role_description", v)} placeholder="You are a founder at Acme, reaching out peer-to-peer to other founders." />
        </Field>
      </Section>

      <Section title="ICP Settings">
        <Field label="Target Titles" hint="one per line">
          <Textarea value={current.icp_titles} onChange={(v) => set("icp_titles", v)} placeholder={"CEO\nFounder\nHead of Sales"} rows={4} />
        </Field>
        <Field label="Geographies" hint="comma-separated">
          <Input value={current.icp_geographies} onChange={(v) => set("icp_geographies", v)} placeholder="US, UK, DACH" />
        </Field>
      </Section>

      <Section title="Instantly Integration">
        <Field label="API Key">
          <div className="flex gap-2">
            <Input value={current.instantly_api_key} onChange={(v) => { set("instantly_api_key", v); setCampaignList([]); }} placeholder="inst_••••••••••••••••••••" />
            <button type="button" onClick={loadCampaigns} disabled={!current.instantly_api_key.trim() || loadingCampaigns}
              className="px-4 py-2 rounded-lg bg-[#27272a] text-[#a1a1aa] text-sm whitespace-nowrap disabled:opacity-40 hover:bg-[#3f3f46] transition-colors">
              {loadingCampaigns ? "Loading…" : "Load Campaigns"}
            </button>
          </div>
          {campaignError && <p className="text-red-400 text-xs mt-1">{campaignError}</p>}
        </Field>
        {campaignList.length > 0 && (
          <Field label="Campaign">
            <select className={inputBase} value={current.instantly_campaign_id} onChange={e => set("instantly_campaign_id", e.target.value)}>
              <option value="">— Choose a campaign —</option>
              {campaignList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        {!campaignList.length && current.instantly_campaign_id && (
          <p className="text-xs text-[#52525b]">Campaign ID saved: {current.instantly_campaign_id}</p>
        )}
      </Section>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-all duration-150"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        {saved && <span className="text-xs text-emerald-400">✓ Saved</span>}
        {saveError && <span className="text-xs text-red-400">{saveError}</span>}
      </div>
    </div>
  );
}

// ─── Prompts Tab ───────────────────────────────────────────────────────────────

function PromptsTab({ wsId }: { wsId: string }) {
  const { data: prompts, isLoading, mutate: mutatePrompts } = useSWR(
    `prompts:${wsId}`,
    () => api.getPrompts(wsId)
  );

  const [editing, setEditing] = useState<string | null>(null);

  const active = prompts?.filter((p) => p.is_active) ?? [];
  const grouped = active.reduce<Record<string, PromptTemplate>>((acc, p) => {
    acc[p.template_type] = p;
    return acc;
  }, {});

  if (isLoading) return <div className="text-sm text-[#52525b]">Loading prompts…</div>;

  return (
    <div className="space-y-3">
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 mb-2">
        <p className="text-xs text-[#71717a] leading-relaxed">
          These are the active prompt templates your system uses for research, scoring, and personalization.
          You can edit them manually — changes are saved as a new version with &quot;human&quot; authorship.
          The nightly optimizer will continue to propose improvements based on Instantly performance data.
        </p>
      </div>
      {Object.entries(grouped).map(([type, prompt]) => (
        <PromptCard
          key={prompt.id}
          wsId={wsId}
          prompt={prompt}
          label={PROMPT_LABELS[type] || type}
          isEditing={editing === prompt.id}
          onEdit={() => setEditing(prompt.id)}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); mutatePrompts(); }}
        />
      ))}
      {active.length === 0 && (
        <div className="bg-[#111113] border border-[#27272a] rounded-xl p-10 text-center">
          <p className="text-[#52525b] text-sm">No active prompts found.</p>
          <p className="text-xs text-[#3f3f46] mt-1">Run the pipeline once to seed templates.</p>
        </div>
      )}
    </div>
  );
}

function PromptCard({
  wsId, prompt, label, isEditing, onEdit, onCancel, onSaved,
}: {
  wsId: string;
  prompt: PromptTemplate;
  label: string;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function loadAndEdit() {
    if (content === null) {
      const full = await api.getPromptFull(wsId, prompt.id);
      setContent(full.content);
    }
    onEdit();
  }

  async function handleSave() {
    if (!content) return;
    setSaving(true);
    try {
      await api.updatePrompt(wsId, prompt.id, content);
      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  const authorColor =
    prompt.created_by === "claude_optimizer"
      ? "text-brand-400"
      : prompt.created_by === "human"
      ? "text-emerald-400"
      : "text-[#71717a]";

  return (
    <div className="bg-[#111113] border border-[#27272a] rounded-xl overflow-hidden">
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-[#18181b] transition-colors duration-150"
        onClick={() => { if (!isEditing) setExpanded(!expanded); }}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[#fafafa]">{label}</span>
          <span className="text-[10px] text-[#52525b] bg-[#18181b] px-2 py-0.5 rounded font-mono">
            v{prompt.version}
          </span>
          <span className={`text-[10px] font-medium ${authorColor}`}>
            {prompt.created_by === "claude_optimizer" ? "auto-optimized" :
             prompt.created_by === "human" ? "edited by you" : "seed"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); loadAndEdit(); }}
            className="px-3 py-1 text-xs text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] rounded-md transition-all duration-150"
          >
            Edit
          </button>
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            className={`text-[#52525b] transition-transform duration-150 ${expanded && !isEditing ? "rotate-180" : ""}`}
          >
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {(expanded || isEditing) && (
        <div className="border-t border-[#27272a] p-5">
          {isEditing ? (
            <div className="space-y-3">
              <textarea
                className="w-full bg-[#18181b] border border-[#27272a] focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 rounded-lg px-3.5 py-3 text-sm text-[#fafafa] font-mono resize-y min-h-[280px] outline-none transition-all"
                value={content ?? ""}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-all duration-150"
                >
                  {saving ? "Saving…" : "Save as new version"}
                </button>
                <button
                  onClick={onCancel}
                  className="px-4 py-1.5 text-xs text-[#71717a] hover:text-[#a1a1aa] rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#71717a] font-mono whitespace-pre-wrap leading-relaxed">
              {prompt.content_preview}
              {prompt.content_preview?.length >= 200 && (
                <span className="text-[#3f3f46]">… (click Edit to see full)</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6 space-y-4">
      <h2 className="text-xs font-medium text-[#52525b] uppercase tracking-widest">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wider">{label}</label>
        {hint && <span className="text-[10px] text-[#52525b]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputBase = "w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3.5 py-2.5 text-sm text-[#fafafa] placeholder-[#3f3f46] focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 transition-all duration-150";

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className={inputBase} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

function Textarea({ value, onChange, placeholder, rows }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea className={`${inputBase} resize-none`} rows={rows ?? 3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

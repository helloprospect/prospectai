"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, CsvPreview } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingData {
  workspace_name: string;
  owner_email: string;
  company_name: string;
  product_description: string;
  value_prop: string;
  case_study: string;
  industries: string[];
  company_sizes: string[];
  titles: string;
  geographies: string;
  instantly_api_key: string;
  instantly_campaign_id: string;
  instantly_campaign_name: string;
}

interface InstantlyCampaign { id: string; name: string; }

const INDUSTRIES = ["SaaS", "E-Commerce", "Agency", "Prof. Services", "Fintech", "Healthtech", "Manufacturing", "Logistics", "Real Estate", "Other"];
const SIZES = ["1–10", "10–50", "50–200", "200–500", "500–1000", "1000+"];
const SIZE_MAP: Record<string, string> = {
  "1–10": "1-10", "10–50": "10-50", "50–200": "50-200",
  "200–500": "200-500", "500–1000": "500-1000", "1000+": "1000+",
};

const FIELD_LABELS: Record<string, string> = {
  email: "Email *", first_name: "First Name", last_name: "Last Name",
  company: "Company", title: "Job Title", linkedin_url: "LinkedIn URL",
  website: "Website", industry: "Industry", company_size: "Company Size", location: "Location",
};

// ─── Shared UI ─────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wide">{label}</label>
        {hint && <span className="text-xs text-[#52525b]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Steps ─────────────────────────────────────────────────────────────────────

function StepBusiness({ data, setData }: { data: OnboardingData; setData: (d: Partial<OnboardingData>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[#fafafa] mb-1">Your Business</h2>
        <p className="text-sm text-[#71717a]">Tell us about what you sell and who you help.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Workspace Name *">
          <input className="input" value={data.workspace_name} onChange={e => setData({ workspace_name: e.target.value })} placeholder="ProspectAI" />
        </Field>
        <Field label="Your Email *">
          <input className="input" type="email" value={data.owner_email} onChange={e => setData({ owner_email: e.target.value })} placeholder="you@company.com" />
        </Field>
      </div>
      <Field label="Company Name *">
        <input className="input" value={data.company_name} onChange={e => setData({ company_name: e.target.value })} placeholder="Acme Inc." />
      </Field>
      <Field label="What You Sell *" hint="1–2 sentences">
        <textarea className="input resize-none h-20" value={data.product_description}
          onChange={e => setData({ product_description: e.target.value })}
          placeholder="We help B2B companies book more meetings with AI-personalized cold emails." />
      </Field>
      <Field label="Value Prop" hint="We help X achieve Y by Z">
        <input className="input" value={data.value_prop} onChange={e => setData({ value_prop: e.target.value })}
          placeholder="We help agencies get 3x more clients without hiring more SDRs." />
      </Field>
      <Field label="Proof / Case Study" hint="Your best result — used in every email">
        <input className="input" value={data.case_study} onChange={e => setData({ case_study: e.target.value })}
          placeholder="Got 50 meetings for a web design agency in Belgium in 90 days." />
      </Field>
    </div>
  );
}

function StepTarget({ data, setData }: { data: OnboardingData; setData: (d: Partial<OnboardingData>) => void }) {
  const toggle = (arr: string[], val: string) => arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[#fafafa] mb-1">Who You Target</h2>
        <p className="text-sm text-[#71717a]">Define the companies and roles you want to reach.</p>
      </div>
      <Field label="Industries *">
        <div className="flex flex-wrap gap-2 mt-1">
          {INDUSTRIES.map(i => (
            <button key={i} type="button" onClick={() => setData({ industries: toggle(data.industries, i) })}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${data.industries.includes(i) ? "bg-brand-500 border-brand-500 text-white" : "border-[#27272a] text-[#71717a] hover:border-[#52525b]"}`}>
              {i}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Company Size">
        <div className="flex flex-wrap gap-2 mt-1">
          {SIZES.map(s => (
            <button key={s} type="button" onClick={() => setData({ company_sizes: toggle(data.company_sizes, s) })}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${data.company_sizes.includes(s) ? "bg-brand-500 border-brand-500 text-white" : "border-[#27272a] text-[#71717a] hover:border-[#52525b]"}`}>
              {s}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Target Titles" hint="One per line">
        <textarea className="input resize-none h-28" value={data.titles}
          onChange={e => setData({ titles: e.target.value })}
          placeholder={"CEO\nFounder\nHead of Sales\nVP Marketing"} />
      </Field>
      <Field label="Countries / Regions" hint="Comma-separated">
        <input className="input" value={data.geographies} onChange={e => setData({ geographies: e.target.value })}
          placeholder="US, UK, Germany, Netherlands" />
      </Field>
    </div>
  );
}

function StepInstantly({ data, setData }: { data: OnboardingData; setData: (d: Partial<OnboardingData>) => void }) {
  const [campaigns, setCampaigns] = useState<InstantlyCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCampaigns = async () => {
    if (!data.instantly_api_key.trim()) return;
    setLoading(true); setError("");
    try {
      const result = await api.listInstantlyCampaigns(data.instantly_api_key.trim());
      setCampaigns(result);
      if (result.length === 1) setData({ instantly_campaign_id: result[0].id, instantly_campaign_name: result[0].name });
    } catch {
      setError("Could not load campaigns. Check your API key.");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[#fafafa] mb-1">Connect Instantly</h2>
        <p className="text-sm text-[#71717a]">Your emails are sent through your Instantly account. You can skip this and connect later in Settings.</p>
      </div>
      <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-3 flex gap-3 items-start">
        <span className="text-yellow-500 mt-0.5">!</span>
        <p className="text-xs text-[#a1a1aa]">Find your API key in Instantly → Settings → Integrations → API Keys. The campaign must already exist in Instantly.</p>
      </div>
      <Field label="Instantly API Key">
        <div className="flex gap-2">
          <input className="input flex-1" value={data.instantly_api_key}
            onChange={e => { setData({ instantly_api_key: e.target.value, instantly_campaign_id: "", instantly_campaign_name: "" }); setCampaigns([]); }}
            placeholder="inst_••••••••••••••••••••" />
          <button type="button" onClick={loadCampaigns} disabled={!data.instantly_api_key.trim() || loading}
            className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium disabled:opacity-40 hover:bg-brand-600 transition-colors whitespace-nowrap">
            {loading ? "Loading…" : "Load Campaigns"}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      </Field>
      {campaigns.length > 0 && (
        <Field label="Select Campaign">
          <select className="input" value={data.instantly_campaign_id}
            onChange={e => { const c = campaigns.find(c => c.id === e.target.value); setData({ instantly_campaign_id: e.target.value, instantly_campaign_name: c?.name || "" }); }}>
            <option value="">— Choose a campaign —</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
      {data.instantly_campaign_id && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Campaign: <span className="font-medium">{data.instantly_campaign_name}</span>
        </div>
      )}
    </div>
  );
}

function StepLeads({ csvFile, setCsvFile, csvPreview, setCsvPreview, mapping, setMapping }: {
  csvFile: File | null; setCsvFile: (f: File | null) => void;
  csvPreview: CsvPreview | null; setCsvPreview: (p: CsvPreview | null) => void;
  mapping: Record<string, string>; setMapping: (m: Record<string, string>) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const parseFile = useCallback(async (file: File) => {
    setCsvFile(file); setError(""); setLoading(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter(Boolean);
      const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      const rows = lines.slice(1, 6).map(line => {
        const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        return Object.fromEntries(rawHeaders.map((h, i) => [h, vals[i] || ""]));
      });
      const patterns: Record<string, string[]> = {
        email: ["email", "e-mail", "emailaddress", "email address", "mail"],
        first_name: ["first_name", "first name", "firstname", "vorname"],
        last_name: ["last_name", "last name", "lastname", "nachname", "surname"],
        company: ["company", "company name", "organization", "organisation", "firm", "account"],
        title: ["title", "job title", "jobtitle", "position", "role"],
        linkedin_url: ["linkedin", "linkedin url", "linkedin_url", "profile url"],
        website: ["website", "url", "web", "domain"],
        industry: ["industry", "sector", "vertical"],
        company_size: ["company size", "employees", "headcount", "size", "company_size"],
        location: ["location", "country", "city", "region"],
      };
      const autoMapping: Record<string, string> = {};
      for (const [field, aliases] of Object.entries(patterns)) {
        for (const header of rawHeaders) {
          if (aliases.includes(header.toLowerCase().trim())) { autoMapping[field] = header; break; }
        }
      }
      setCsvPreview({ headers: rawHeaders, preview: rows, auto_mapping: autoMapping, importable_fields: Object.keys(patterns) });
      setMapping(autoMapping);
    } catch { setError("Could not parse CSV. Make sure it's a valid CSV file."); }
    finally { setLoading(false); }
  }, [setCsvFile, setCsvPreview, setMapping]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0]; if (file) parseFile(file);
  }, [parseFile]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[#fafafa] mb-1">Upload Your Leads</h2>
        <p className="text-sm text-[#71717a]">Upload a CSV with the contacts you want to reach. Email column is required.</p>
      </div>

      {!csvPreview ? (
        <div onDrop={onDrop} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onClick={() => document.getElementById("csv-onboarding")?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragging ? "border-brand-500 bg-brand-500/5" : "border-[#27272a] hover:border-[#52525b]"}`}>
          <input id="csv-onboarding" type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
          {loading ? <p className="text-sm text-[#71717a]">Parsing…</p> : (
            <>
              <div className="w-10 h-10 rounded-xl bg-[#27272a] flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3v10M6 9l4-4 4 4" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 15h14" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
              <p className="text-sm font-medium text-[#a1a1aa]">Drop CSV here or click to browse</p>
              <p className="text-xs text-[#52525b] mt-1">Email column required. First name, company, title recommended.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-green-400">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {csvFile?.name}
            </div>
            <button type="button" onClick={() => { setCsvFile(null); setCsvPreview(null); setMapping({}); }} className="text-xs text-[#52525b] hover:text-[#a1a1aa]">Change file</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {csvPreview.importable_fields.map(field => (
              <div key={field}>
                <label className="text-xs text-[#71717a] block mb-1">{FIELD_LABELS[field] || field}</label>
                <select className="input text-sm" value={mapping[field] || ""} onChange={e => setMapping({ ...mapping, [field]: e.target.value })}>
                  <option value="">— not mapped —</option>
                  {csvPreview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          {!mapping.email && <p className="text-amber-400 text-xs">Map the Email column to continue.</p>}
        </div>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}

function StepLaunch({ data, csvPreview }: { data: OnboardingData; csvPreview: CsvPreview | null }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-[#fafafa] mb-1">Ready to Launch</h2>
        <p className="text-sm text-[#71717a]">Review your setup before going live.</p>
      </div>
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl divide-y divide-[#27272a]">
        {[
          ["Workspace", data.workspace_name],
          ["Company", data.company_name],
          ["Targeting", data.industries.slice(0, 3).join(", ") || "—"],
          ["Company sizes", data.company_sizes.join(", ") || "Any"],
          ["Leads", csvPreview ? `CSV ready (${csvPreview.preview.length}+ rows parsed)` : "Add later via Leads page"],
          ["Instantly", data.instantly_campaign_id ? `✓ ${data.instantly_campaign_name}` : "Not connected — add in Settings"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-[#71717a]">{label}</span>
            <span className={`text-sm font-medium ${value.startsWith("✓") ? "text-green-400" : "text-[#fafafa]"}`}>{value}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#52525b]">
        After launch, leads will be researched, scored, and personalized by AI — then added to your Instantly campaign. The optimizer will improve prompts over time based on performance.
      </p>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const STEPS = ["Business", "Target", "Instantly", "Leads", "Launch"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");

  const [data, setDataRaw] = useState<OnboardingData>({
    workspace_name: "", owner_email: "", company_name: "",
    product_description: "", value_prop: "", case_study: "",
    industries: [], company_sizes: [], titles: "", geographies: "",
    instantly_api_key: "", instantly_campaign_id: "", instantly_campaign_name: "",
  });
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const setData = (partial: Partial<OnboardingData>) => setDataRaw(prev => ({ ...prev, ...partial }));

  const canAdvance = () => {
    if (step === 0) return !!(data.workspace_name.trim() && data.owner_email.trim() && data.company_name.trim() && data.product_description.trim());
    if (step === 1) return data.industries.length > 0;
    if (step === 3 && csvPreview) return !!mapping.email;
    return true;
  };

  const handleLaunch = async () => {
    setLaunching(true); setError("");
    try {
      const workspace = await api.createWorkspace({
        name: data.workspace_name,
        owner_email: data.owner_email,
        business_profile: {
          company_name: data.company_name,
          product_description: data.product_description,
          value_prop: data.value_prop,
          case_study: data.case_study,
        },
        icp_config: {
          industries: data.industries,
          company_sizes: data.company_sizes.map(s => SIZE_MAP[s] || s),
          titles: data.titles.split("\n").map(t => t.trim()).filter(Boolean),
          geographies: data.geographies.split(",").map(g => g.trim()).filter(Boolean),
        },
        instantly_api_key: data.instantly_api_key || undefined,
        instantly_campaign_id: data.instantly_campaign_id || undefined,
      } as any);

      if (csvFile && mapping.email) {
        await api.importCsv(workspace.id, csvFile, mapping).catch(() => {});
      }

      router.push("/dashboard");
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
      setLaunching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-start py-12 px-4">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-10">
        <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M2 11L7 3l5 8H2z" fill="white" opacity="0.9"/></svg>
        </div>
        <span className="font-semibold text-[#fafafa] text-base">ProspectAI</span>
      </div>

      {/* Steps */}
      <div className="flex items-center mb-8">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${i < step ? "bg-brand-500 text-white" : i === step ? "bg-brand-500 text-white ring-4 ring-brand-500/20" : "bg-[#27272a] text-[#52525b]"}`}>
                {i < step ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> : i + 1}
              </div>
              <span className={`text-xs ${i === step ? "text-[#fafafa]" : "text-[#52525b]"}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`w-14 h-px mx-2 mb-4 ${i < step ? "bg-brand-500" : "bg-[#27272a]"}`} />}
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-lg bg-[#111113] border border-[#27272a] rounded-2xl p-8">
        {step === 0 && <StepBusiness data={data} setData={setData} />}
        {step === 1 && <StepTarget data={data} setData={setData} />}
        {step === 2 && <StepInstantly data={data} setData={setData} />}
        {step === 3 && <StepLeads csvFile={csvFile} setCsvFile={setCsvFile} csvPreview={csvPreview} setCsvPreview={setCsvPreview} mapping={mapping} setMapping={setMapping} />}
        {step === 4 && <StepLaunch data={data} csvPreview={csvPreview} />}

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

        <div className={`flex mt-8 ${step > 0 ? "justify-between" : "justify-end"}`}>
          {step > 0 && (
            <button type="button" onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1.5 text-sm text-[#71717a] hover:text-[#a1a1aa] transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Back
            </button>
          )}
          <div className="flex gap-3">
            {step === 2 && !data.instantly_api_key && (
              <button type="button" onClick={() => setStep(3)} className="px-5 py-2.5 rounded-xl text-sm text-[#71717a] hover:text-[#a1a1aa] transition-colors">
                Skip for now
              </button>
            )}
            {step === 3 && !csvPreview && (
              <button type="button" onClick={() => setStep(4)} className="px-5 py-2.5 rounded-xl text-sm text-[#71717a] hover:text-[#a1a1aa] transition-colors">
                Skip for now
              </button>
            )}
            {step < 4 ? (
              <button type="button" onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium disabled:opacity-40 hover:bg-brand-600 transition-colors">
                Continue
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            ) : (
              <button type="button" onClick={handleLaunch} disabled={launching}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-60 hover:bg-green-700 transition-colors">
                {launching ? "Launching…" : <><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.5 3 3.5.5-2.5 2.5.5 3.5L7 9l-3 1.5.5-3.5L2 4.5l3.5-.5L7 1z" stroke="white" strokeWidth="1.2" strokeLinejoin="round"/></svg> Launch</>}
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-8 text-xs text-[#3f3f46]">ProspectAI · AI-native outreach platform</p>
    </div>
  );
}

"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

interface BusinessProfile {
  company_name: string;
  product_description: string;
  value_prop: string;
  case_study: string;
}

interface Campaign {
  id: string;
  name: string;
}

const STEPS = ["Your Business", "Connect Instantly", "Upload Leads"];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
            i < current ? "bg-brand-500 text-white" :
            i === current ? "bg-brand-500/20 text-brand-400 border border-brand-500/40" :
            "bg-[#27272a] text-[#52525b]"
          }`}>
            {i < current ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`w-12 h-px ${i < current ? "bg-brand-500" : "bg-[#27272a]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 1 state
  const [profile, setProfile] = useState<BusinessProfile>({
    company_name: "",
    product_description: "",
    value_prop: "",
    case_study: "",
  });

  // Step 2 state
  const [instantlyKey, setInstantlyKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignError, setCampaignError] = useState("");

  // Step 3 state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [launching, setLaunching] = useState(false);

  const loadCampaigns = async () => {
    if (!instantlyKey) { setCampaignError("Enter your API key first."); return; }
    setLoadingCampaigns(true);
    setCampaignError("");
    try {
      const res = await fetch("/api/workspaces/instantly/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: instantlyKey }),
      });
      if (res.ok) {
        setCampaigns(await res.json());
      } else {
        setCampaignError("Could not load campaigns. Check your API key.");
      }
    } catch {
      setCampaignError("Network error. Backend may not be running yet.");
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const launch = async () => {
    setLaunching(true);
    try {
      // Create workspace
      const wsRes = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.company_name || "My Workspace",
          owner_email: "founder@company.com",
          business_profile: profile,
          instantly_api_key: instantlyKey,
          instantly_campaign_id: selectedCampaign,
          status: "active",
        }),
      });

      if (wsRes.ok) {
        const ws = await wsRes.json();
        // Import CSV if provided
        if (csvFile && ws.id) {
          const form = new FormData();
          form.append("file", csvFile);
          form.append("mapping", JSON.stringify({}));
          await fetch(`/api/leads/${ws.id}/import-csv`, { method: "POST", body: form });
        }
        router.replace("/pipeline");
      } else {
        // Mock fallback: skip to pipeline anyway
        router.replace("/pipeline");
      }
    } catch {
      // Even if backend fails, navigate to show the prototype
      router.replace("/pipeline");
    }
  };

  const canNext0 = profile.company_name.length > 0 && profile.product_description.length > 10;
  const canNext1 = true; // API key optional for prototype
  const canLaunch = true; // CSV optional

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10 justify-center">
          <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <path d="M2 11L7 3l5 8H2z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <span className="font-semibold text-[#fafafa] text-base tracking-tight">ProspectAI</span>
        </div>

        <div className="card p-8">
          <StepIndicator current={step} total={3} />

          {/* Step 0: Business Profile */}
          {step === 0 && (
            <div>
              <h1 className="text-lg font-semibold text-[#fafafa] mb-1">Tell us about your business</h1>
              <p className="text-sm text-[#71717a] mb-6">
                This context helps the AI write highly personalized cold emails.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[#a1a1aa] mb-1.5 font-medium">Company Name *</label>
                  <input
                    className="input"
                    value={profile.company_name}
                    placeholder="Acme Corp"
                    onChange={e => setProfile(p => ({ ...p, company_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#a1a1aa] mb-1.5 font-medium">What do you sell? *</label>
                  <p className="text-xs text-[#52525b] mb-1.5">2 sentences. The AI uses this for research prompts.</p>
                  <textarea
                    className="input resize-none"
                    rows={3}
                    value={profile.product_description}
                    placeholder="We help SaaS companies reduce churn by 40% using AI-driven customer success automation."
                    onChange={e => setProfile(p => ({ ...p, product_description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#a1a1aa] mb-1.5 font-medium">Core Value Proposition</label>
                  <input
                    className="input"
                    value={profile.value_prop}
                    placeholder="Cut churn in half with zero extra headcount."
                    onChange={e => setProfile(p => ({ ...p, value_prop: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#a1a1aa] mb-1.5 font-medium">Best Case Study / Social Proof</label>
                  <input
                    className="input"
                    value={profile.case_study}
                    placeholder="Helped Basecamp reduce churn from 8% to 3.2% in 90 days."
                    onChange={e => setProfile(p => ({ ...p, case_study: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Connect Instantly */}
          {step === 1 && (
            <div>
              <h1 className="text-lg font-semibold text-[#fafafa] mb-1">Connect your tools</h1>
              <p className="text-sm text-[#71717a] mb-6">
                Add your API keys. You can skip this and add them later in Settings.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[#a1a1aa] mb-1.5 font-medium">Instantly API Key</label>
                  <p className="text-xs text-[#52525b] mb-1.5">Settings → API Keys → Bearer token (v2)</p>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      type="password"
                      value={instantlyKey}
                      placeholder="Bearer token…"
                      onChange={e => { setInstantlyKey(e.target.value); setCampaigns([]); }}
                    />
                    <button
                      onClick={loadCampaigns}
                      disabled={loadingCampaigns || !instantlyKey}
                      className="px-3 py-2 rounded-lg border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#3f3f46] text-sm transition-colors disabled:opacity-40 whitespace-nowrap"
                    >
                      {loadingCampaigns ? "Loading…" : "Load Campaigns"}
                    </button>
                  </div>
                  {campaignError && <p className="text-xs text-red-400 mt-1">{campaignError}</p>}
                </div>

                {campaigns.length > 0 && (
                  <div>
                    <label className="block text-sm text-[#a1a1aa] mb-1.5 font-medium">Select Campaign</label>
                    <select
                      className="input"
                      value={selectedCampaign}
                      onChange={e => setSelectedCampaign(e.target.value)}
                    >
                      <option value="">Choose a campaign…</option>
                      {campaigns.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm text-[#a1a1aa] mb-1.5 font-medium">Anthropic API Key</label>
                  <p className="text-xs text-[#52525b] mb-1.5">Used for AI research and Explorer prompt generation</p>
                  <input
                    className="input"
                    type="password"
                    value={anthropicKey}
                    placeholder="sk-ant-…"
                    onChange={e => setAnthropicKey(e.target.value)}
                  />
                </div>

                <div className="bg-[#18181b] rounded-lg p-3 text-xs text-[#52525b]">
                  <p className="font-medium text-[#71717a] mb-1">Don't have these yet?</p>
                  <p>No problem. Skip this step and add your keys in Settings later. The pipeline won't run without them, but you can explore the interface.</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Upload Leads */}
          {step === 2 && (
            <div>
              <h1 className="text-lg font-semibold text-[#fafafa] mb-1">Upload your leads</h1>
              <p className="text-sm text-[#71717a] mb-6">
                CSV with: email, first_name, last_name, company, title. Or skip and upload later.
              </p>
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  csvFile
                    ? "border-brand-500/40 bg-brand-500/5"
                    : "border-[#27272a] hover:border-[#3f3f46] bg-[#18181b]"
                }`}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => setCsvFile(e.target.files?.[0] ?? null)}
                />
                {csvFile ? (
                  <div>
                    <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center mx-auto mb-3">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M4 10l5 5 7-7" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-[#fafafa]">{csvFile.name}</p>
                    <p className="text-xs text-[#71717a] mt-1">{(csvFile.size / 1024).toFixed(1)} KB · Click to change</p>
                  </div>
                ) : (
                  <div>
                    <div className="w-10 h-10 rounded-full bg-[#27272a] flex items-center justify-center mx-auto mb-3">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M10 4v8M6 8l4-4 4 4M4 16h12" stroke="#52525b" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <p className="text-sm text-[#71717a]">Click to upload CSV</p>
                    <p className="text-xs text-[#52525b] mt-1">email, first_name, last_name, company, title</p>
                  </div>
                )}
              </div>
              <div className="mt-4 text-center">
                <p className="text-xs text-[#52525b]">
                  You can also upload CSVs from the Pipeline page at any time.
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-[#27272a]">
            <button
              onClick={() => step > 0 ? setStep(s => s - 1) : null}
              className={`px-4 py-2 rounded-lg border border-[#27272a] text-[#71717a] hover:text-[#a1a1aa] text-sm transition-colors ${step === 0 ? "opacity-0 pointer-events-none" : ""}`}
            >
              Back
            </button>
            <div className="flex items-center gap-3">
              {step < 2 && (
                <button
                  onClick={() => setStep(s => s + 1)}
                  className="text-sm text-[#52525b] hover:text-[#71717a] transition-colors"
                >
                  Skip
                </button>
              )}
              {step < 2 ? (
                <button
                  onClick={() => setStep(s => s + 1)}
                  disabled={step === 0 && !canNext0}
                  className="px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:opacity-40"
                >
                  Continue
                </button>
              ) : (
                <button
                  onClick={launch}
                  disabled={launching}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {launching ? (
                    <><span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" /> Setting up…</>
                  ) : "Launch →"}
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-[#52525b] mt-6">
          STEP {step + 1} OF {STEPS.length} — {STEPS[step]}
        </p>
      </div>
    </div>
  );
}

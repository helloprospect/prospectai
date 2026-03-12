"use client";
import { useEffect, useState } from "react";

interface Settings {
  business_profile: {
    company_name: string;
    product_description: string;
    value_prop: string;
    case_study: string;
  };
  instantly_api_key: string;
  instantly_campaign_id: string;
  anthropic_api_key: string;
  active_campaign_name: string;
}

interface Campaign {
  id: string;
  name: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 space-y-4">
      <h2 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-[#a1a1aa] mb-1.5 font-medium">{label}</label>
      {hint && <p className="text-xs text-[#52525b] mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    business_profile: { company_name: "", product_description: "", value_prop: "", case_study: "" },
    instantly_api_key: "",
    instantly_campaign_id: "",
    anthropic_api_key: "",
    active_campaign_name: "",
  });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [campaignError, setCampaignError] = useState("");

  useEffect(() => {
    fetch("/api/mock/settings")
      .then(r => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  const loadCampaigns = async () => {
    if (!settings.instantly_api_key) {
      setCampaignError("Enter your Instantly API key first.");
      return;
    }
    setLoadingCampaigns(true);
    setCampaignError("");
    try {
      // Try real API first, fall back to mock
      const res = await fetch("/api/workspaces/instantly/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: settings.instantly_api_key }),
      });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data);
      } else {
        setCampaignError("Could not load campaigns. Check your API key.");
      }
    } catch {
      setCampaignError("Network error. Is the backend running?");
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/mock/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const bp = settings.business_profile;

  return (
    <div className="p-6 min-h-screen max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#fafafa]">Settings</h1>
          <p className="text-sm text-[#71717a] mt-0.5">Workspace configuration and API keys</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div className="space-y-4">
        {/* Business Profile */}
        <Section title="Business Profile">
          <Field label="Company Name">
            <input
              className="input"
              value={bp.company_name}
              placeholder="Acme Corp"
              onChange={e => setSettings(s => ({ ...s, business_profile: { ...s.business_profile, company_name: e.target.value } }))}
            />
          </Field>
          <Field label="What you sell" hint="2 sentences. Used by AI for research prompts.">
            <textarea
              className="input resize-none"
              rows={3}
              value={bp.product_description}
              placeholder="We help SaaS companies reduce churn by 40% using AI-driven customer success automation."
              onChange={e => setSettings(s => ({ ...s, business_profile: { ...s.business_profile, product_description: e.target.value } }))}
            />
          </Field>
          <Field label="Value Proposition" hint="One sentence. The core promise.">
            <input
              className="input"
              value={bp.value_prop}
              placeholder="Cut churn in half with zero extra headcount."
              onChange={e => setSettings(s => ({ ...s, business_profile: { ...s.business_profile, value_prop: e.target.value } }))}
            />
          </Field>
          <Field label="Case Study / Social Proof" hint="One result. Makes emails credible.">
            <input
              className="input"
              value={bp.case_study}
              placeholder='Helped Basecamp reduce churn from 8% to 3.2% in 90 days.'
              onChange={e => setSettings(s => ({ ...s, business_profile: { ...s.business_profile, case_study: e.target.value } }))}
            />
          </Field>
        </Section>

        {/* API Keys */}
        <Section title="API Keys">
          <Field label="Instantly API Key (Bearer Token)" hint="Found in Instantly → Settings → API Keys">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                type="password"
                value={settings.instantly_api_key}
                placeholder="Bearer token from Instantly v2"
                onChange={e => setSettings(s => ({ ...s, instantly_api_key: e.target.value }))}
              />
              <button
                onClick={loadCampaigns}
                disabled={loadingCampaigns}
                className="px-3 py-2 rounded-lg border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#3f3f46] text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {loadingCampaigns ? "Loading…" : "Load Campaigns"}
              </button>
            </div>
            {campaignError && <p className="text-xs text-red-400 mt-1">{campaignError}</p>}
          </Field>

          <Field label="Instantly Campaign">
            {campaigns.length > 0 ? (
              <select
                className="input"
                value={settings.instantly_campaign_id}
                onChange={e => setSettings(s => ({ ...s, instantly_campaign_id: e.target.value }))}
              >
                <option value="">Select a campaign…</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={settings.instantly_campaign_id}
                placeholder="Campaign ID (load campaigns above, or paste directly)"
                onChange={e => setSettings(s => ({ ...s, instantly_campaign_id: e.target.value }))}
              />
            )}
          </Field>

          <Field label="Anthropic API Key" hint="Used for AI research and Explorer prompt generation">
            <input
              className="input"
              type="password"
              value={settings.anthropic_api_key}
              placeholder="sk-ant-…"
              onChange={e => setSettings(s => ({ ...s, anthropic_api_key: e.target.value }))}
            />
          </Field>
        </Section>

        {/* Danger zone hint */}
        <div className="card p-4 border-[#3f3f46]">
          <p className="text-xs text-[#52525b]">
            <span className="text-[#71717a] font-medium">Prompt templates</span> — Coming soon.
            The AI-generated CCC prompts (Champion, Challenger, Explorer) will be editable here.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const STEPS = ["Business", "ICP", "Tone", "Sending", "Launch"];

const INDUSTRIES = [
  { value: "saas", label: "SaaS" },
  { value: "ecommerce", label: "E-Commerce" },
  { value: "agency", label: "Agency" },
  { value: "professional_services", label: "Prof. Services" },
  { value: "fintech", label: "Fintech" },
  { value: "healthtech", label: "Healthtech" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "logistics", label: "Logistics" },
  { value: "real_estate", label: "Real Estate" },
  { value: "other", label: "Other" },
];

const SIZES = ["1–10", "10–50", "50–200", "200–500", "500–1000", "1000+"];

function canAdvance(step: number, data: ReturnType<typeof defaultData>): string | null {
  if (step === 0) {
    if (!data.name.trim()) return "Workspace name is required";
    if (!data.owner_email.trim() || !data.owner_email.includes("@")) return "Valid email is required";
    if (!data.business_profile.product_description.trim()) return "Describe what you sell";
    if (!data.business_profile.value_prop.trim()) return "Value prop is required";
  }
  if (step === 1) {
    if (data.icp_config.industries.length === 0) return "Select at least one industry";
    if (data.icp_config.titles.filter(Boolean).length === 0) return "Add at least one target title";
  }
  return null;
}

function defaultData() {
  return {
    name: "",
    owner_email: "",
    business_profile: {
      company_name: "",
      website: "",
      product_description: "",
      value_prop: "",
      pain_points: ["", "", ""],
    },
    icp_config: {
      industries: [] as string[],
      company_sizes: [] as string[],
      titles: [""],
      geographies: ["US"],
      exclusions: [],
    },
    tone_config: { style: "direct" as "direct" | "friendly" | "professional" },
    instantly_api_key: "",
    instantly_campaign_id: "",
    daily_lead_target: 50,
  };
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState(defaultData);

  function update(path: string, value: unknown) {
    const keys = path.split(".");
    setData((prev) => {
      const next = { ...prev } as Record<string, unknown>;
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = { ...(cur[keys[i]] as Record<string, unknown>) };
        cur = cur[keys[i]] as Record<string, unknown>;
      }
      cur[keys[keys.length - 1]] = value;
      return next as typeof data;
    });
  }

  async function handleLaunch() {
    setLoading(true);
    try {
      const payload = {
        ...data,
        business_profile: {
          ...data.business_profile,
          pain_points: data.business_profile.pain_points.filter(Boolean),
        },
        icp_config: {
          ...data.icp_config,
          titles: data.icp_config.titles.filter(Boolean),
        },
        status: "active",
      };
      await api.createWorkspace(payload);
      router.push("/dashboard");
    } catch (e) {
      alert("Error creating workspace. Check console.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-10">
        <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
            <path d="M2 11L7 3l5 8H2z" fill="white" />
          </svg>
        </div>
        <span className="font-semibold text-[#fafafa] text-base tracking-tight">ProspectAI</span>
      </div>

      <div className="w-full max-w-lg">
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${
                    i < step
                      ? "bg-brand-500 text-white"
                      : i === step
                      ? "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/40"
                      : "bg-[#18181b] text-[#52525b]"
                  }`}
                >
                  {i < step ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-[10px] font-medium ${i === step ? "text-brand-400" : "text-[#52525b]"}`}>
                  {s}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 h-px mb-4 ${i < step ? "bg-brand-500/40" : "bg-[#27272a]"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-[#111113] border border-[#27272a] rounded-2xl p-8 shadow-xl animate-slide-up">
          {step === 0 && <StepBusiness data={data} update={update} />}
          {step === 1 && <StepICP data={data} update={update} />}
          {step === 2 && <StepTone data={data} update={update} />}
          {step === 3 && <StepSending data={data} update={update} />}
          {step === 4 && <StepLaunch data={data} />}

          {error && (
            <div className="mt-5 px-3.5 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <div className="flex justify-between items-center mt-8 pt-6 border-t border-[#27272a]">
            <button
              type="button"
              onClick={() => { setError(null); setStep(Math.max(0, step - 1)); }}
              disabled={step === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-[#71717a] hover:text-[#a1a1aa] disabled:opacity-0 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
            {step < 4 ? (
              <button
                type="button"
                onClick={() => {
                  const err = canAdvance(step, data);
                  if (err) { setError(err); return; }
                  setError(null);
                  setStep(step + 1);
                }}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 rounded-lg text-sm font-medium text-white transition-all duration-150 shadow-glow"
              >
                Continue
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLaunch}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 rounded-lg text-sm font-medium text-white transition-all duration-150"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 10" />
                    </svg>
                    Launching…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 1.5L9.5 6.5H12.5L10 9.5L11 13L7 11L3 13L4 9.5L1.5 6.5H4.5L7 1.5Z" fill="currentColor" />
                    </svg>
                    Launch
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-[#52525b] mt-6">
          ProspectAI · AI-native outreach platform
        </p>
      </div>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

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

const inputClass =
  "w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3.5 py-2.5 text-sm text-[#fafafa] placeholder-[#3f3f46] focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 transition-all duration-150";

// ─── Step 0: Business ─────────────────────────────────────────────────────────

function StepBusiness({ data, update }: { data: any; update: (p: string, v: unknown) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[#fafafa]">Your Business</h2>
        <p className="text-sm text-[#71717a] mt-1">Tell us about what you sell and who you help.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Workspace Name">
          <input
            className={inputClass}
            placeholder="My Agency"
            value={data.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </Field>
        <Field label="Your Email">
          <input
            className={inputClass}
            type="email"
            placeholder="you@company.com"
            value={data.owner_email}
            onChange={(e) => update("owner_email", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Company Name">
          <input
            className={inputClass}
            placeholder="Acme Inc."
            value={data.business_profile.company_name}
            onChange={(e) => update("business_profile.company_name", e.target.value)}
          />
        </Field>
        <Field label="Website">
          <input
            className={inputClass}
            placeholder="https://acme.com"
            value={data.business_profile.website}
            onChange={(e) => update("business_profile.website", e.target.value)}
          />
        </Field>
      </div>
      <Field label="What you sell" hint="1–2 sentences">
        <textarea
          className={`${inputClass} h-20 resize-none`}
          placeholder="We help SaaS companies book more demos through AI-personalized cold email..."
          value={data.business_profile.product_description}
          onChange={(e) => update("business_profile.product_description", e.target.value)}
        />
      </Field>
      <Field label="Value Prop" hint="We help X achieve Y by Z">
        <input
          className={inputClass}
          placeholder="We help B2B founders get 10+ demos/month by writing emails that feel human"
          value={data.business_profile.value_prop}
          onChange={(e) => update("business_profile.value_prop", e.target.value)}
        />
      </Field>
    </div>
  );
}

// ─── Step 1: ICP ──────────────────────────────────────────────────────────────

function StepICP({ data, update }: { data: any; update: (p: string, v: unknown) => void }) {
  const toggleIndustry = (val: string) => {
    const arr = data.icp_config.industries as string[];
    update("icp_config.industries", arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };
  const toggleSize = (val: string) => {
    const arr = data.icp_config.company_sizes as string[];
    update("icp_config.company_sizes", arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[#fafafa]">Ideal Customer Profile</h2>
        <p className="text-sm text-[#71717a] mt-1">Define who you want to reach.</p>
      </div>

      <Field label="Industries">
        <div className="flex flex-wrap gap-2 mt-1">
          {INDUSTRIES.map(({ value, label }) => {
            const active = data.icp_config.industries.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleIndustry(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border ${
                  active
                    ? "bg-brand-500/15 border-brand-500/50 text-brand-400"
                    : "bg-[#18181b] border-[#27272a] text-[#71717a] hover:border-[#3f3f46] hover:text-[#a1a1aa]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Company Size">
        <div className="flex flex-wrap gap-2 mt-1">
          {SIZES.map((s) => {
            const active = data.icp_config.company_sizes.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSize(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border ${
                  active
                    ? "bg-brand-500/15 border-brand-500/50 text-brand-400"
                    : "bg-[#18181b] border-[#27272a] text-[#71717a] hover:border-[#3f3f46] hover:text-[#a1a1aa]"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Target Titles" hint="one per line">
        <textarea
          className={`${inputClass} h-20 resize-none`}
          placeholder={"Head of Sales\nFounder\nCEO\nVP Sales"}
          value={data.icp_config.titles.join("\n")}
          onChange={(e) => update("icp_config.titles", e.target.value.split("\n"))}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Geographies" hint="comma-separated">
          <input
            className={inputClass}
            placeholder="US, UK, DACH"
            value={data.icp_config.geographies.join(", ")}
            onChange={(e) =>
              update(
                "icp_config.geographies",
                e.target.value.split(",").map((s) => s.trim())
              )
            }
          />
        </Field>
        <Field label="Leads / Day">
          <input
            className={inputClass}
            type="number"
            min={10}
            max={500}
            value={data.daily_lead_target}
            onChange={(e) => update("daily_lead_target", parseInt(e.target.value))}
          />
        </Field>
      </div>
    </div>
  );
}

// ─── Step 2: Tone ─────────────────────────────────────────────────────────────

const TONES = [
  {
    value: "direct",
    label: "Direct",
    desc: "Confident, peer-to-peer. Gets to the point fast.",
    icon: "→",
  },
  {
    value: "friendly",
    label: "Friendly",
    desc: "Warm and conversational. Builds rapport first.",
    icon: "◉",
  },
  {
    value: "professional",
    label: "Professional",
    desc: "Formal, structured. Works well in corporate environments.",
    icon: "◈",
  },
] as const;

function StepTone({ data, update }: { data: any; update: (p: string, v: unknown) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[#fafafa]">Email Tone & Style</h2>
        <p className="text-sm text-[#71717a] mt-1">How should your emails sound?</p>
      </div>
      <div className="space-y-2.5">
        {TONES.map(({ value, label, desc, icon }) => {
          const active = data.tone_config.style === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => update("tone_config.style", value)}
              className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-150 ${
                active
                  ? "border-brand-500/50 bg-brand-500/8"
                  : "border-[#27272a] bg-[#18181b] hover:border-[#3f3f46]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`text-lg w-6 text-center ${active ? "text-brand-400" : "text-[#52525b]"}`}>
                  {icon}
                </span>
                <div>
                  <p className={`text-sm font-medium ${active ? "text-brand-400" : "text-[#a1a1aa]"}`}>
                    {label}
                  </p>
                  <p className="text-xs text-[#71717a] mt-0.5">{desc}</p>
                </div>
                {active && (
                  <div className="ml-auto w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-[#52525b]">
        The system will load the best-performing seed templates for your industry. Refine tone after launch.
      </p>
    </div>
  );
}

// ─── Step 3: Sending ──────────────────────────────────────────────────────────

function StepSending({ data, update }: { data: any; update: (p: string, v: unknown) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[#fafafa]">Connect Instantly</h2>
        <p className="text-sm text-[#71717a] mt-1">Your emails are sent through your Instantly account.</p>
      </div>
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1.5v7M7 11v1.5" stroke="#eab308" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-medium text-[#a1a1aa]">Where to find your credentials</p>
          <p className="text-xs text-[#71717a] mt-0.5">
            Instantly → Settings → Integrations → API Keys. The campaign must already exist in Instantly.
          </p>
        </div>
      </div>
      <Field label="Instantly API Key">
        <input
          className={inputClass}
          type="password"
          placeholder="inst_••••••••••••••••••••"
          value={data.instantly_api_key}
          onChange={(e) => update("instantly_api_key", e.target.value)}
        />
      </Field>
      <Field label="Campaign ID">
        <input
          className={inputClass}
          placeholder="campaign_••••••••••••"
          value={data.instantly_campaign_id}
          onChange={(e) => update("instantly_campaign_id", e.target.value)}
        />
      </Field>
    </div>
  );
}

// ─── Step 4: Launch ───────────────────────────────────────────────────────────

function StepLaunch({ data }: { data: any }) {
  const industries = data.icp_config.industries.join(", ") || "Any industry";
  const sizes = data.icp_config.company_sizes.join(", ") || "Any size";
  const connected = !!data.instantly_api_key;

  const rows = [
    { label: "Workspace", value: data.name || "—" },
    { label: "Targeting", value: `${industries}` },
    { label: "Company sizes", value: `${sizes}` },
    { label: "Daily target", value: `${data.daily_lead_target} leads / day` },
    { label: "Email style", value: data.tone_config.style },
    {
      label: "Sending via",
      value: connected ? "Instantly (connected)" : "No API key — will be inactive",
      status: connected ? "ok" : "warn",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[#fafafa]">Ready to launch</h2>
        <p className="text-sm text-[#71717a] mt-1">Review your setup before going live.</p>
      </div>

      <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`flex justify-between items-center px-4 py-3 text-sm ${
              i < rows.length - 1 ? "border-b border-[#27272a]" : ""
            }`}
          >
            <span className="text-[#71717a]">{row.label}</span>
            <span
              className={`font-medium ${
                row.status === "warn"
                  ? "text-yellow-500"
                  : row.status === "ok"
                  ? "text-emerald-400"
                  : "text-[#fafafa]"
              }`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-brand-500/8 border border-brand-500/20 rounded-xl p-4">
        <p className="text-xs text-[#a1a1aa] leading-relaxed">
          The system will source, research, score, and personalize leads automatically. The nightly
          optimizer will improve prompts based on performance data. Monitor everything from the dashboard.
        </p>
      </div>
    </div>
  );
}

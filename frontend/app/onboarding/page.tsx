"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const STEPS = ["Business", "ICP", "Tone", "Sending", "Launch"];

const INDUSTRIES = ["saas", "ecommerce", "agency", "professional_services", "fintech", "healthtech", "manufacturing", "logistics", "real_estate", "other"];
const SIZES = ["1-10", "10-50", "50-200", "200-500", "500-1000", "1000+"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    name: "",
    owner_email: "",
    business_profile: {
      company_name: "", website: "", product_description: "", value_prop: "",
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
  });

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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
      <div className="w-full max-w-xl">
        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1 rounded-full ${i <= step ? "bg-brand-500" : "bg-gray-800"}`} />
              <p className={`text-xs mt-1 ${i === step ? "text-brand-500" : "text-gray-600"}`}>{s}</p>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          {step === 0 && (
            <StepBusiness data={data} update={update} />
          )}
          {step === 1 && (
            <StepICP data={data} update={update} />
          )}
          {step === 2 && (
            <StepTone data={data} update={update} />
          )}
          {step === 3 && (
            <StepSending data={data} update={update} />
          )}
          {step === 4 && (
            <StepLaunch data={data} />
          )}

          <div className="flex justify-between mt-8">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-0 transition-colors"
            >
              ← Back
            </button>
            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="px-5 py-2 bg-brand-600 hover:bg-brand-700 rounded-lg text-sm font-medium transition-colors"
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleLaunch}
                disabled={loading}
                className="px-5 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? "Creating…" : "🚀 Launch"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500";

function StepBusiness({ data, update }: any) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white mb-4">Your Business</h2>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Workspace Name">
          <input className={inputClass} placeholder="My Agency" value={data.name} onChange={(e) => update("name", e.target.value)} />
        </Field>
        <Field label="Your Email">
          <input className={inputClass} type="email" placeholder="you@company.com" value={data.owner_email} onChange={(e) => update("owner_email", e.target.value)} />
        </Field>
      </div>
      <Field label="Company Name">
        <input className={inputClass} placeholder="Acme Inc." value={data.business_profile.company_name} onChange={(e) => update("business_profile.company_name", e.target.value)} />
      </Field>
      <Field label="Website">
        <input className={inputClass} placeholder="https://acme.com" value={data.business_profile.website} onChange={(e) => update("business_profile.website", e.target.value)} />
      </Field>
      <Field label="What you sell (1-2 sentences)">
        <textarea className={`${inputClass} h-20 resize-none`} placeholder="We help SaaS companies book more demos through AI-personalized cold email..." value={data.business_profile.product_description} onChange={(e) => update("business_profile.product_description", e.target.value)} />
      </Field>
      <Field label="Value Prop ('We help X achieve Y by Z')">
        <input className={inputClass} placeholder="We help B2B founders get 10+ demos/month by writing emails that feel human" value={data.business_profile.value_prop} onChange={(e) => update("business_profile.value_prop", e.target.value)} />
      </Field>
    </div>
  );
}

function StepICP({ data, update }: any) {
  const toggle = (field: string, val: string) => {
    const arr = data.icp_config[field] as string[];
    update(`icp_config.${field}`, arr.includes(val) ? arr.filter((v: string) => v !== val) : [...arr, val]);
  };
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-white mb-4">Ideal Customer Profile</h2>
      <Field label="Industries (select all that apply)">
        <div className="flex flex-wrap gap-2 mt-1">
          {INDUSTRIES.map((i) => (
            <button key={i} onClick={() => toggle("industries", i)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${data.icp_config.industries.includes(i) ? "bg-brand-500 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
              {i}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Company Sizes">
        <div className="flex flex-wrap gap-2 mt-1">
          {SIZES.map((s) => (
            <button key={s} onClick={() => toggle("company_sizes", s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${data.icp_config.company_sizes.includes(s) ? "bg-brand-500 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
              {s}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Target Titles (one per line)">
        <textarea className={`${inputClass} h-20 resize-none`}
          placeholder={"Head of Sales\nFounder\nCEO\nVP Sales"}
          value={data.icp_config.titles.join("\n")}
          onChange={(e) => update("icp_config.titles", e.target.value.split("\n"))} />
      </Field>
      <Field label="Target Geographies (comma-separated)">
        <input className={inputClass} placeholder="US, UK, DACH" value={data.icp_config.geographies.join(", ")}
          onChange={(e) => update("icp_config.geographies", e.target.value.split(",").map((s: string) => s.trim()))} />
      </Field>
      <Field label="Daily Lead Target">
        <input className={inputClass} type="number" min={10} max={500} value={data.daily_lead_target}
          onChange={(e) => update("daily_lead_target", parseInt(e.target.value))} />
      </Field>
    </div>
  );
}

function StepTone({ data, update }: any) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-white mb-4">Email Tone & Style</h2>
      <Field label="Writing Style">
        <div className="space-y-2 mt-1">
          {(["direct", "friendly", "professional"] as const).map((style) => (
            <button key={style} onClick={() => update("tone_config.style", style)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm border transition-colors ${data.tone_config.style === style ? "border-brand-500 bg-brand-500/10 text-brand-400" : "border-gray-700 bg-gray-800 text-gray-400 hover:text-white"}`}>
              <span className="font-medium capitalize">{style}</span>
              <p className="text-xs opacity-70 mt-0.5">
                {style === "direct" && "Confident, peer-to-peer. Gets to the point fast."}
                {style === "friendly" && "Warm and conversational. Builds rapport first."}
                {style === "professional" && "Formal, structured. Works well in corporate environments."}
              </p>
            </button>
          ))}
        </div>
      </Field>
      <p className="text-xs text-gray-500">
        The system will load the best-performing seed templates for your industry. You can refine tone further after launch.
      </p>
    </div>
  );
}

function StepSending({ data, update }: any) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white mb-4">Connect Instantly</h2>
      <p className="text-sm text-gray-400">Your emails are sent through your existing Instantly account.</p>
      <Field label="Instantly API Key">
        <input className={inputClass} type="password" placeholder="inst_..." value={data.instantly_api_key}
          onChange={(e) => update("instantly_api_key", e.target.value)} />
      </Field>
      <Field label="Campaign ID">
        <input className={inputClass} placeholder="campaign_..." value={data.instantly_campaign_id}
          onChange={(e) => update("instantly_campaign_id", e.target.value)} />
      </Field>
      <p className="text-xs text-gray-500">
        Find your API key in Instantly → Settings → Integrations. The campaign must already exist in Instantly.
      </p>
    </div>
  );
}

function StepLaunch({ data }: any) {
  const industries = data.icp_config.industries.join(", ") || "any";
  const sizes = data.icp_config.company_sizes.join(", ") || "any";
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-white mb-2">Ready to Launch</h2>
      <div className="bg-gray-800 rounded-xl p-4 space-y-3 text-sm">
        <Row label="Workspace" value={data.name} />
        <Row label="Targeting" value={`${industries} · ${sizes}`} />
        <Row label="Daily target" value={`${data.daily_lead_target} leads/day`} />
        <Row label="Email style" value={data.tone_config.style} />
        <Row label="Sending via" value={data.instantly_api_key ? "Instantly (connected)" : "⚠ No API key"} />
      </div>
      <p className="text-xs text-gray-500">
        The system will source, research, score, and personalize leads automatically. The nightly optimizer
        will improve prompts based on performance. You can monitor everything from the dashboard.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

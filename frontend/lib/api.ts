const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json();
}

export const api = {
  // Workspaces
  getWorkspaces: () => request<Workspace[]>("/workspaces"),
  getWorkspace: (id: string) => request<Workspace>(`/workspaces/${id}`),
  createWorkspace: (data: Partial<Workspace>) =>
    request<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(data) }),
  updateWorkspace: (id: string, data: Partial<Workspace>) =>
    request<Workspace>(`/workspaces/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Campaigns
  runPipeline: (workspaceId: string) =>
    request(`/campaigns/${workspaceId}/run-pipeline`, { method: "POST" }),
  getPipelineStatus: (workspaceId: string) =>
    request<PipelineStatus>(`/campaigns/${workspaceId}/pipeline-status`),

  // Leads
  getLeads: (workspaceId: string, params?: { status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<Lead[]>(`/leads/${workspaceId}?${qs}`);
  },
  getPipelineCounts: (workspaceId: string) =>
    request<Record<string, number>>(`/leads/${workspaceId}/pipeline/counts`),

  // Performance
  getPerformanceSummary: (workspaceId: string, days = 7) =>
    request<PerformanceSummary>(`/performance/${workspaceId}/summary?days=${days}`),

  // Optimizer
  getOptimizationRuns: (workspaceId: string) =>
    request<OptimizationRun[]>(`/optimizer/${workspaceId}/runs`),
  triggerOptimization: (workspaceId: string) =>
    request(`/optimizer/${workspaceId}/run`, { method: "POST" }),
  getPrompts: (workspaceId: string) =>
    request<PromptTemplate[]>(`/optimizer/${workspaceId}/prompts`),

  // Instantly
  listInstantlyCampaigns: (apiKey: string) =>
    request<{ id: string; name: string }[]>("/workspaces/instantly/campaigns", {
      method: "POST",
      body: JSON.stringify({ api_key: apiKey }),
    }),

  // CSV Import
  csvPreview: async (workspaceId: string, file: File): Promise<CsvPreview> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/leads/${workspaceId}/csv-preview`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
  },
  importCsv: async (workspaceId: string, file: File, mapping: Record<string, string>): Promise<CsvImportResult> => {
    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    const res = await fetch(`${BASE}/leads/${workspaceId}/import-csv`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json();
  },

  // Mock endpoints
  getMockLeads: (status?: string) => {
    const qs = status ? `?status=${status}` : "";
    return request<MockLead[]>(`/mock/leads${qs}`);
  },
  getMockPipelineCounts: () => request<Record<string, number>>("/mock/pipeline/counts"),
  getMockVariants: () => request<CccVariant[]>("/mock/variants"),
  getMockExplorerSuggestion: () => request<ExplorerSuggestion>("/mock/explorer-suggestion"),
  getMockSettings: () => request<MockSettings>("/mock/settings"),
  updateMockSettings: (data: Partial<MockSettings>) =>
    request<MockSettings>("/mock/settings", { method: "PATCH", body: JSON.stringify(data) }),
};

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  owner_email: string;
  business_profile: Record<string, string>;
  icp_config: Record<string, unknown>;
  instantly_api_key?: string;
  instantly_campaign_id?: string;
  status: string;
  daily_lead_target: number;
  min_score_threshold: number;
  created_at: string;
}

export interface PipelineStatus {
  workspace_status: string;
  daily_lead_target: number;
  pipeline_counts: Record<string, number>;
  emails_last_24h: number;
}

export interface Lead {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  industry: string;
  status: string;
  total_score: number | null;
  created_at: string;
}

export interface MockLead extends Lead {
  variant_type: string | null;
  interest_status: number;
  updated_at: string;
}

export interface PerformanceSummary {
  summary: {
    total_sent: number;
    positive_replies: number;
    negative_replies: number;
    bounced: number;
    positive_rate_pct: number;
  };
  ab_breakdown: Array<{
    variant_type: string;
    sent: number;
    positive: number;
    negative: number;
    positive_rate: number;
  }>;
}

export interface CccVariant {
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

export interface ExplorerSuggestion {
  analysis: string;
  new_prompt: string;
  generated_at: string;
}

export interface MockSettings {
  workspace_id: string;
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

export interface OptimizationRun {
  id: string;
  run_type: string;
  period_start: string;
  period_end: string;
  emails_analyzed: number;
  changes_made: Record<string, unknown>;
  claude_reasoning: string;
  confidence: number;
  status: string;
  ran_at: string;
}

export interface PromptTemplate {
  id: string;
  template_type: string;
  version: number;
  is_active: boolean;
  performance_score: number | null;
  created_by: string;
  content_preview: string;
  created_at: string;
}

export interface CsvPreview {
  headers: string[];
  preview: Record<string, string>[];
  auto_mapping: Record<string, string>;
  importable_fields: string[];
}

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

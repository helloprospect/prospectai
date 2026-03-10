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
  getWorkspaceStats: (id: string) => request<WorkspaceStats>(`/workspaces/${id}/stats`),

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
  approveOptimization: (workspaceId: string, runId: string) =>
    request(`/optimizer/${workspaceId}/runs/${runId}/approve`, { method: "POST" }),
  getPrompts: (workspaceId: string) =>
    request<PromptTemplate[]>(`/optimizer/${workspaceId}/prompts`),

  // Reddit
  getRedditStats: (workspaceId: string) =>
    request<RedditStats>(`/reddit/${workspaceId}/stats`),
  getRedditActions: (workspaceId: string) =>
    request<RedditAction[]>(`/reddit/${workspaceId}/actions`),
};

// Types
export interface Workspace {
  id: string;
  name: string;
  owner_email: string;
  business_profile: Record<string, unknown>;
  icp_config: Record<string, unknown>;
  status: string;
  daily_lead_target: number;
  min_score_threshold: number;
  created_at: string;
}

export interface WorkspaceStats {
  leads_by_status: Record<string, number>;
  emails_sent: number;
  replies: number;
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

export interface PerformanceSummary {
  summary: {
    total_sent: number;
    opened: number;
    replied: number;
    positive_replies: number;
    bounced: number;
    open_rate_pct: number;
    reply_rate_pct: number;
  };
  ab_breakdown: Array<{
    body_variant: string;
    subject_variant: string;
    sent: number;
    opened: number;
    replied: number;
  }>;
  daily: Array<{ day: string; sent: number; replied: number }>;
}

export interface OptimizationRun {
  id: string;
  run_type: string;
  period_start: string;
  period_end: string;
  emails_analyzed: number;
  avg_open_rate: number;
  avg_reply_rate: number;
  benchmark_reply_rate: number;
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

export interface RedditStats {
  comments: number;
  dms: number;
  total_processed: number;
  warm_leads_found: number;
}

export interface RedditAction {
  id: string;
  action_type: string;
  content: string;
  reddit_author: string;
  subreddit: string;
  post_title: string;
  performed_at: string;
}

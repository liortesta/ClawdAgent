const BASE_URL = '/api';

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    // Auto-logout on 401 (expired/invalid token after server restart)
    if (response.status === 401 && !path.startsWith('/auth/')) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      throw new Error('Session expired');
    }
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }

  return response.json();
}

// File upload helper (multipart/form-data — no Content-Type header, browser sets it)
export async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const token = localStorage.getItem('token');
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      throw new Error('Session expired');
    }
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Auth
  login: (username: string, password: string) => apiRequest<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (username: string, password: string) => apiRequest<{ token: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),

  // Chat
  chat: (text: string, conversationId?: string, responseMode?: string, model?: string) => apiRequest<{ message: string; thinking?: string; agent: string; provider?: string; model?: string; tokens?: { input: number; output: number }; elapsed?: number }>('/chat', { method: 'POST', body: JSON.stringify({ text, conversationId, responseMode, model }) }),
  chatWithFile: (text: string, file: File, conversationId?: string, responseMode?: string, model?: string) => {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('file', file);
    if (conversationId) formData.append('conversationId', conversationId);
    if (responseMode) formData.append('responseMode', responseMode);
    if (model) formData.append('model', model);
    return uploadRequest<{ message: string; thinking?: string; agent: string; provider?: string; model?: string; tokens?: { input: number; output: number }; elapsed?: number }>('/chat', formData);
  },
  status: () => apiRequest<{ status: string; uptime: number; memory: number }>('/status'),

  // Settings
  getSettings: () => apiRequest<any>('/settings'),
  updateSettings: (data: any) => apiRequest<any>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  testKey: (provider: string, key: string) => apiRequest<{ valid: boolean; message: string; provider: string }>('/settings/test-key', { method: 'POST', body: JSON.stringify({ provider, key }) }),

  // Skills
  getSkills: () => apiRequest<any[]>('/skills'),
  createSkill: (data: any) => apiRequest<any>('/skills', { method: 'POST', body: JSON.stringify(data) }),
  updateSkill: (id: string, data: any) => apiRequest<any>(`/skills/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSkill: (id: string) => apiRequest<any>(`/skills/${id}`, { method: 'DELETE' }),

  // Servers
  getServers: () => apiRequest<any[]>('/servers'),
  addServer: (data: any) => apiRequest<any>('/servers', { method: 'POST', body: JSON.stringify(data) }),
  removeServer: (id: string) => apiRequest<any>(`/servers/${id}`, { method: 'DELETE' }),
  execOnServer: (id: string, command: string) => apiRequest<any>(`/servers/${id}/exec`, { method: 'POST', body: JSON.stringify({ command }) }),
  serverHealth: (id: string) => apiRequest<any>(`/servers/${id}/health`),

  // Logs
  getLogs: (params?: { level?: string; limit?: number; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.level) qs.set('level', params.level);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    return apiRequest<any>(`/logs?${qs.toString()}`);
  },

  // Costs
  getCostsToday: () => apiRequest<any>('/costs/today'),
  getCostsHistory: () => apiRequest<any>('/costs/history'),
  getCostsBreakdown: () => apiRequest<any>('/costs/breakdown'),

  // Cron
  getCronTasks: () => apiRequest<any[]>('/cron'),
  createCronTask: (data: any) => apiRequest<any>('/cron', { method: 'POST', body: JSON.stringify(data) }),
  deleteCronTask: (id: string) => apiRequest<any>(`/cron/${id}`, { method: 'DELETE' }),
  toggleCronTask: (id: string) => apiRequest<any>(`/cron/${id}/toggle`, { method: 'POST' }),

  // Conversations / History
  getConversations: (params?: { platform?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.platform) qs.set('platform', params.platform);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    return apiRequest<{ conversations: Array<{ id: string; title: string | null; platform: string; messageCount: number; lastMessage: { content: string; role: string; createdAt: string } | null; createdAt: string; updatedAt: string }> }>(`/history?${qs.toString()}`);
  },
  getConversation: (id: string) => apiRequest<{ id: string; messages: Array<{ id: string; role: string; content: string; agent?: string; createdAt: string }> }>(`/history/${id}`),
  createConversationOnServer: (conversationId: string, title?: string) => apiRequest<{ id: string; ok: boolean }>('/history', { method: 'POST', body: JSON.stringify({ conversationId, title }) }),
  renameConversationOnServer: (id: string, title: string) => apiRequest<{ ok: boolean }>(`/history/${id}`, { method: 'PUT', body: JSON.stringify({ title }) }),
  deleteConversationOnServer: (id: string) => apiRequest<{ ok: boolean }>(`/history/${id}`, { method: 'DELETE' }),
  // Legacy alias
  getHistory: (params?: { platform?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.platform) qs.set('platform', params.platform);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    return apiRequest<any>(`/history?${qs.toString()}`);
  },

  // RAG (Knowledge Base)
  ragUpload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return uploadRequest<{ success: boolean; source: string; type: string; chunks: number }>('/rag/upload', formData);
  },
  ragIngestUrl: (url: string) => apiRequest<{ success: boolean; source: string; chunks: number }>('/rag/ingest-url', { method: 'POST', body: JSON.stringify({ url }) }),
  ragQuery: (question: string, topK?: number) => apiRequest<{ question: string; answer: string; documentsSearched: number }>('/rag/query', { method: 'POST', body: JSON.stringify({ question, topK }) }),
  ragDocuments: () => apiRequest<{ documents: string[]; totalChunks: number }>('/rag/documents'),
  ragDeleteDocument: (source: string) => apiRequest<{ success: boolean }>(`/rag/documents/${encodeURIComponent(source)}`, { method: 'DELETE' }),
  ragStats: () => apiRequest<{ documents: number; chunks: number }>('/rag/stats'),

  // Dashboard
  dashboardStatus: () => apiRequest<any>('/dashboard/status'),
  dashboardCosts: () => apiRequest<any>('/dashboard/costs'),
  dashboardCron: () => apiRequest<any>('/dashboard/cron'),
  dashboardActivity: () => apiRequest<any[]>('/dashboard/activity'),
  graphData: () => apiRequest<any>('/dashboard/graph'),
  dashboardHeatmap: () => apiRequest<{ grid: number[][]; period: string }>('/dashboard/heatmap'),
  dashboardKanban: () => apiRequest<{ columns: Record<string, any[]>; total: number }>('/dashboard/kanban'),
  dashboardApprovals: () => apiRequest<{ pending: any[]; stats: { pending: number; approvedToday: number; deniedToday: number } }>('/dashboard/approvals'),
  approveAction: (id: string) => apiRequest<{ ok: boolean }>(`/dashboard/approvals/${id}/approve`, { method: 'POST' }),
  denyAction: (id: string) => apiRequest<{ ok: boolean }>(`/dashboard/approvals/${id}/deny`, { method: 'POST' }),

  // Claude CLI
  cliStatus: () => apiRequest<{ available: boolean; authenticated: boolean; cliPath: string; lastCheckAt: number }>('/cli/status'),
  cliAuth: () => apiRequest<{ ok: boolean; authUrl: string | null; message: string }>('/cli/auth', { method: 'POST' }),
  cliRecheck: () => apiRequest<{ available: boolean; authenticated: boolean; cliPath: string; lastCheckAt: number }>('/cli/recheck', { method: 'POST' }),

  // WhatsApp
  whatsappQR: () => apiRequest<{ qr: string | null; qrDataUrl: string | null; status: string }>('/whatsapp/qr'),
  whatsappStatus: () => apiRequest<{ status: string }>('/whatsapp/status'),

  // Models
  getModels: () => apiRequest<{ models: Array<{ id: string; name: string; provider: string; tier: string; supportsHebrew?: boolean; supportsVision?: boolean }> }>('/models'),

  // OpenClaw (direct chat)
  openclawChat: (text: string) => apiRequest<{ message: string; success: boolean }>('/openclaw/chat', { method: 'POST', body: JSON.stringify({ text }) }),
  openclawStatus: () => apiRequest<{ status: string; connected: boolean; data?: any }>('/openclaw/status'),

  // Evolution
  evolutionStatus: () => apiRequest<any>('/evolution/status'),
  evolutionModels: (params?: { provider?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.provider) qs.set('provider', params.provider);
    if (params?.limit) qs.set('limit', String(params.limit));
    return apiRequest<any>(`/evolution/models?${qs.toString()}`);
  },
  evolutionDiscovered: (limit?: number) => apiRequest<any>(`/evolution/discovered?limit=${limit || 50}`),
  evolutionTrigger: (full?: boolean) => apiRequest<any>('/evolution/trigger', { method: 'POST', body: JSON.stringify({ full: !!full }) }),
  evolutionScanModels: () => apiRequest<any>('/evolution/scan-models', { method: 'POST' }),
  evolutionScanEcosystem: () => apiRequest<any>('/evolution/scan-ecosystem', { method: 'POST' }),

  // Browser View
  browserSessions: () => apiRequest<{ sessions: any[] }>('/browser/sessions'),
  browserCreateSession: (url?: string, withVnc = true) => apiRequest<any>('/browser/sessions', { method: 'POST', body: JSON.stringify({ url, withVnc }) }),
  browserCloseSession: (id: string) => apiRequest<{ ok: boolean }>(`/browser/sessions/${id}`, { method: 'DELETE' }),
  browserNavigate: (id: string, url: string) => apiRequest<{ ok: boolean; url?: string; title?: string }>(`/browser/sessions/${id}/navigate`, { method: 'POST', body: JSON.stringify({ url }) }),
  browserAttachVnc: (id: string) => apiRequest<{ ok: boolean; wsPort: number; display: number }>(`/browser/sessions/${id}/attach-vnc`, { method: 'POST' }),
  browserDetachVnc: (id: string) => apiRequest<{ ok: boolean }>(`/browser/sessions/${id}/detach-vnc`, { method: 'POST' }),
  browserVncKeepalive: (id: string) => apiRequest<{ ok: boolean }>(`/browser/sessions/${id}/vnc-keepalive`, { method: 'POST' }),
  browserAiAction: (id: string, instruction: string) => apiRequest<{ result: string; url?: string; title?: string }>(`/browser/sessions/${id}/ai-action`, { method: 'POST', body: JSON.stringify({ instruction }) }),
  browserSnapshot: (id: string) => apiRequest<{ snapshot: any; url: string; title: string }>(`/browser/sessions/${id}/snapshot`),
  browserClick: (id: string, selector: string) => apiRequest<{ ok: boolean; url: string; title: string }>(`/browser/sessions/${id}/click`, { method: 'POST', body: JSON.stringify({ selector }) }),
  browserType: (id: string, selector: string, text: string, submit?: boolean) => apiRequest<{ ok: boolean }>(`/browser/sessions/${id}/type`, { method: 'POST', body: JSON.stringify({ selector, text, submit }) }),
  browserEvaluate: (id: string, script: string) => apiRequest<{ ok: boolean; result: any }>(`/browser/sessions/${id}/evaluate`, { method: 'POST', body: JSON.stringify({ script }) }),
  browserScreenshot: (id: string) => `/api/browser/sessions/${id}/screenshot`,
  browserResources: () => apiRequest<any>('/browser/resources'),

  // Facebook Accounts
  facebookAccounts: () => apiRequest<{ accounts: any[] }>('/facebook/accounts'),
  facebookAddAccount: (name: string, cookies: string) => apiRequest<any>('/facebook/accounts', { method: 'POST', body: JSON.stringify({ name, cookies }) }),
  facebookDeleteAccount: (id: string) => apiRequest<{ ok: boolean }>(`/facebook/accounts/${id}`, { method: 'DELETE' }),
  facebookUpdateCookies: (id: string, cookies: string) => apiRequest<any>(`/facebook/accounts/${id}/cookies`, { method: 'PUT', body: JSON.stringify({ cookies }) }),
  facebookVerify: (id: string) => apiRequest<{ success: boolean; sessionId: string; profileName?: string; error?: string }>(`/facebook/accounts/${id}/verify`, { method: 'POST' }),
  facebookLaunch: (id: string, withVnc = true) => apiRequest<{ sessionId: string; url: string }>(`/facebook/accounts/${id}/launch`, { method: 'POST', body: JSON.stringify({ withVnc }) }),
  facebookParsePreview: (cookies: string) => apiRequest<{ valid: boolean; format: string; cookieCount: number; cookieNames: string[]; userId?: string; missing: string[]; warnings: string[]; error?: string }>('/facebook/parse-preview', { method: 'POST', body: JSON.stringify({ cookies }) }),

  // Facebook Agent (Autonomous)
  fbAgentList: () => apiRequest<{ agents: any[] }>('/facebook-agent/agents'),
  fbAgentStatus: (accountId: string) => apiRequest<any>(`/facebook-agent/agents/${accountId}`),
  fbAgentStart: (accountId: string, config?: any) => apiRequest<{ ok: boolean; status: any }>('/facebook-agent/agents', { method: 'POST', body: JSON.stringify({ accountId, config }) }),
  fbAgentStop: (accountId: string) => apiRequest<{ ok: boolean }>(`/facebook-agent/agents/${accountId}/stop`, { method: 'POST' }),
  fbAgentPause: (accountId: string) => apiRequest<{ ok: boolean; status: any }>(`/facebook-agent/agents/${accountId}/pause`, { method: 'POST' }),
  fbAgentResume: (accountId: string) => apiRequest<{ ok: boolean; status: any }>(`/facebook-agent/agents/${accountId}/resume`, { method: 'POST' }),
  fbAgentConfig: (accountId: string) => apiRequest<any>(`/facebook-agent/agents/${accountId}/config`),
  fbAgentUpdateConfig: (accountId: string, config: any) => apiRequest<{ ok: boolean; config: any }>(`/facebook-agent/agents/${accountId}/config`, { method: 'PUT', body: JSON.stringify(config) }),
  fbAgentLogs: (accountId: string, limit?: number) => apiRequest<{ logs: any[] }>(`/facebook-agent/agents/${accountId}/logs?limit=${limit || 50}`),

  // Generic helpers
  get: <T = any>(path: string) => apiRequest<T>(path),
  post: <T = any>(path: string, body?: any) => apiRequest<T>(path, { method: 'POST', body: body != null ? JSON.stringify(body) : undefined }),
};

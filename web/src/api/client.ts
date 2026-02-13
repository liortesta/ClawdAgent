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
  chat: (text: string) => apiRequest<{ message: string; thinking?: string; agent: string; provider?: string }>('/chat', { method: 'POST', body: JSON.stringify({ text }) }),
  chatWithFile: (text: string, file: File) => {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('file', file);
    return uploadRequest<{ message: string; thinking?: string; agent: string; provider?: string }>('/chat', formData);
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

  // History
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

  // Generic GET
  get: <T = any>(path: string) => apiRequest<T>(path),
};

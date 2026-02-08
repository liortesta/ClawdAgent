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
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  chat: (text: string) => apiRequest<{ message: string; agent: string }>('/chat', { method: 'POST', body: JSON.stringify({ text }) }),
  status: () => apiRequest<{ status: string; uptime: number }>('/status'),
  login: (username: string, password: string) => apiRequest<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (username: string, password: string) => apiRequest<{ token: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
};

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/auth';
import {
  Plus, Trash2, Loader2, AlertTriangle, X, CheckCircle,
  XCircle, Clock, ShieldAlert, RefreshCw, ExternalLink, Eye, EyeOff,
  Play, Square, Pause, ScrollText, Bot, Zap
} from 'lucide-react';

interface LinkedInAccount {
  id: string;
  name: string;
  profileUrl?: string;
  userId?: string;
  cookieCount: number;
  cookieFormat: string;
  status: 'untested' | 'active' | 'failed' | 'restricted';
  profileName?: string;
  lastVerified?: string;
  lastError?: string;
  createdAt: string;
}

interface ParsePreview {
  valid: boolean;
  format: string;
  cookieCount: number;
  cookieNames: string[];
  userId?: string;
  missing: string[];
  warnings: string[];
  error?: string;
}

interface AgentStatus {
  accountId: string;
  state: 'stopped' | 'running' | 'paused' | 'error';
  sessionId: string | null;
  currentAction: string | null;
  stats: {
    posts: number; comments: number; likes: number;
    connections: number; articles: number;
    errors: number; totalActions: number; actionsThisHour: number;
    lastActionAt: string | null;
  };
  lastError: string | null;
  startedAt: string | null;
}

interface AgentLog {
  timestamp: string;
  action: string;
  status: 'success' | 'error' | 'skipped' | 'info';
  message: string;
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  active: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', label: 'Active' },
  untested: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', label: 'Untested' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', label: 'Failed' },
  restricted: { icon: ShieldAlert, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', label: 'Restricted' },
};

const AGENT_STATE_COLORS: Record<string, string> = {
  running: 'text-green-400',
  paused: 'text-yellow-400',
  error: 'text-red-400',
  stopped: 'text-gray-500',
};

const ACTION_LABELS: Record<string, string> = {
  post: 'Posts', comment: 'Comments', like: 'Likes',
  connect: 'Connections', article: 'Articles',
};

export default function LinkedInTab() {
  const token = useAuthStore(s => s.token);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const [accounts, setAccounts] = useState<LinkedInAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add account dialog
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCookies, setAddCookies] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [preview, setPreview] = useState<ParsePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [showCookies, setShowCookies] = useState(false);

  // Verify/launch
  const [verifying, setVerifying] = useState<string | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ id: string; success: boolean; error?: string; profileName?: string } | null>(null);

  // Agent state
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({});
  const [agentLogs, setAgentLogs] = useState<Record<string, AgentLog[]>>({});
  const [showAgentPanel, setShowAgentPanel] = useState<string | null>(null);
  const [showAgentConfig, setShowAgentConfig] = useState<string | null>(null);
  const [startingAgent, setStartingAgent] = useState<string | null>(null);
  const [stoppingAgent, setStoppingAgent] = useState<string | null>(null);

  // Agent config form
  const [cfgActions, setCfgActions] = useState<string[]>(['post', 'comment']);
  const [cfgLanguage, setCfgLanguage] = useState('English');
  const [cfgTone, setCfgTone] = useState('professional and insightful');
  const [cfgTestMode, setCfgTestMode] = useState(false);
  const [cfgTopics, setCfgTopics] = useState('');
  const [cfgIndustry, setCfgIndustry] = useState('Technology');
  const [cfgTargetAccounts, setCfgTargetAccounts] = useState('');

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/linkedin/accounts', { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAccounts(data.accounts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchAgentStatuses = useCallback(async () => {
    try {
      const res = await fetch('/api/linkedin-agent/agents', { headers });
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, AgentStatus> = {};
      for (const agent of data.agents) {
        map[agent.accountId] = agent;
      }
      setAgentStatuses(map);
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => {
    fetchAccounts();
    fetchAgentStatuses();
    const interval = setInterval(fetchAgentStatuses, 5000);
    return () => clearInterval(interval);
  }, [fetchAccounts, fetchAgentStatuses]);

  const handlePreview = async () => {
    if (!addCookies.trim()) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await fetch('/api/linkedin/parse-preview', { method: 'POST', headers, body: JSON.stringify({ cookies: addCookies.trim() }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPreview(data);
    } catch (err: any) {
      setPreview({ valid: false, error: err.message, format: 'unknown', cookieCount: 0, cookieNames: [], missing: [], warnings: [] });
    } finally {
      setPreviewing(false);
    }
  };

  const handleAddAccount = async () => {
    if (!addName.trim() || !addCookies.trim()) return;
    setAddSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/linkedin/accounts', { method: 'POST', headers, body: JSON.stringify({ name: addName.trim(), cookies: addCookies.trim() }) });
      if (!res.ok) { const e = await res.json().catch(() => ({ error: 'Failed' })); throw new Error(e.error ?? `HTTP ${res.status}`); }
      setShowAdd(false);
      setAddName('');
      setAddCookies('');
      setPreview(null);
      fetchAccounts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/linkedin/accounts/${id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAccounts(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifying(id);
    setVerifyResult(null);
    try {
      const res = await fetch(`/api/linkedin/accounts/${id}/verify`, { method: 'POST', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setVerifyResult({ id, success: data.success, error: data.error, profileName: data.profileName });
      fetchAccounts();
    } catch (err: any) {
      setVerifyResult({ id, success: false, error: err.message });
    } finally {
      setVerifying(null);
    }
  };

  const handleLaunch = async (id: string) => {
    setLaunching(id);
    setError(null);
    try {
      const res = await fetch(`/api/linkedin/accounts/${id}/launch`, { method: 'POST', headers, body: JSON.stringify({ withVnc: true }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if ((window as any).__switchToBrowserTab) {
        (window as any).__switchToBrowserTab(data.sessionId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLaunching(null);
    }
  };

  // ── Agent Controls ──────────────────────────────────────────────

  const handleStartAgent = async (accountId: string) => {
    setStartingAgent(accountId);
    setError(null);
    try {
      const config: any = {
        actions: cfgActions,
        content: {
          tone: cfgTone,
          language: cfgLanguage,
          topics: cfgTopics.split(',').map(t => t.trim()).filter(Boolean),
          industry: cfgIndustry,
          maxLength: 1300,
        },
        targetAccounts: cfgTargetAccounts.split(',').map(a => a.trim()).filter(Boolean),
        testMode: cfgTestMode,
      };
      const res = await fetch('/api/linkedin-agent/agents', { method: 'POST', headers, body: JSON.stringify({ accountId, config }) });
      if (!res.ok) { const e = await res.json().catch(() => ({ error: 'Failed' })); throw new Error(e.error ?? `HTTP ${res.status}`); }
      setShowAgentConfig(null);
      fetchAgentStatuses();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStartingAgent(null);
    }
  };

  const handleStopAgent = async (accountId: string) => {
    setStoppingAgent(accountId);
    try {
      await fetch(`/api/linkedin-agent/agents/${accountId}/stop`, { method: 'POST', headers });
      fetchAgentStatuses();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStoppingAgent(null);
    }
  };

  const handlePauseAgent = async (accountId: string) => {
    try {
      await fetch(`/api/linkedin-agent/agents/${accountId}/pause`, { method: 'POST', headers });
      fetchAgentStatuses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResumeAgent = async (accountId: string) => {
    try {
      await fetch(`/api/linkedin-agent/agents/${accountId}/resume`, { method: 'POST', headers });
      fetchAgentStatuses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleShowLogs = async (accountId: string) => {
    setShowAgentPanel(showAgentPanel === accountId ? null : accountId);
    try {
      const res = await fetch(`/api/linkedin-agent/agents/${accountId}/logs?limit=50`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setAgentLogs(prev => ({ ...prev, [accountId]: data.logs }));
    } catch { /* */ }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/50">
        <div>
          <h2 className="text-lg font-bold text-white">LinkedIn Accounts</h2>
          <p className="text-xs text-gray-500">Manage accounts and run autonomous AI agents</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { fetchAccounts(); fetchAgentStatuses(); }} className="p-2 text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300 flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Verify result toast */}
      {verifyResult && (
        <div className={`mx-6 mt-3 flex items-center gap-2 px-4 py-2 rounded-lg border ${
          verifyResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
        }`}>
          {verifyResult.success
            ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
            : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          }
          <span className={`text-sm flex-1 ${verifyResult.success ? 'text-green-300' : 'text-red-300'}`}>
            {verifyResult.success
              ? `Login verified${verifyResult.profileName ? ` — ${verifyResult.profileName}` : ''}`
              : `Verification failed: ${verifyResult.error}`
            }
          </span>
          <button onClick={() => setVerifyResult(null)} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Accounts list */}
      <div className="flex-1 overflow-y-auto p-6">
        {accounts.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-700/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-400 mb-2">No LinkedIn Accounts</h3>
            <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
              Add a LinkedIn account by pasting cookies from Cookie Editor or plain cookie string.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-700 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add First Account
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {accounts.map(account => {
              const status = STATUS_CONFIG[account.status] || STATUS_CONFIG.untested;
              const StatusIcon = status.icon;
              const agentStatus = agentStatuses[account.id];
              const isAgentRunning = agentStatus && (agentStatus.state === 'running' || agentStatus.state === 'paused');

              return (
                <div key={account.id} className="bg-dark-800/50 border border-gray-700/50 rounded-lg">
                  {/* Account row */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-700/10 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{account.name}</span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${status.bg}`}>
                              <StatusIcon className={`w-3 h-3 ${status.color}`} />
                              <span className={status.color}>{status.label}</span>
                            </span>
                            {isAgentRunning && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border bg-purple-500/10 border-purple-500/30`}>
                                <Bot className="w-3 h-3 text-purple-400" />
                                <span className={AGENT_STATE_COLORS[agentStatus.state]}>
                                  Agent {agentStatus.state === 'paused' ? 'Paused' : 'Running'}
                                </span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                            {account.userId && <span>UID: {account.userId}</span>}
                            <span>{account.cookieCount} cookies ({account.cookieFormat})</span>
                            {account.lastVerified && (
                              <span>Verified: {new Date(account.lastVerified).toLocaleDateString()}</span>
                            )}
                            {account.profileName && (
                              <span className="text-green-400">{account.profileName}</span>
                            )}
                            {account.profileUrl && (
                              <a href={account.profileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 truncate max-w-[200px]">
                                {account.profileUrl.replace('https://www.linkedin.com/in/', '')}
                              </a>
                            )}
                          </div>
                          {account.lastError && (
                            <p className="text-[11px] text-red-400 mt-1">{account.lastError}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Agent controls */}
                        {!isAgentRunning ? (
                          <button
                            onClick={() => { setShowAgentConfig(account.id); setCfgActions(['post', 'comment']); setCfgTestMode(false); }}
                            disabled={account.status === 'failed' || account.status === 'restricted'}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-md transition-colors disabled:opacity-50"
                            title="Start AI Agent"
                          >
                            <Bot className="w-3.5 h-3.5" />
                            Agent
                          </button>
                        ) : (
                          <>
                            {agentStatus.state === 'running' ? (
                              <button onClick={() => handlePauseAgent(account.id)} className="flex items-center gap-1 px-2.5 py-1.5 bg-yellow-600/80 hover:bg-yellow-600 text-white text-xs rounded-md transition-colors" title="Pause agent">
                                <Pause className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button onClick={() => handleResumeAgent(account.id)} className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600/80 hover:bg-green-600 text-white text-xs rounded-md transition-colors" title="Resume agent">
                                <Play className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleStopAgent(account.id)}
                              disabled={stoppingAgent === account.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-xs rounded-md transition-colors disabled:opacity-50"
                              title="Stop agent"
                            >
                              {stoppingAgent === account.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => handleShowLogs(account.id)} className="flex items-center gap-1 px-2.5 py-1.5 bg-dark-700 hover:bg-dark-600 text-gray-300 text-xs rounded-md border border-gray-600/50 transition-colors" title="View logs">
                              <ScrollText className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {/* Standard controls */}
                        <button
                          onClick={() => handleVerify(account.id)}
                          disabled={verifying === account.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-gray-300 text-xs rounded-md border border-gray-600/50 transition-colors disabled:opacity-50"
                          title="Test connection"
                        >
                          {verifying === account.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <CheckCircle className="w-3.5 h-3.5" />
                          }
                          Verify
                        </button>
                        <button
                          onClick={() => handleLaunch(account.id)}
                          disabled={launching === account.id || account.status === 'failed'}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded-md transition-colors disabled:opacity-50"
                          title="Open LinkedIn in browser"
                        >
                          {launching === account.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <ExternalLink className="w-3.5 h-3.5" />
                          }
                          Launch
                        </button>
                        <button
                          onClick={() => handleDelete(account.id)}
                          className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                          title="Delete account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Agent stats row (when agent is running) */}
                  {isAgentRunning && agentStatus && (
                    <div className="px-4 pb-3 border-t border-gray-800/30">
                      <div className="flex items-center gap-4 pt-2 text-[11px]">
                        <span className="text-gray-500">
                          <Zap className="w-3 h-3 inline mr-1 text-purple-400" />
                          {agentStatus.stats.totalActions} actions
                        </span>
                        {agentStatus.stats.posts > 0 && <span className="text-gray-500">Posts: {agentStatus.stats.posts}</span>}
                        {agentStatus.stats.comments > 0 && <span className="text-gray-500">Comments: {agentStatus.stats.comments}</span>}
                        {agentStatus.stats.likes > 0 && <span className="text-gray-500">Likes: {agentStatus.stats.likes}</span>}
                        {agentStatus.stats.connections > 0 && <span className="text-gray-500">Connections: {agentStatus.stats.connections}</span>}
                        {agentStatus.stats.articles > 0 && <span className="text-gray-500">Articles: {agentStatus.stats.articles}</span>}
                        {agentStatus.stats.errors > 0 && <span className="text-red-400">Errors: {agentStatus.stats.errors}</span>}
                        {agentStatus.currentAction && (
                          <span className="text-purple-400 animate-pulse">
                            Now: {agentStatus.currentAction}
                          </span>
                        )}
                        {agentStatus.lastError && (
                          <span className="text-red-400 truncate max-w-[200px]" title={agentStatus.lastError}>
                            Last error: {agentStatus.lastError}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Agent logs panel */}
                  {showAgentPanel === account.id && agentLogs[account.id] && (
                    <div className="border-t border-gray-800/30 max-h-60 overflow-y-auto">
                      <div className="px-4 py-2 bg-dark-900/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-400">Agent Logs</span>
                          <button onClick={() => handleShowLogs(account.id)} className="text-[10px] text-gray-500 hover:text-gray-300">Refresh</button>
                        </div>
                        {agentLogs[account.id].length === 0 ? (
                          <p className="text-[11px] text-gray-600 py-2">No logs yet</p>
                        ) : (
                          <div className="space-y-1">
                            {[...agentLogs[account.id]].reverse().map((log, i) => (
                              <div key={i} className="flex items-start gap-2 text-[11px]">
                                <span className="text-gray-600 whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                <span className={`px-1.5 rounded text-[10px] font-medium ${
                                  log.status === 'success' ? 'bg-green-500/10 text-green-400' :
                                  log.status === 'error' ? 'bg-red-500/10 text-red-400' :
                                  log.status === 'skipped' ? 'bg-yellow-500/10 text-yellow-400' :
                                  'bg-gray-500/10 text-gray-400'
                                }`}>{log.action}</span>
                                <span className="text-gray-300 flex-1">{log.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent Config Dialog */}
      {showAgentConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-900 border border-gray-700/50 rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-1">
              <Bot className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-bold text-white">Start AI Agent</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Configure the autonomous agent for {accounts.find(a => a.id === showAgentConfig)?.name}
            </p>

            {/* Actions */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Enabled Actions</label>
              <div className="flex flex-wrap gap-2">
                {(['post', 'comment', 'like', 'connect', 'article'] as const).map(action => (
                  <button
                    key={action}
                    onClick={() => setCfgActions(prev =>
                      prev.includes(action) ? prev.filter(a => a !== action) : [...prev, action]
                    )}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      cfgActions.includes(action)
                        ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                        : 'bg-dark-800 border-gray-700/50 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {ACTION_LABELS[action]}
                  </button>
                ))}
              </div>
            </div>

            {/* Language + Tone */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Language</label>
                <input
                  type="text"
                  value={cfgLanguage}
                  onChange={e => setCfgLanguage(e.target.value)}
                  placeholder="English"
                  className="w-full bg-dark-800 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Tone</label>
                <input
                  type="text"
                  value={cfgTone}
                  onChange={e => setCfgTone(e.target.value)}
                  placeholder="professional and insightful"
                  className="w-full bg-dark-800 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
                />
              </div>
            </div>

            {/* Topics */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Topics (comma-separated)</label>
              <input
                type="text"
                value={cfgTopics}
                onChange={e => setCfgTopics(e.target.value)}
                placeholder="e.g. leadership, AI, digital transformation"
                className="w-full bg-dark-800 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
              />
            </div>

            {/* Industry */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Industry</label>
              <input
                type="text"
                value={cfgIndustry}
                onChange={e => setCfgIndustry(e.target.value)}
                placeholder="Technology"
                className="w-full bg-dark-800 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
              />
              <p className="text-[10px] text-gray-600 mt-1">Industry context for generating relevant content</p>
            </div>

            {/* Target Accounts */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Target Profiles (comma-separated URLs)</label>
              <input
                type="text"
                value={cfgTargetAccounts}
                onChange={e => setCfgTargetAccounts(e.target.value)}
                placeholder="https://linkedin.com/in/satyanadella, https://linkedin.com/in/reidhoffman"
                className="w-full bg-dark-800 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
              />
              <p className="text-[10px] text-gray-600 mt-1">Profiles to interact with (comment on, like, connect)</p>
            </div>

            {/* Test mode toggle */}
            <div className="mb-6 flex items-center gap-3 p-3 bg-dark-800 rounded-lg border border-gray-700/30">
              <input
                type="checkbox"
                id="testMode"
                checked={cfgTestMode}
                onChange={e => setCfgTestMode(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-dark-700 text-purple-500 focus:ring-purple-500"
              />
              <div>
                <label htmlFor="testMode" className="text-sm text-white cursor-pointer">Test Mode</label>
                <p className="text-[10px] text-gray-500">Log actions without executing them (dry run)</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAgentConfig(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStartAgent(showAgentConfig)}
                disabled={startingAgent !== null || cfgActions.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {startingAgent ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Starting...</>
                ) : (
                  <><Play className="w-4 h-4" />Start Agent</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Account Dialog */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-900 border border-gray-700/50 rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-1">Add LinkedIn Account</h3>
            <p className="text-xs text-gray-500 mb-4">
              Paste cookies from Cookie Editor (JSON) or plain cookie string.
            </p>

            {/* Account name */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1.5">Account Name</label>
              <input
                type="text"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="e.g. My LinkedIn Profile"
                className="w-full bg-dark-800 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                autoFocus
              />
            </div>

            {/* Cookies input */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm text-gray-400">Cookies</label>
                <button
                  onClick={() => setShowCookies(!showCookies)}
                  className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300"
                >
                  {showCookies ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showCookies ? 'Hide' : 'Show'}
                </button>
              </div>
              <textarea
                value={addCookies}
                onChange={e => { setAddCookies(e.target.value); setPreview(null); }}
                placeholder={'Paste cookies here...\n\nSupported formats:\n- JSON: [{"name":"li_at","value":"abc",...}]\n- Plain: li_at=abc; JSESSIONID=xyz; lidc=...'}
                rows={6}
                className={`w-full bg-dark-800 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 font-mono resize-none ${
                  !showCookies && addCookies ? 'text-security-disc' : ''
                }`}
                style={!showCookies && addCookies ? { WebkitTextSecurity: 'disc' } as any : undefined}
              />
            </div>

            {/* Parse preview button */}
            <div className="mb-4">
              <button
                onClick={handlePreview}
                disabled={previewing || !addCookies.trim()}
                className="flex items-center gap-2 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-gray-300 text-xs rounded-md border border-gray-600/50 transition-colors disabled:opacity-50"
              >
                {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                Preview Parse
              </button>
            </div>

            {/* Preview result */}
            {preview && (
              <div className={`mb-4 p-3 rounded-lg border ${
                preview.valid ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
              }`}>
                {preview.error ? (
                  <p className="text-xs text-red-300">{preview.error}</p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      {preview.valid
                        ? <CheckCircle className="w-4 h-4 text-green-400" />
                        : <XCircle className="w-4 h-4 text-red-400" />
                      }
                      <span className={`text-xs font-semibold ${preview.valid ? 'text-green-300' : 'text-red-300'}`}>
                        {preview.valid ? 'Valid cookies detected' : 'Invalid — missing required cookies'}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 space-y-0.5">
                      <p>Format: <span className="text-white">{preview.format.toUpperCase()}</span></p>
                      <p>Cookies found: <span className="text-white">{preview.cookieCount}</span></p>
                      {preview.userId && <p>User ID: <span className="text-white">{preview.userId}</span></p>}
                      <p className="text-gray-500 truncate">Names: {preview.cookieNames.join(', ')}</p>
                    </div>
                    {preview.missing.length > 0 && (
                      <p className="text-[11px] text-red-400">Missing: {preview.missing.join(', ')}</p>
                    )}
                    {preview.warnings.map((w, i) => (
                      <p key={i} className="text-[11px] text-amber-400">{w}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Format help */}
            <div className="mb-4 p-3 bg-dark-800 rounded-lg border border-gray-700/30">
              <p className="text-[11px] font-semibold text-gray-400 mb-1.5">Supported Formats</p>
              <div className="space-y-1 text-[10px] text-gray-500">
                <p><span className="text-blue-400 font-medium">JSON</span> — Export from Cookie Editor browser extension</p>
                <p><span className="text-blue-400 font-medium">Plain</span> — Cookie string: li_at=abc; JSESSIONID=xyz; lidc=...</p>
              </div>
              <p className="text-[10px] text-gray-600 mt-1.5">Required: <span className="text-white">li_at</span>. Recommended: <span className="text-gray-400">JSESSIONID</span>, <span className="text-gray-400">lidc</span></p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowAdd(false); setAddName(''); setAddCookies(''); setPreview(null); }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAccount}
                disabled={addSaving || !addName.trim() || !addCookies.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {addSaving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
                ) : (
                  <><Plus className="w-4 h-4" />Add Account</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

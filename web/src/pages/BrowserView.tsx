import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import {
  Monitor, Plus, Trash2, Globe, Loader2, AlertTriangle,
  Brain, RefreshCw, ExternalLink, Maximize2, X, Cpu, Wifi, WifiOff
} from 'lucide-react';
import FacebookTab from './FacebookTab';
import TwitterTab from './TwitterTab';
import LinkedInTab from './LinkedInTab';
import TikTokTab from './TikTokTab';
import MobileAgentTab from './MobileAgentTab';

interface BrowserSession {
  id: string;
  displayNumber: number;
  vncPort: number;
  wsPort: number;
  url: string;
  title: string;
  status: string;
  vncEnabled: boolean;
  createdAt: string;
  error?: string;
}

interface Resources {
  sessions: number;
  maxSessions: number;
  vncSessions: number;
  headlessSessions: number;
  ramAvailableMB: number;
  ramTotalMB: number;
  ramPerSessionMB: number;
  ramPerVncSessionMB: number;
  warning?: string;
}

type ViewTab = 'browser' | 'facebook' | 'twitter' | 'linkedin' | 'tiktok' | 'mobile';

export default function BrowserView() {
  const [activeTab, setActiveTab] = useState<ViewTab>('browser');
  const [sessions, setSessions] = useState<BrowserSession[]>([]);
  const [resources, setResources] = useState<Resources | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [aiInput, setAiInput] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [newSessionUrl, setNewSessionUrl] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [sessRes, resRes] = await Promise.all([
        api.browserSessions(),
        api.browserResources(),
      ]);
      setSessions(sessRes.sessions);
      setResources(resRes);
      if (activeSession && !sessRes.sessions.find((s: BrowserSession) => s.id === activeSession)) {
        setActiveSession(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeSession]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Allow FacebookTab to switch back to browser tab with a session
  useEffect(() => {
    (window as any).__switchToBrowserTab = (sessionId?: string) => {
      setActiveTab('browser');
      if (sessionId) {
        fetchData();
        setTimeout(() => setActiveSession(sessionId), 500);
      }
    };
    return () => { delete (window as any).__switchToBrowserTab; };
  }, [fetchData]);

  // VNC keepalive — ping server every 30s so VNC doesn't auto-detach
  useEffect(() => {
    if (!activeSession) return;
    const session = sessions.find(s => s.id === activeSession);
    if (!session?.vncEnabled) return;

    const keepalive = setInterval(() => {
      api.browserVncKeepalive(activeSession).catch(() => {});
    }, 30_000);
    return () => clearInterval(keepalive);
  }, [activeSession, sessions]);

  // Sync URL bar
  useEffect(() => {
    const session = sessions.find(s => s.id === activeSession);
    if (session) setUrlInput(session.url);
  }, [activeSession, sessions]);

  const createSession = async () => {
    setCreating(true);
    setError(null);
    try {
      const url = newSessionUrl.trim() || undefined;
      const session = await api.browserCreateSession(url, true); // withVnc=true for BrowserView
      setSessions(prev => [...prev, session]);
      setActiveSession(session.id);
      setShowNewDialog(false);
      setNewSessionUrl('');
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const closeSession = async (id: string) => {
    try {
      await api.browserCloseSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSession === id) setActiveSession(null);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const navigate = async () => {
    if (!activeSession || !urlInput.trim()) return;
    try {
      let url = urlInput.trim();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      const res = await api.browserNavigate(activeSession, url);
      if (res.url) setUrlInput(res.url);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleVnc = async (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    try {
      if (session.vncEnabled) {
        await api.browserDetachVnc(id);
      } else {
        await api.browserAttachVnc(id);
      }
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const runAiAction = async () => {
    if (!activeSession || !aiInput.trim()) return;
    setAiRunning(true);
    setAiResult(null);
    try {
      const res = await api.browserAiAction(activeSession, aiInput.trim());
      setAiResult(res.result);
      if (res.url) setUrlInput(res.url);
      fetchData();
    } catch (err: any) {
      setAiResult(`Error: ${err.message}`);
    } finally {
      setAiRunning(false);
    }
  };

  const activeSessionData = sessions.find(s => s.id === activeSession);
  const vncUrl = activeSessionData?.vncEnabled
    ? `/novnc/vnc.html?autoconnect=true&resize=scale&path=browser-vnc/${activeSessionData.id}`
    : null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-gray-800/50 bg-dark-900/80 px-4">
        <button
          onClick={() => setActiveTab('browser')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'browser'
              ? 'border-primary-500 text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <Monitor className="w-4 h-4" />
          Browser
        </button>
        <button
          onClick={() => setActiveTab('facebook')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'facebook'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          Facebook
        </button>
        <button
          onClick={() => setActiveTab('twitter')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'twitter'
              ? 'border-sky-500 text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          X / Twitter
        </button>
        <button
          onClick={() => setActiveTab('linkedin')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'linkedin'
              ? 'border-blue-600 text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          LinkedIn
        </button>
        <button
          onClick={() => setActiveTab('tiktok')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'tiktok'
              ? 'border-pink-500 text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.88-2.88 2.89 2.89 0 0 1 2.88-2.88c.28 0 .56.04.81.1v-3.52a6.37 6.37 0 0 0-.81-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.81a8.22 8.22 0 0 0 4.76 1.52V6.88a4.79 4.79 0 0 1-1-.19z"/>
          </svg>
          TikTok
        </button>
        <button
          onClick={() => setActiveTab('mobile')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'mobile'
              ? 'border-green-500 text-white'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
          Mobile
        </button>
      </div>

      {/* Facebook tab */}
      {activeTab === 'facebook' && <FacebookTab />}

      {/* Twitter tab */}
      {activeTab === 'twitter' && <TwitterTab />}

      {/* LinkedIn tab */}
      {activeTab === 'linkedin' && <LinkedInTab />}

      {/* TikTok tab */}
      {activeTab === 'tiktok' && <TikTokTab />}

      {/* Mobile Agent tab */}
      {activeTab === 'mobile' && <MobileAgentTab />}

      {/* Browser tab */}
      {activeTab === 'browser' && loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      )}

      {activeTab === 'browser' && !loading && (<>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800/50">
        <div className="flex items-center gap-2">
          {resources && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800 border border-gray-700/50">
              <Cpu className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-400">
                {resources.sessions}/{resources.maxSessions} sessions
              </span>
              <span className="text-xs text-gray-600">|</span>
              <span className="text-xs text-green-400">{resources.vncSessions} VNC</span>
              <span className="text-xs text-gray-600">|</span>
              <span className={`text-xs ${resources.ramAvailableMB < 1000 ? 'text-red-400' : 'text-gray-400'}`}>
                {(resources.ramAvailableMB / 1024).toFixed(1)}GB free
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNewDialog(true)}
            disabled={creating || (resources?.sessions ?? 0) >= (resources?.maxSessions ?? 3)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
          <button onClick={fetchData} className="p-2 text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error bar */}
      {error && (
        <div className="mx-6 mt-3 flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300 flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {resources?.warning && (
        <div className="mx-6 mt-3 flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-sm text-amber-300">{resources.warning}</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Session list — left panel */}
        <div className="w-64 border-r border-gray-800/50 flex flex-col overflow-y-auto">
          <div className="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Active Sessions ({sessions.length})
          </div>
          {sessions.length === 0 ? (
            <div className="p-4 text-center text-gray-600 text-sm">
              No active sessions. Click "New Session" to start.
            </div>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                onClick={() => setActiveSession(s.id)}
                className={`mx-2 mb-1 p-3 rounded-lg cursor-pointer transition-all border ${
                  activeSession === s.id
                    ? 'bg-primary-600/20 border-primary-500/40 text-white'
                    : 'bg-dark-800/50 border-transparent hover:bg-dark-800 text-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      s.status === 'running' ? 'bg-green-400' :
                      s.status === 'starting' ? 'bg-yellow-400 animate-pulse' :
                      s.status === 'error' ? 'bg-red-400' : 'bg-gray-500'
                    }`} />
                    <span className="text-xs font-medium truncate max-w-[100px]">
                      {s.title || 'New Tab'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleVnc(s.id); }}
                      className={`p-1 transition-colors ${s.vncEnabled ? 'text-green-400 hover:text-green-300' : 'text-gray-600 hover:text-gray-400'}`}
                      title={s.vncEnabled ? 'VNC active — click to detach' : 'VNC off — click to attach'}
                    >
                      {s.vncEnabled ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); closeSession(s.id); }}
                      className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                      title="Close session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-gray-500 truncate">{s.url}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-gray-600">:{s.displayNumber}</span>
                  {s.vncEnabled && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">VNC</span>
                  )}
                  {!s.vncEnabled && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-gray-500/10 text-gray-500 border border-gray-500/20">headless</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Main viewer area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeSessionData ? (
            <>
              {/* URL bar */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800/50 bg-dark-900/80">
                <Globe className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <input
                  type="text"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && navigate()}
                  placeholder="https://example.com"
                  className="flex-1 bg-dark-800 border border-gray-700/50 rounded-md px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/50"
                />
                <button onClick={navigate} className="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 text-gray-300 text-sm rounded-md border border-gray-700/50 transition-colors">
                  Go
                </button>
                {!activeSessionData.vncEnabled && (
                  <button
                    onClick={() => toggleVnc(activeSessionData.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 text-sm rounded-md border border-green-500/30 transition-colors"
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    Enable VNC
                  </button>
                )}
                {vncUrl && (
                  <a href={vncUrl} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 text-gray-500 hover:text-white transition-colors" title="Open VNC in new tab">
                    <Maximize2 className="w-4 h-4" />
                  </a>
                )}
              </div>

              {/* AI Command Panel — tell the AI what to do on this page */}
              <div className="border-b border-gray-800/50 bg-gradient-to-r from-purple-900/20 to-dark-900/60">
                <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                  <Brain className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span className="text-xs font-bold text-purple-300">AI Command</span>
                  <span className="mx-1 text-gray-700">|</span>
                  <span className="text-[10px] text-gray-400">Write what you want the AI to do on this browser page</span>
                </div>
                <div className="flex items-center gap-2 px-4 pb-2">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={e => setAiInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !aiRunning && runAiAction()}
                    placeholder="What should the AI do? e.g. 'Click the login button', 'Fill email field with test@gmail.com', 'Scroll to the bottom'..."
                    className="flex-1 bg-dark-800 border border-gray-700/50 rounded-md px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50"
                  />
                  <button
                    onClick={runAiAction}
                    disabled={aiRunning || !aiInput.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {aiRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                    {aiRunning ? 'Working...' : 'Execute'}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 px-4 pb-2.5 flex-wrap">
                  <span className="text-[9px] text-gray-600 mr-1">Quick:</span>
                  {[
                    { label: 'Click login', cmd: 'Find and click the login or sign-in button' },
                    { label: 'Fill form', cmd: 'Fill all visible form fields with appropriate test data' },
                    { label: 'Scrape data', cmd: 'Extract the main content and data from this page' },
                    { label: 'Get all links', cmd: 'Extract all links from this page with their text' },
                    { label: 'Screenshot', cmd: 'Take a screenshot of the current page' },
                    { label: 'Scroll down', cmd: 'Scroll down to see more content' },
                    { label: 'Accept cookies', cmd: 'Find and accept the cookie consent popup' },
                  ].map(q => (
                    <button
                      key={q.label}
                      onClick={() => { setAiInput(q.cmd); }}
                      disabled={aiRunning}
                      className="px-2 py-0.5 text-[10px] font-medium bg-dark-800 hover:bg-purple-600/20 text-gray-400 hover:text-purple-300 rounded border border-gray-700/50 hover:border-purple-500/30 transition-all disabled:opacity-50"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI result */}
              {aiResult && (
                <div className="mx-4 mt-2 px-3 py-2 bg-purple-500/10 border border-purple-500/30 rounded-lg relative">
                  <button onClick={() => setAiResult(null)} className="absolute top-1 right-1 p-1 text-purple-400 hover:text-purple-300">
                    <X className="w-3 h-3" />
                  </button>
                  <div className="text-xs text-purple-300 font-mono whitespace-pre-wrap pr-6">{aiResult}</div>
                </div>
              )}

              {/* noVNC iframe or headless mode indicator */}
              <div className="flex-1 bg-black relative">
                {vncUrl ? (
                  <iframe
                    ref={iframeRef}
                    src={vncUrl}
                    className="w-full h-full border-0"
                    title="Browser VNC"
                    allow="clipboard-read; clipboard-write"
                  />
                ) : activeSessionData.vncEnabled ? (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    Connecting to VNC...
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center h-full">
                    <div className="text-center">
                      <WifiOff className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                      <p className="text-gray-400 mb-1">Browser running in headless mode</p>
                      <p className="text-xs text-gray-600 mb-4">VNC is off to save resources. Enable it to see the browser live.</p>
                      <button
                        onClick={() => toggleVnc(activeSessionData.id)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 font-medium rounded-lg border border-green-500/30 transition-colors"
                      >
                        <Wifi className="w-4 h-4" />
                        Enable VNC Streaming
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Monitor className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-400 mb-2">No Browser Session Selected</h2>
                <p className="text-sm text-gray-600 mb-6 max-w-md">
                  Launch a headed browser session to browse any website in real-time.
                  Each session includes anti-detection stealth and AI-driven automation.
                </p>
                <button
                  onClick={() => setShowNewDialog(true)}
                  disabled={creating || (resources?.sessions ?? 0) >= (resources?.maxSessions ?? 3)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Launch Browser Session
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      </>)}

      {/* New session dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-900 border border-gray-700/50 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-white mb-1">New Browser Session</h3>
            <p className="text-xs text-gray-500 mb-4">
              Each session uses ~250MB RAM (headless) or ~400MB (with VNC). Max {resources?.maxSessions ?? 3} sessions.
            </p>

            {resources && (
              <div className="mb-4 p-3 bg-dark-800 rounded-lg border border-gray-700/30">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-400">RAM Available</span>
                  <span className={resources.ramAvailableMB < 1000 ? 'text-red-400' : 'text-green-400'}>
                    {(resources.ramAvailableMB / 1024).toFixed(1)}GB / {(resources.ramTotalMB / 1024).toFixed(1)}GB
                  </span>
                </div>
                <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      resources.ramAvailableMB < 1000 ? 'bg-red-500' :
                      resources.ramAvailableMB < 2000 ? 'bg-amber-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, ((resources.ramTotalMB - resources.ramAvailableMB) / resources.ramTotalMB) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1.5">Start URL (optional)</label>
              <input
                type="text"
                value={newSessionUrl}
                onChange={e => setNewSessionUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !creating && createSession()}
                placeholder="https://google.com"
                className="w-full bg-dark-800 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/50"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowNewDialog(false); setNewSessionUrl(''); }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createSession}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {creating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Starting...</>
                ) : (
                  <><ExternalLink className="w-4 h-4" />Launch</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

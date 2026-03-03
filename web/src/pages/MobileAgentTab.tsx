import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import {
  Smartphone, Wifi, WifiOff, Play, Square, Pause, RefreshCw,
  Loader2, AlertTriangle, CheckCircle, Camera, Settings, Zap
} from 'lucide-react';

interface ConnectionStatus { connected: boolean; url: string; status?: unknown; error?: string }
interface DeviceInfo { id: string; status: string; model: string; device: string; product: string }
interface AgentStatus {
  id: string; app: string; deviceId: string;
  state: 'stopped' | 'running' | 'paused' | 'error';
  currentAction: string | null;
  stats: Record<string, number>;
  lastError: string | null;
  startedAt: string | null;
  lastAction: string | null;
  lastActionTime: string | null;
  nextActionTime: string | null;
  config: Record<string, unknown>;
}
interface LogEntry { timestamp: string; action: string; status: string; message: string; details?: string }

const APP_OPTIONS = [
  { value: 'tiktok', label: 'TikTok', color: 'pink' },
  { value: 'twitter', label: 'X / Twitter', color: 'sky' },
  { value: 'facebook', label: 'Facebook', color: 'blue' },
];

export default function MobileAgentTab() {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [testUrl, setTestUrl] = useState('http://localhost:4723');
  const [testing, setTesting] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Launch form
  const [launchApp, setLaunchApp] = useState<string>('tiktok');
  const [launchDevice, setLaunchDevice] = useState('');
  const [launchTestMode, setLaunchTestMode] = useState(true);
  const [launchActions, setLaunchActions] = useState<string[]>(['like', 'scroll']);
  const [launchTone, setLaunchTone] = useState('Authentic, friendly, engaged');
  const [launchTopics, setLaunchTopics] = useState('AI, technology');
  const [launchLang, setLaunchLang] = useState('English');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const checkConnection = useCallback(async () => {
    try {
      const data = await api.get('/mobile-agent/connection');
      setConnection(data);
      setTestUrl(data.url);
    } catch { setConnection(null); }
  }, []);

  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const data = await api.get('/mobile-agent/devices');
      setDevices(data.devices || []);
      if (data.devices?.length && !launchDevice) setLaunchDevice(data.devices[0].id);
    } catch { setDevices([]); }
    setLoadingDevices(false);
  }, [launchDevice]);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await api.get('/mobile-agent/agents');
      setAgents(data.agents || []);
    } catch { /* ignore */ }
  }, []);

  const fetchLogs = useCallback(async (agentId: string) => {
    try {
      const data = await api.get(`/mobile-agent/agents/${encodeURIComponent(agentId)}/logs?limit=100`);
      setLogs(data.logs || []);
    } catch { /* ignore */ }
  }, []);

  const fetchScreenshot = useCallback(async (agentId: string) => {
    setScreenshotLoading(true);
    try {
      const data = await api.get(`/mobile-agent/agents/${encodeURIComponent(agentId)}/screenshot`);
      setScreenshot(data.screenshot || null);
    } catch { setScreenshot(null); }
    setScreenshotLoading(false);
  }, []);

  useEffect(() => { checkConnection(); fetchAgents(); }, [checkConnection, fetchAgents]);

  useEffect(() => {
    if (!selectedAgent) return;
    fetchLogs(selectedAgent);
    const iv = setInterval(() => { fetchLogs(selectedAgent); fetchAgents(); }, 5000);
    return () => clearInterval(iv);
  }, [selectedAgent, fetchLogs, fetchAgents]);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const data = await api.post('/mobile-agent/connection/test', { url: testUrl });
      setConnection(data);
    } catch (e: unknown) {
      setConnection({ connected: false, url: testUrl, error: e instanceof Error ? e.message : String(e) });
    }
    setTesting(false);
  };

  const handleLaunchAgent = async () => {
    setCreating(true); setError(null);
    try {
      const data = await api.post('/mobile-agent/agents', {
        app: launchApp,
        deviceId: launchDevice,
        appiumUrl: testUrl,
        config: {
          actions: launchActions,
          content: { tone: launchTone, language: launchLang, topics: launchTopics.split(',').map(s => s.trim()) },
          testMode: launchTestMode,
        },
      });
      if (data.ok) {
        setSelectedAgent(data.status.id);
        await fetchAgents();
      } else {
        setError(data.error || 'Failed to start agent');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setCreating(false);
  };

  const handleStop = async (id: string) => {
    try {
      await api.post(`/mobile-agent/agents/${encodeURIComponent(id)}/stop`);
      if (selectedAgent === id) setSelectedAgent(null);
      await fetchAgents();
    } catch { /* ignore */ }
  };

  const handlePause = async (id: string) => {
    try {
      await api.post(`/mobile-agent/agents/${encodeURIComponent(id)}/pause`);
      await fetchAgents();
    } catch { /* ignore */ }
  };

  const handleResume = async (id: string) => {
    try {
      await api.post(`/mobile-agent/agents/${encodeURIComponent(id)}/resume`);
      await fetchAgents();
    } catch { /* ignore */ }
  };

  const activeAgent = agents.find(a => a.id === selectedAgent);

  const actionOptions: Record<string, string[]> = {
    tiktok: ['like', 'comment', 'follow', 'scroll'],
    twitter: ['like', 'reply', 'retweet', 'follow', 'scroll'],
    facebook: ['like', 'comment', 'share', 'scroll'],
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* ── Connection Panel ─────────────────────────────────── */}
      <div className="bg-dark-800 rounded-xl border border-gray-800/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-green-400" />
          Appium Connection
        </h3>
        <div className="flex items-center gap-3">
          <input
            value={testUrl}
            onChange={e => setTestUrl(e.target.value)}
            placeholder="http://localhost:4723"
            className="flex-1 bg-dark-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:border-green-500 outline-none"
          />
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            Test
          </button>
        </div>
        {connection && (
          <div className={`mt-3 flex items-center gap-2 text-sm ${connection.connected ? 'text-green-400' : 'text-red-400'}`}>
            {connection.connected ? <CheckCircle className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {connection.connected ? 'Connected to Appium server' : `Not connected: ${connection.error || 'Unknown error'}`}
          </div>
        )}
      </div>

      {/* ── Devices ──────────────────────────────────────────── */}
      <div className="bg-dark-800 rounded-xl border border-gray-800/50 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            Devices
          </h3>
          <button onClick={fetchDevices} disabled={loadingDevices} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${loadingDevices ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        {devices.length === 0 ? (
          <p className="text-gray-500 text-sm">No devices found. Ensure ADB is running or click Refresh.</p>
        ) : (
          <div className="space-y-2">
            {devices.map(d => (
              <div key={d.id} className="flex items-center gap-3 bg-dark-700 rounded-lg px-3 py-2">
                <Smartphone className="w-4 h-4 text-green-400" />
                <span className="text-sm text-white font-mono">{d.id}</span>
                <span className="text-xs text-gray-400">{d.model}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${d.status === 'device' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Launch Agent ─────────────────────────────────────── */}
      <div className="bg-dark-800 rounded-xl border border-gray-800/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Play className="w-4 h-4 text-primary-400" />
          Launch Mobile Agent
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">App</label>
            <select
              value={launchApp}
              onChange={e => { setLaunchApp(e.target.value); setLaunchActions(['like', 'scroll']); }}
              className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-700"
            >
              {APP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Device</label>
            <select
              value={launchDevice}
              onChange={e => setLaunchDevice(e.target.value)}
              className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-700"
            >
              {devices.length === 0 && <option value="">No devices</option>}
              {devices.map(d => <option key={d.id} value={d.id}>{d.id} — {d.model}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-400 mb-1 block">Actions</label>
            <div className="flex flex-wrap gap-2">
              {(actionOptions[launchApp] || []).map(act => (
                <label key={act} className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={launchActions.includes(act)}
                    onChange={e => {
                      if (e.target.checked) setLaunchActions([...launchActions, act]);
                      else setLaunchActions(launchActions.filter(a => a !== act));
                    }}
                    className="rounded border-gray-600 bg-dark-700 text-primary-500"
                  />
                  {act}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Tone</label>
            <input value={launchTone} onChange={e => setLaunchTone(e.target.value)} className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-700" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Language</label>
            <input value={launchLang} onChange={e => setLaunchLang(e.target.value)} className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-700" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Topics (comma-separated)</label>
            <input value={launchTopics} onChange={e => setLaunchTopics(e.target.value)} className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-700" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={launchTestMode} onChange={e => setLaunchTestMode(e.target.checked)} className="rounded border-gray-600 bg-dark-700 text-yellow-500" />
              Test Mode (simulate actions)
            </label>
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-red-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>}
        <button
          onClick={handleLaunchAgent}
          disabled={creating || !launchDevice || !connection?.connected}
          className="mt-4 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg font-medium flex items-center gap-2"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Start Agent
        </button>
      </div>

      {/* ── Running Agents ───────────────────────────────────── */}
      {agents.length > 0 && (
        <div className="bg-dark-800 rounded-xl border border-gray-800/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-400 animate-spin" style={{ animationDuration: '3s' }} />
            Running Agents
          </h3>
          <div className="space-y-2">
            {agents.map(a => (
              <div
                key={a.id}
                onClick={() => setSelectedAgent(a.id)}
                className={`flex items-center justify-between bg-dark-700 rounded-lg px-4 py-3 cursor-pointer border transition-colors ${
                  selectedAgent === a.id ? 'border-primary-500/50' : 'border-transparent hover:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${a.state === 'running' ? 'bg-green-400 animate-pulse' : a.state === 'paused' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                  <span className="text-sm text-white font-medium">{a.app}</span>
                  <span className="text-xs text-gray-500 font-mono">{a.deviceId}</span>
                  <span className="text-xs text-gray-400">{a.state}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{a.stats.totalActions} actions</span>
                  {a.state === 'running' && (
                    <button onClick={e => { e.stopPropagation(); handlePause(a.id); }} className="p-1 text-yellow-400 hover:text-yellow-300" title="Pause">
                      <Pause className="w-4 h-4" />
                    </button>
                  )}
                  {a.state === 'paused' && (
                    <button onClick={e => { e.stopPropagation(); handleResume(a.id); }} className="p-1 text-green-400 hover:text-green-300" title="Resume">
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); handleStop(a.id); }} className="p-1 text-red-400 hover:text-red-300" title="Stop">
                    <Square className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Agent Detail ─────────────────────────────────────── */}
      {activeAgent && (
        <div className="bg-dark-800 rounded-xl border border-gray-800/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              {activeAgent.app} Agent — {activeAgent.deviceId}
            </h3>
            <button
              onClick={() => fetchScreenshot(activeAgent.id)}
              disabled={screenshotLoading}
              className="px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-sm text-gray-300 rounded-lg flex items-center gap-2"
            >
              {screenshotLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
              Screenshot
            </button>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(activeAgent.stats).filter(([k]) => !['actionsThisHour', 'lastActionAt'].includes(k)).map(([key, val]) => (
              <div key={key} className="bg-dark-700 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-white">{val}</div>
                <div className="text-xs text-gray-500 capitalize">{key}</div>
              </div>
            ))}
          </div>

          {/* Screenshot */}
          {screenshot && (
            <div className="rounded-lg overflow-hidden border border-gray-700">
              <img src={`data:image/png;base64,${screenshot}`} alt="Device screenshot" className="w-full max-h-96 object-contain bg-black" />
            </div>
          )}

          {/* Logs */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 mb-2">Live Logs</h4>
            <div className="bg-dark-900 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
              {logs.length === 0 && <p className="text-gray-600">No logs yet...</p>}
              {logs.map((log, i) => (
                <div key={i} className={`flex gap-2 ${log.status === 'error' ? 'text-red-400' : log.status === 'skipped' ? 'text-yellow-400' : log.status === 'success' ? 'text-green-400' : 'text-gray-400'}`}>
                  <span className="text-gray-600 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="text-gray-500 shrink-0 w-16">[{log.action}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>

          {activeAgent.lastError && (
            <div className="text-sm text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Last error: {activeAgent.lastError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

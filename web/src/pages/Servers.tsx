import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import {
  Server, Plus, Trash2, Terminal, Activity, HardDrive,
  Cpu, RefreshCw, X, ChevronDown, Loader2, AlertTriangle,
  Clock, ChevronUp, Tag, User, Globe
} from 'lucide-react';

interface ServerEntry {
  id: string;
  name: string;
  host: string;
  user: string;
  tags: string[];
  status?: string;
}

interface HealthData {
  uptime?: string | number;
  cpu?: string | number;
  memory?: string | number;
  disk?: string | number;
}

interface ExecResult {
  output: string;
  exitCode: number;
}

interface SystemStatus {
  status: string;
  uptime: number;
  memory: number;
}

interface AddServerForm {
  name: string;
  host: string;
  user: string;
  sshKeyPath: string;
  tags: string;
}

const EMPTY_FORM: AddServerForm = { name: '', host: '', user: 'root', sshKeyPath: '~/.ssh/id_rsa', tags: '' };

export default function Servers() {
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddServerForm>({ ...EMPTY_FORM });
  const [adding, setAdding] = useState(false);

  // Per-server expanded state
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [healthMap, setHealthMap] = useState<Record<string, HealthData | null>>({});
  const [healthLoading, setHealthLoading] = useState<Record<string, boolean>>({});
  const [cmdInput, setCmdInput] = useState<Record<string, string>>({});
  const [cmdResults, setCmdResults] = useState<Record<string, ExecResult | null>>({});
  const [cmdRunning, setCmdRunning] = useState<Record<string, boolean>>({});
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);

  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load servers and system status
  const loadServers = useCallback(async () => {
    try {
      const [serverList, status] = await Promise.all([
        api.getServers().catch(() => []),
        api.status().catch(() => null),
      ]);
      setServers(serverList ?? []);
      setSystemStatus(status);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // Auto-refresh health for all servers every 30s
  useEffect(() => {
    if (servers.length === 0) return;

    const fetchAllHealth = async () => {
      for (const srv of servers) {
        try {
          const health = await api.serverHealth(srv.id);
          setHealthMap(prev => ({ ...prev, [srv.id]: health }));
        } catch {
          // leave existing health data
        }
      }
    };

    fetchAllHealth();
    healthIntervalRef.current = setInterval(fetchAllHealth, 30000);
    return () => {
      if (healthIntervalRef.current) clearInterval(healthIntervalRef.current);
    };
  }, [servers.length]);

  // Add server
  const handleAddServer = async () => {
    if (!addForm.name || !addForm.host || !addForm.user) return;
    setAdding(true);
    try {
      const tags = addForm.tags.split(',').map(t => t.trim()).filter(Boolean);
      await api.addServer({
        name: addForm.name,
        host: addForm.host,
        user: addForm.user,
        sshKeyPath: addForm.sshKeyPath || undefined,
        tags,
      });
      setAddForm({ ...EMPTY_FORM });
      setShowAddForm(false);
      await loadServers();
    } catch (err) {
      console.error('Failed to add server:', err);
    }
    setAdding(false);
  };

  // Remove server
  const handleRemove = async (id: string) => {
    try {
      await api.removeServer(id);
      setRemoveConfirm(null);
      setServers(prev => prev.filter(s => s.id !== id));
      if (expandedServer === id) setExpandedServer(null);
    } catch (err) {
      console.error('Failed to remove server:', err);
    }
  };

  // Health check for single server
  const fetchHealth = async (id: string) => {
    setHealthLoading(prev => ({ ...prev, [id]: true }));
    try {
      const health = await api.serverHealth(id);
      setHealthMap(prev => ({ ...prev, [id]: health }));
    } catch {
      setHealthMap(prev => ({ ...prev, [id]: null }));
    }
    setHealthLoading(prev => ({ ...prev, [id]: false }));
  };

  // Execute command
  const execCommand = async (id: string) => {
    const cmd = cmdInput[id]?.trim();
    if (!cmd) return;
    setCmdRunning(prev => ({ ...prev, [id]: true }));
    setCmdResults(prev => ({ ...prev, [id]: null }));
    try {
      const result = await api.execOnServer(id, cmd);
      setCmdResults(prev => ({ ...prev, [id]: result }));
    } catch (err: any) {
      setCmdResults(prev => ({ ...prev, [id]: { output: err.message || 'Execution failed', exitCode: -1 } }));
    }
    setCmdRunning(prev => ({ ...prev, [id]: false }));
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${Math.floor(seconds % 60)}s`;
  };

  const getStatusIndicator = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'online':
      case 'connected':
      case 'active':
        return { dot: 'bg-green-500', text: 'text-green-400', label: status };
      case 'degraded':
      case 'warning':
        return { dot: 'bg-yellow-500', text: 'text-yellow-400', label: status };
      case 'offline':
      case 'error':
      case 'unreachable':
        return { dot: 'bg-red-500', text: 'text-red-400', label: status };
      default:
        return { dot: 'bg-gray-500', text: 'text-gray-400', label: status || 'Unknown' };
    }
  };

  const parsePercent = (val: string | number | undefined): number | null => {
    if (val == null) return null;
    if (typeof val === 'number') return val;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  };

  const percentBarColor = (pct: number) => {
    if (pct > 90) return 'bg-red-500';
    if (pct > 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Server className="w-7 h-7 text-primary-500" />
            <h1 className="text-2xl font-bold">Servers</h1>
            <span className="text-sm text-gray-400">({servers.length})</span>
          </div>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setAddForm({ ...EMPTY_FORM }); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors font-medium"
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showAddForm ? 'Cancel' : 'Add Server'}
          </button>
        </div>

        {/* System Status Bar */}
        {systemStatus && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-dark-800 rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-400" />
                <p className="text-sm text-gray-400">System Uptime</p>
              </div>
              <p className="text-xl font-bold text-blue-400">{formatUptime(systemStatus.uptime)}</p>
            </div>
            <div className="bg-dark-800 rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="w-4 h-4 text-purple-400" />
                <p className="text-sm text-gray-400">Memory Usage</p>
              </div>
              <p className="text-xl font-bold text-purple-400">{(systemStatus.memory / 1024 / 1024).toFixed(0)} MB</p>
            </div>
            <div className="bg-dark-800 rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-green-400" />
                <p className="text-sm text-gray-400">Status</p>
              </div>
              <p className="text-xl font-bold text-green-400">Online</p>
            </div>
          </div>
        )}

        {/* Add Server Form */}
        {showAddForm && (
          <div className="mb-6 p-5 bg-dark-800 rounded-lg border border-primary-600/50">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary-400" />
              Add New Server
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  value={addForm.name}
                  onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="Production Web Server"
                  className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Host</label>
                <input
                  value={addForm.host}
                  onChange={e => setAddForm({ ...addForm, host: e.target.value })}
                  placeholder="192.168.1.100 or server.example.com"
                  className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">User</label>
                <input
                  value={addForm.user}
                  onChange={e => setAddForm({ ...addForm, user: e.target.value })}
                  placeholder="root"
                  className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">SSH Key Path</label>
                <input
                  value={addForm.sshKeyPath}
                  onChange={e => setAddForm({ ...addForm, sshKeyPath: e.target.value })}
                  placeholder="~/.ssh/id_rsa"
                  className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono focus:border-primary-500 focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">Tags (comma separated)</label>
                <input
                  value={addForm.tags}
                  onChange={e => setAddForm({ ...addForm, tags: e.target.value })}
                  placeholder="production, web, nginx"
                  className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm focus:border-primary-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleAddServer}
                disabled={adding || !addForm.name || !addForm.host || !addForm.user}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 font-medium"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Server
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-dark-900 rounded-lg hover:bg-dark-800 transition-colors text-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Server List */}
        {servers.length === 0 ? (
          <div className="text-center py-16">
            <Server className="w-16 h-16 mx-auto mb-4 text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-400 mb-2">No servers configured</h2>
            <p className="text-gray-500 mb-6">Add your first server to start managing it remotely via SSH.</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Your First Server
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {servers.map(srv => {
              const statusInfo = getStatusIndicator(srv.status);
              const isExpanded = expandedServer === srv.id;
              const health = healthMap[srv.id];
              const isHealthLoading = healthLoading[srv.id];
              const cmdResult = cmdResults[srv.id];
              const isRunning = cmdRunning[srv.id];

              const cpuPct = parsePercent(health?.cpu);
              const memPct = parsePercent(health?.memory);
              const diskPct = parsePercent(health?.disk);

              return (
                <div
                  key={srv.id}
                  className="bg-dark-800 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors overflow-hidden"
                >
                  {/* Server header row */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer"
                    onClick={() => setExpandedServer(isExpanded ? null : srv.id)}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-dark-900 flex items-center justify-center flex-shrink-0">
                        <Server className="w-5 h-5 text-gray-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-white truncate">{srv.name}</h3>
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />
                            <span className={`text-xs font-medium ${statusInfo.text}`}>{statusInfo.label}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {srv.host}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {srv.user}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-4">
                      {/* Tags */}
                      {srv.tags && srv.tags.length > 0 && (
                        <div className="hidden md:flex items-center gap-1.5">
                          {srv.tags.map(tag => (
                            <span
                              key={tag}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-primary-600/20 text-primary-400 font-medium"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Health mini indicators */}
                      {health && (
                        <div className="hidden lg:flex items-center gap-3 text-xs text-gray-400">
                          {cpuPct != null && (
                            <span className="flex items-center gap-1">
                              <Cpu className="w-3 h-3" />
                              {cpuPct.toFixed(0)}%
                            </span>
                          )}
                          {memPct != null && (
                            <span className="flex items-center gap-1">
                              <Activity className="w-3 h-3" />
                              {memPct.toFixed(0)}%
                            </span>
                          )}
                          {diskPct != null && (
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              {diskPct.toFixed(0)}%
                            </span>
                          )}
                        </div>
                      )}

                      {isExpanded
                        ? <ChevronUp className="w-5 h-5 text-gray-500" />
                        : <ChevronDown className="w-5 h-5 text-gray-500" />
                      }
                    </div>
                  </div>

                  {/* Expanded panel */}
                  {isExpanded && (
                    <div className="border-t border-gray-800 bg-dark-900/50">
                      {/* Action buttons */}
                      <div className="flex items-center gap-2 p-4 border-b border-gray-800/50 flex-wrap">
                        <button
                          onClick={() => fetchHealth(srv.id)}
                          disabled={isHealthLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-dark-800 border border-gray-700 hover:border-gray-600 transition-colors disabled:opacity-50"
                        >
                          {isHealthLoading
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <RefreshCw className="w-3.5 h-3.5" />
                          }
                          Health Check
                        </button>
                        <button
                          onClick={() => {
                            if (removeConfirm === srv.id) {
                              handleRemove(srv.id);
                            } else {
                              setRemoveConfirm(srv.id);
                              setTimeout(() => setRemoveConfirm(prev => prev === srv.id ? null : prev), 4000);
                            }
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border transition-colors ${
                            removeConfirm === srv.id
                              ? 'bg-red-600/20 border-red-600 text-red-400 hover:bg-red-600/30'
                              : 'bg-dark-800 border-gray-700 text-gray-400 hover:border-red-600/50 hover:text-red-400'
                          }`}
                        >
                          {removeConfirm === srv.id
                            ? <><AlertTriangle className="w-3.5 h-3.5" /> Confirm Remove</>
                            : <><Trash2 className="w-3.5 h-3.5" /> Remove</>
                          }
                        </button>

                        {/* Tags on mobile */}
                        {srv.tags && srv.tags.length > 0 && (
                          <div className="flex md:hidden items-center gap-1.5 ml-auto">
                            <Tag className="w-3 h-3 text-gray-500" />
                            {srv.tags.map(tag => (
                              <span
                                key={tag}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-primary-600/20 text-primary-400 font-medium"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Health data */}
                      {health && (
                        <div className="p-4 border-b border-gray-800/50">
                          <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-green-400" />
                            Health Status
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {/* Uptime */}
                            <div className="bg-dark-800 rounded-lg p-3 border border-gray-800">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Clock className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-xs text-gray-500">Uptime</span>
                              </div>
                              <p className="text-sm font-semibold text-blue-400">
                                {typeof health.uptime === 'number' ? formatUptime(health.uptime) : health.uptime ?? '--'}
                              </p>
                            </div>

                            {/* CPU */}
                            <div className="bg-dark-800 rounded-lg p-3 border border-gray-800">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Cpu className="w-3.5 h-3.5 text-purple-400" />
                                <span className="text-xs text-gray-500">CPU</span>
                              </div>
                              {cpuPct != null ? (
                                <>
                                  <p className="text-sm font-semibold text-purple-400 mb-1">{cpuPct.toFixed(1)}%</p>
                                  <div className="w-full h-1.5 bg-dark-950 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${percentBarColor(cpuPct)}`}
                                      style={{ width: `${Math.min(cpuPct, 100)}%` }}
                                    />
                                  </div>
                                </>
                              ) : (
                                <p className="text-sm text-gray-500">--</p>
                              )}
                            </div>

                            {/* Memory */}
                            <div className="bg-dark-800 rounded-lg p-3 border border-gray-800">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                                <span className="text-xs text-gray-500">Memory</span>
                              </div>
                              {memPct != null ? (
                                <>
                                  <p className="text-sm font-semibold text-cyan-400 mb-1">{memPct.toFixed(1)}%</p>
                                  <div className="w-full h-1.5 bg-dark-950 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${percentBarColor(memPct)}`}
                                      style={{ width: `${Math.min(memPct, 100)}%` }}
                                    />
                                  </div>
                                </>
                              ) : (
                                <p className="text-sm text-gray-500">--</p>
                              )}
                            </div>

                            {/* Disk */}
                            <div className="bg-dark-800 rounded-lg p-3 border border-gray-800">
                              <div className="flex items-center gap-1.5 mb-1">
                                <HardDrive className="w-3.5 h-3.5 text-orange-400" />
                                <span className="text-xs text-gray-500">Disk</span>
                              </div>
                              {diskPct != null ? (
                                <>
                                  <p className="text-sm font-semibold text-orange-400 mb-1">{diskPct.toFixed(1)}%</p>
                                  <div className="w-full h-1.5 bg-dark-950 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${percentBarColor(diskPct)}`}
                                      style={{ width: `${Math.min(diskPct, 100)}%` }}
                                    />
                                  </div>
                                </>
                              ) : (
                                <p className="text-sm text-gray-500">--</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Execute Command */}
                      <div className="p-4">
                        <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                          <Terminal className="w-4 h-4 text-yellow-400" />
                          Execute Command
                        </h4>
                        <div className="flex gap-2">
                          <input
                            value={cmdInput[srv.id] ?? ''}
                            onChange={e => setCmdInput(prev => ({ ...prev, [srv.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter' && !isRunning) execCommand(srv.id); }}
                            placeholder="ls -la /var/log"
                            className="flex-1 p-2.5 rounded bg-dark-800 border border-gray-700 text-white text-sm font-mono focus:border-primary-500 focus:outline-none"
                          />
                          <button
                            onClick={() => execCommand(srv.id)}
                            disabled={isRunning || !cmdInput[srv.id]?.trim()}
                            className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 rounded hover:bg-primary-700 transition-colors disabled:opacity-50 font-medium text-sm"
                          >
                            {isRunning
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Terminal className="w-4 h-4" />
                            }
                            Run
                          </button>
                        </div>

                        {/* Command output */}
                        {cmdResult && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-500">Output</span>
                              <span className={`text-xs font-mono ${cmdResult.exitCode === 0 ? 'text-green-400' : 'text-red-400'}`}>
                                exit: {cmdResult.exitCode}
                              </span>
                            </div>
                            <div className="bg-dark-950 rounded border border-gray-800 p-3 max-h-64 overflow-y-auto">
                              <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all">
                                {cmdResult.output || '(no output)'}
                              </pre>
                            </div>
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
    </div>
  );
}

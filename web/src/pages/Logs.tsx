import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';
import { ScrollText, Search, RefreshCw, Loader2, AlertTriangle, Info, Bug, XCircle } from 'lucide-react';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: any;
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLogs();
  }, [level]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, level]);

  const loadLogs = async () => {
    try {
      const data = await api.getLogs({ level: level || undefined, limit: 200, search: search || undefined });
      setLogs(data.logs ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleSearch = () => {
    setLoading(true);
    loadLogs();
  };

  const levelColors: Record<string, { text: string; bg: string; icon: React.ElementType }> = {
    error: { text: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
    warn: { text: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: AlertTriangle },
    info: { text: 'text-blue-400', bg: 'bg-blue-500/10', icon: Info },
    debug: { text: 'text-gray-400', bg: 'bg-gray-500/10', icon: Bug },
  };

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('en-US', { hour12: false });
    } catch {
      return ts;
    }
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ScrollText className="w-7 h-7 text-primary-500" />
            <h1 className="text-2xl font-bold">Logs</h1>
            <span className="text-sm text-gray-400">({logs.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 rounded accent-primary-600"
              />
              Auto-refresh
            </label>
            <button
              onClick={() => { setLoading(true); loadLogs(); }}
              className="p-2 text-gray-400 hover:text-white hover:bg-dark-800 rounded transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search logs..."
              className="w-full pl-10 p-2.5 rounded bg-dark-800 border border-gray-700 text-white text-sm"
            />
          </div>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="p-2.5 rounded bg-dark-800 border border-gray-700 text-white text-sm min-w-[120px]"
          >
            <option value="">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
        </div>
      </div>

      {/* Log Entries */}
      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {logs.map((log, i) => {
          const lc = levelColors[log.level] ?? levelColors.info;
          const LevelIcon = lc.icon;
          return (
            <div key={i} className={`flex items-start gap-2 px-4 py-2 border-b border-gray-800/50 hover:bg-dark-800/50 ${lc.bg}`}>
              <span className="text-gray-600 shrink-0 w-[72px]">{formatTime(log.timestamp)}</span>
              <LevelIcon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${lc.text}`} />
              <span className={`shrink-0 w-12 uppercase font-bold ${lc.text}`}>{log.level}</span>
              <span className="text-gray-300 break-all">{log.message}</span>
            </div>
          );
        })}

        {logs.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            <ScrollText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No logs found</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { Terminal as TerminalIcon, Loader2, Trash2, Copy, Check } from 'lucide-react';

interface HistoryEntry {
  id: string;
  command: string;
  output: string;
  exitCode: number;
  timestamp: Date;
}

export default function Terminal() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [cwd, setCwd] = useState('');
  const [serverInfo, setServerInfo] = useState<{ hostname: string; user: string; uptime: string } | null>(null);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [copied, setCopied] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load server info on mount
  useEffect(() => {
    api.get<{ hostname: string; user: string; uptime: string; cwd: string }>('/terminal/info')
      .then(data => {
        setServerInfo(data);
        setCwd(data.cwd);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll + focus
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [loading]);

  const execute = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd || loading) return;

    setInput('');
    setHistoryIdx(-1);
    setCmdHistory(prev => [cmd, ...prev].slice(0, 100));

    // Handle local cd command
    if (cmd.startsWith('cd ')) {
      const dir = cmd.slice(3).trim();
      setCwd(prev => {
        if (dir.startsWith('/')) return dir;
        if (dir === '..') return prev.split('/').slice(0, -1).join('/') || '/';
        if (dir === '~') return '/root';
        return `${prev}/${dir}`.replace(/\/+/g, '/');
      });
      setHistory(prev => [...prev, {
        id: crypto.randomUUID(),
        command: cmd,
        output: '',
        exitCode: 0,
        timestamp: new Date(),
      }]);
      return;
    }

    // Handle clear
    if (cmd === 'clear' || cmd === 'cls') {
      setHistory([]);
      return;
    }

    setLoading(true);

    try {
      // Use direct fetch for POST
      const token = localStorage.getItem('token');
      const response = await fetch('/api/terminal/exec', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ command: cmd, cwd }),
      });

      const data = await response.json();

      setHistory(prev => [...prev, {
        id: crypto.randomUUID(),
        command: cmd,
        output: data.output || data.error || '',
        exitCode: data.exitCode ?? (data.error ? 1 : 0),
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      setHistory(prev => [...prev, {
        id: crypto.randomUUID(),
        command: cmd,
        output: `Error: ${err.message}`,
        exitCode: 1,
        timestamp: new Date(),
      }]);
    }

    setLoading(false);
  }, [input, loading, cwd]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      execute();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const newIdx = Math.min(historyIdx + 1, cmdHistory.length - 1);
        setHistoryIdx(newIdx);
        setInput(cmdHistory[newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const newIdx = historyIdx - 1;
        setHistoryIdx(newIdx);
        setInput(cmdHistory[newIdx]);
      } else {
        setHistoryIdx(-1);
        setInput('');
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setHistory([]);
    }
  };

  const copyOutput = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const prompt = serverInfo
    ? `${serverInfo.user}@${serverInfo.hostname}`
    : 'user@server';

  const shortCwd = cwd.replace(/^\/home\/[^/]+/, '~');

  return (
    <div className="flex flex-col h-full bg-[#0d1117]" onClick={() => inputRef.current?.focus()}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#161b22]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
            <TerminalIcon className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white font-mono">SSH Terminal</h1>
            <p className="text-[10px] text-gray-500 font-mono">
              {serverInfo ? `${prompt} · ${serverInfo.uptime}` : 'Connecting...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 font-mono bg-dark-800 px-2 py-1 rounded">
            {shortCwd}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setHistory([]); }}
            disabled={history.length === 0}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-dark-800 rounded-lg transition-colors disabled:opacity-30"
            title="Clear terminal (Ctrl+L)"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal output area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 font-mono text-sm space-y-1">
        {/* Welcome message */}
        {history.length === 0 && !loading && (
          <div className="text-gray-500 space-y-1">
            <p className="text-green-400">ClawdAgent SSH Terminal v1.0</p>
            <p className="text-gray-600">Type any command to execute on the server.</p>
            <p className="text-gray-600">Use <span className="text-amber-400">Arrow Up/Down</span> for history, <span className="text-amber-400">Ctrl+L</span> to clear.</p>
            <p className="text-gray-700 mt-2">---</p>
          </div>
        )}

        {/* Command history */}
        {history.map((entry) => (
          <div key={entry.id} className="group">
            {/* Command line */}
            <div className="flex items-start gap-0">
              <span className="text-green-400 shrink-0">{prompt}</span>
              <span className="text-gray-500 shrink-0">:</span>
              <span className="text-blue-400 shrink-0">{shortCwd}</span>
              <span className="text-gray-500 shrink-0">$ </span>
              <span className="text-white">{entry.command}</span>
            </div>

            {/* Output */}
            {entry.output && (
              <div className="relative">
                <pre className={`whitespace-pre-wrap break-all text-[13px] leading-relaxed pl-0 ${
                  entry.exitCode !== 0 ? 'text-red-400' : 'text-gray-300'
                }`}>
                  {entry.output}
                </pre>
                {/* Copy button */}
                <button
                  onClick={(e) => { e.stopPropagation(); copyOutput(entry.output, entry.id); }}
                  className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-white bg-dark-800 rounded transition-all"
                  title="Copy output"
                >
                  {copied === entry.id
                    ? <Check className="w-3.5 h-3.5 text-green-400" />
                    : <Copy className="w-3.5 h-3.5" />
                  }
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-center gap-2 text-amber-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Executing...</span>
          </div>
        )}

        {/* Active prompt */}
        <div className="flex items-start gap-0">
          <span className="text-green-400 shrink-0">{prompt}</span>
          <span className="text-gray-500 shrink-0">:</span>
          <span className="text-blue-400 shrink-0">{shortCwd}</span>
          <span className="text-gray-500 shrink-0">$ </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            className="flex-1 bg-transparent text-white outline-none caret-green-400 font-mono text-sm disabled:opacity-50"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

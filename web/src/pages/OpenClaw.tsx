import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import {
  Send, User, Loader2, Square, Wifi, WifiOff,
  Terminal, Trash2, AlertCircle, RefreshCw,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  raw?: any;
}

/** Detect RTL text */
function detectDir(text: string): 'rtl' | undefined {
  const rtlChars = text.match(/[\u0590-\u05FF\u0600-\u06FF]/g);
  if (!rtlChars) return undefined;
  const nonSpace = text.replace(/\s/g, '');
  return nonSpace.length > 0 && rtlChars.length / nonSpace.length > 0.3 ? 'rtl' : undefined;
}

export default function OpenClaw() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [connected, setConnected] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check OpenClaw status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const checkStatus = async () => {
    try {
      const res = await api.openclawStatus();
      setConnected(res.connected);
    } catch {
      setConnected(false);
    }
  };

  const addMessage = (role: Message['role'], content: string, raw?: any) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      timestamp: new Date(),
      raw,
    }]);
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    addMessage('user', text);
    setLoading(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000);

    try {
      const res = await api.openclawChat(text);
      addMessage('assistant', res.message);
    } catch (err: any) {
      addMessage('system', `Error: ${err.message}`);
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setLoading(false);
  }, [input, loading]);

  const clearChat = () => setMessages([]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="flex flex-col h-full bg-dark-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-dark-900">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">OpenClaw</h1>
            <p className="text-[10px] text-gray-500">Direct communication</p>
          </div>
          {connected === true ? (
            <span className="flex items-center gap-1 text-xs text-green-400 ml-2">
              <Wifi className="w-3 h-3" /> Connected
            </span>
          ) : connected === false ? (
            <span className="flex items-center gap-1 text-xs text-red-400 ml-2">
              <WifiOff className="w-3 h-3" /> Disconnected
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={checkStatus}
            className="p-2 text-gray-400 hover:text-orange-400 hover:bg-dark-800 rounded-lg transition-colors"
            title="Check status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={clearChat}
            disabled={messages.length === 0}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-dark-800 rounded-lg transition-colors disabled:opacity-30"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status banner */}
      {connected === false && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>OpenClaw is not reachable. Check SSH connection and OPENCLAW_GATEWAY_TOKEN.</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 select-none">
            <div className="w-20 h-20 mb-6 rounded-2xl bg-dark-800 border border-gray-800 flex items-center justify-center">
              <Terminal className="w-10 h-10 text-orange-400 opacity-60" />
            </div>
            <p className="text-2xl font-bold text-gray-400 mb-2">OpenClaw Direct</p>
            <p className="text-sm text-gray-600 mb-1">Send messages directly to OpenClaw</p>
            <p className="text-xs text-gray-700">Separate from the main agent chat</p>
          </div>
        )}

        {messages.map((m) => {
          const isUser = m.role === 'user';
          const isSystem = m.role === 'system';
          const msgDir = detectDir(m.content);

          return (
            <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-end gap-2 max-w-[80%] md:max-w-2xl ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                  isUser ? 'bg-primary-600'
                    : isSystem ? 'bg-red-500/20 border border-red-500/30'
                    : 'bg-orange-500/20 border border-orange-500/30'
                }`}>
                  {isUser ? <User className="w-3.5 h-3.5 text-white" />
                    : isSystem ? <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    : <Terminal className="w-3.5 h-3.5 text-orange-400" />}
                </div>

                <div dir={msgDir} className={`rounded-2xl px-4 py-2.5 ${
                  isUser ? 'bg-primary-600 text-white rounded-br-md'
                    : isSystem ? 'bg-red-500/10 text-red-300 border border-red-500/20 rounded-bl-md'
                    : 'bg-dark-800 text-gray-100 border border-gray-800 rounded-bl-md'
                }`}>
                  {!isUser && !isSystem && (
                    <span className="text-xs font-semibold text-orange-400 block mb-1">OpenClaw</span>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{m.content}</p>
                  <p className={`text-[10px] mt-1 ${isUser ? 'text-white/50' : 'text-gray-500'} ${msgDir === 'rtl' ? 'text-left' : 'text-right'}`} dir="ltr">
                    {formatTime(m.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-end gap-2">
              <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-orange-500/20 border border-orange-500/30">
                <Terminal className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
              </div>
              <div className="bg-dark-800 border border-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
                  <span className="text-xs text-gray-400">
                    {elapsed < 5 ? 'Connecting to OpenClaw...'
                      : elapsed < 15 ? 'OpenClaw is thinking...'
                      : `OpenClaw is processing... (${elapsed}s)`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-800 bg-dark-900">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            dir={detectDir(input) || undefined}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !loading) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Send a message to OpenClaw..."
            rows={1}
            className="flex-1 px-4 py-3 rounded-xl bg-dark-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors resize-none overflow-y-auto"
            style={{ maxHeight: '160px' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="p-3 rounded-xl bg-orange-600 text-white hover:bg-orange-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title="Send"
          >
            {loading ? <Square className="w-5 h-5" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
        <p className="text-center text-[11px] text-gray-600 mt-2">
          Direct to OpenClaw · Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

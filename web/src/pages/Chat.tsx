import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatStore } from '../stores/chat';
import { api } from '../api/client';
import { WsClient } from '../api/websocket';
import {
  Send, Search, Trash2, Bot, User, Loader2, Square,
  MessageSquare, WifiOff, Wifi, X, AlertCircle,
  Brain, ChevronDown, ChevronUp, Plus, PanelLeftClose, PanelLeft, MoreVertical,
  Paperclip, FileText, Image as ImageIcon, File as FileIcon,
  Languages, Sparkles, Palette, Cpu, Wrench, Zap, QrCode, Shield, GitBranch, Cog,
  Monitor, Copy, Check, Download, RotateCcw,
} from 'lucide-react';
import hljs from 'highlight.js/lib/common';
import 'highlight.js/styles/github-dark.css';

const RESPONSE_MODES = [
  { id: 'auto' as const, label: 'אוטומטי', labelEn: 'Auto', icon: Cpu, color: 'text-blue-400', desc: 'המערכת מחליטה' },
  { id: 'quick' as const, label: 'מהיר', labelEn: 'Fast', icon: Zap, color: 'text-yellow-400', desc: 'תגובה מהירה' },
  { id: 'deep' as const, label: 'מעמיק', labelEn: 'Deep', icon: Brain, color: 'text-purple-400', desc: 'ניתוח מלא' },
];

/** Render message content — detects inline images and browser session markers */
function renderMessageContent(content: string) {
  // Strip [session:UUID] markers and track if browser session is active
  const sessionMatch = content.match(/\[session:([a-f0-9-]+)\]/);
  const cleanContent = content.replace(/\[session:[a-f0-9-]+\]\s*/g, '');

  // Match [QR_IMAGE:data:...] or ![alt](data:image/...) or bare data:image/... URLs
  const imagePattern = /\[QR_IMAGE:(data:image\/[^\]]+)\]|!\[[^\]]*\]\((data:image\/[^)]+)\)|(data:image\/\S+)/g;
  const parts: Array<{ type: 'text' | 'image'; value: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = imagePattern.exec(cleanContent)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: cleanContent.slice(lastIndex, match.index) });
    }
    const dataUrl = match[1] || match[2] || match[3];
    parts.push({ type: 'image', value: dataUrl });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleanContent.length) {
    parts.push({ type: 'text', value: cleanContent.slice(lastIndex) });
  }

  // Browser session badge
  const sessionBadge = sessionMatch ? (
    <a
      href="/browser"
      className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 text-xs font-medium rounded-lg border border-teal-500/30 transition-colors"
    >
      <Monitor className="w-3.5 h-3.5" />
      Watch in Browser View
    </a>
  ) : null;

  // No images found — return plain text + badge
  if (parts.length === 1 && parts[0].type === 'text') {
    return (
      <div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{cleanContent}</p>
        {sessionBadge}
      </div>
    );
  }

  return (
    <div className="text-sm leading-relaxed break-words">
      {parts.map((part, i) =>
        part.type === 'image' ? (
          <img
            key={i}
            src={part.value}
            alt="QR Code"
            className="my-2 rounded-lg border border-gray-700 max-w-[280px]"
          />
        ) : (
          <span key={i} className="whitespace-pre-wrap">{part.value}</span>
        )
      )}
      {sessionBadge}
    </div>
  );
}

/** Detect if text is predominantly Hebrew/Arabic → RTL */
function detectDir(text: string): 'rtl' | undefined {
  const rtlChars = text.match(/[\u0590-\u05FF\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/g);
  if (!rtlChars) return undefined;
  const nonSpace = text.replace(/\s/g, '');
  if (nonSpace.length === 0) return undefined;
  return rtlChars.length / nonSpace.length > 0.3 ? 'rtl' : undefined;
}

/** Code block with syntax highlighting + copy button */
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const highlighted = useMemo(() => {
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(code, { language: lang }).value; } catch {}
    }
    try { return hljs.highlightAuto(code).value; } catch {}
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }, [code, lang]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group/code my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1b26] border border-gray-800 rounded-t-lg">
        <span className="text-[10px] text-gray-500 font-mono">{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
        >
          {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      <pre className="bg-[#0d1117] border border-t-0 border-gray-800 rounded-b-lg px-3 py-2 overflow-x-auto text-xs font-mono leading-relaxed">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}

/** Render inline markdown: **bold**, *italic*, `code`, [links](url) */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))|(\*(.+?)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={k++} className="font-semibold text-white">{m[2]}</strong>);
    else if (m[4]) parts.push(<code key={k++} className="px-1 py-0.5 rounded bg-dark-950 text-primary-300 text-xs font-mono">{m[4]}</code>);
    else if (m[6] && m[7]) parts.push(<a key={k++} href={m[7]} target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline">{m[6]}</a>);
    else if (m[9]) parts.push(<em key={k++} className="italic text-gray-200">{m[9]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length <= 1 ? (parts[0] ?? '') : <>{parts}</>;
}

/** Render a text block (non-code-block) with headers, lists, paragraphs */
function renderTextLines(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let ordered = false;

  const flushList = () => {
    if (listItems.length === 0) return;
    const Tag = ordered ? 'ol' : 'ul';
    elements.push(
      <Tag key={`l${elements.length}`} className={`${ordered ? 'list-decimal' : 'list-disc'} ps-5 my-1 space-y-0.5 text-sm`}>
        {listItems.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
      </Tag>
    );
    listItems = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ul = line.match(/^\s*[-*•]\s+(.+)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.+)/);

    if (ul) {
      if (ordered && listItems.length) flushList();
      ordered = false;
      listItems.push(ul[1]);
    } else if (ol) {
      if (!ordered && listItems.length) flushList();
      ordered = true;
      listItems.push(ol[1]);
    } else {
      flushList();

      // ── Markdown table detection ──
      if (/^\|.+\|$/.test(line.trim())) {
        const tableRows: string[][] = [];
        while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
          const cells = lines[i].trim().slice(1, -1).split('|').map(c => c.trim());
          tableRows.push(cells);
          i++;
        }
        i--; // compensate for-loop increment
        const dataRows = tableRows.filter(row => !row.every(c => /^[-:]+$/.test(c)));
        if (dataRows.length > 0) {
          const header = dataRows[0];
          const body = dataRows.slice(1);
          elements.push(
            <div key={`t${elements.length}`} className="overflow-x-auto my-2 rounded-lg border border-gray-700">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-dark-900">
                    {header.map((cell, j) => (
                      <th key={j} className="px-3 py-1.5 text-left text-xs font-semibold text-gray-300 border-b border-gray-700">{renderInline(cell)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-dark-950/50' : 'bg-dark-900/30'}>
                      {row.map((cell, j) => (
                        <td key={j} className="px-3 py-1.5 text-gray-300 border-b border-gray-800">{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      if (line.match(/^###\s+(.+)/)) {
        elements.push(<h5 key={i} className="text-sm font-semibold text-white mt-2 mb-0.5">{renderInline(line.slice(4))}</h5>);
      } else if (line.match(/^##\s+(.+)/)) {
        elements.push(<h4 key={i} className="text-base font-semibold text-white mt-2.5 mb-0.5">{renderInline(line.slice(3))}</h4>);
      } else if (line.match(/^#\s+(.+)/)) {
        elements.push(<h3 key={i} className="text-lg font-bold text-white mt-3 mb-1">{renderInline(line.slice(2))}</h3>);
      } else if (line.match(/^---+$/) || line.match(/^===+$/)) {
        elements.push(<hr key={i} className="border-gray-700 my-2" />);
      } else if (line.trim() === '') {
        if (elements.length > 0) elements.push(<div key={i} className="h-1" />);
      } else {
        elements.push(<p key={i} className="mb-0.5">{renderInline(line)}</p>);
      }
    }
  }
  flushList();
  return elements;
}

/** Render formatted (styled) content — markdown + code blocks + images */
function renderFormattedContent(content: string) {
  // Image pattern (same as renderMessageContent)
  const imagePattern = /\[QR_IMAGE:(data:image\/[^\]]+)\]|!\[[^\]]*\]\((data:image\/[^)]+)\)|(data:image\/\S+)/g;
  // Code block pattern
  const codeBlockPattern = /```(\w*)\n?([\s\S]*?)```/g;

  // Unified split: find all special segments (images + code blocks)
  type Segment = { type: 'text' | 'image' | 'code'; value: string; lang?: string };
  const segments: Segment[] = [];
  let last = 0;

  // Combine both patterns — find earliest match
  const combined = new RegExp(`(${imagePattern.source})|(${codeBlockPattern.source})`, 'g');
  let match: RegExpExecArray | null;
  while ((match = combined.exec(content)) !== null) {
    if (match.index > last) segments.push({ type: 'text', value: content.slice(last, match.index) });

    // Determine which pattern matched
    if (match[0].startsWith('```')) {
      // Code block
      const lang = match[0].match(/^```(\w*)/)?.[1];
      const code = match[0].replace(/^```\w*\n?/, '').replace(/```$/, '').trimEnd();
      segments.push({ type: 'code', value: code, lang: lang || undefined });
    } else {
      // Image
      const url = match[0].match(/data:image\/[^\])\s]+/)?.[0];
      if (url) segments.push({ type: 'image', value: url });
    }
    last = match.index + match[0].length;
  }
  if (last < content.length) segments.push({ type: 'text', value: content.slice(last) });

  return (
    <div className="formatted-msg text-sm leading-relaxed break-words space-y-1">
      {segments.map((seg, i) => {
        if (seg.type === 'code') {
          return <CodeBlock key={i} code={seg.value} lang={seg.lang} />;
        }
        if (seg.type === 'image') {
          return <img key={i} src={seg.value} alt="Image" className="my-2 rounded-lg border border-gray-700 max-w-[280px]" />;
        }
        return <div key={i}>{renderTextLines(seg.value)}</div>;
      })}
    </div>
  );
}

export default function Chat() {
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [showConversations, setShowConversations] = useState(true);
  const [contextMenu, setContextMenu] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progressLog, setProgressLog] = useState<Array<{ type: string; message: string; agent?: string; tool?: string; time: number }>>([]);
  const [isRtl, setIsRtl] = useState(() => localStorage.getItem('clawdagent-rtl') === 'true');
  const [isStyled, setIsStyled] = useState(() => localStorage.getItem('clawdagent-styled') !== 'false');
  const [chatTheme, setChatTheme] = useState<'default' | 'glass'>(() =>
    (localStorage.getItem('clawdagent-theme') as 'default' | 'glass') || 'default'
  );
  const [responseMode, setResponseMode] = useState<'auto' | 'quick' | 'deep'>(() =>
    (localStorage.getItem('clawdagent-response-mode') as 'auto' | 'quick' | 'deep') || 'auto'
  );
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    localStorage.getItem('clawdagent-selected-model') || 'auto'
  );
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [modelList, setModelList] = useState<Array<{ id: string; name: string; provider: string; tier: string; supportsHebrew?: boolean; supportsVision?: boolean }>>([
    { id: 'auto', name: 'Auto', provider: 'auto', tier: 'auto' },
  ]);
  const [streamingText, setStreamingText] = useState('');
  const [showWhatsAppQR, setShowWhatsAppQR] = useState(false);
  const [whatsappQR, setWhatsappQR] = useState<{ qrDataUrl: string | null; status: string } | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);

  const {
    conversations, activeConversationId, isLoading, loadingConversationId,
    getMessages, addMessage, addMessageTo, setConversationLoading, clear,
    newConversation, switchConversation, deleteConversation, renameConversation,
    syncWithServer, loadConversationFromServer,
  } = useChatStore();

  // Track which conversation is awaiting a WS response
  const pendingConvRef = useRef<string | null>(null);
  // Ref to capture progress log for saving into final message
  const progressLogRef = useRef<Array<{ type: string; message: string; agent?: string; tool?: string; time: number }>>([]);

  const messages = useMemo(() => {
    return getMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, activeConversationId, getMessages]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WsClient | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  // ── WhatsApp QR auto-poll: refresh status every 3s while popup shows a QR ──
  useEffect(() => {
    if (!showWhatsAppQR || !whatsappQR?.qrDataUrl || whatsappQR?.status === 'authenticated') return;
    const interval = setInterval(async () => {
      try {
        const data = await api.whatsappQR();
        if (data.status === 'authenticated') {
          setWhatsappQR({ qrDataUrl: null, status: 'authenticated' });
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [showWhatsAppQR, whatsappQR?.qrDataUrl, whatsappQR?.status]);

  // ── WebSocket lifecycle ──────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const ws = new WsClient();
    wsRef.current = ws;

    ws.onStatus((connected) => {
      setWsConnected(connected);
      if (connected) setWsError(null);
    });

    ws.on('message', (data: { text: string; thinking?: string; agent?: string; tokens?: { input: number; output: number; total: number }; provider?: string; model?: string; elapsed?: number; conversationId?: string }) => {
      // Use conversationId from response (for recovered messages) or from pending ref
      const targetConv = data.conversationId || pendingConvRef.current;
      pendingConvRef.current = null;
      // Capture progress log before clearing
      const savedProgress = progressLogRef.current.filter(ev =>
        !/^(Still working|Working\.\.\.)/.test(ev.message) && ev.message !== 'Processing your message...'
      );
      progressLogRef.current = [];
      setProgressLog([]);
      setStreamingText('');
      if (targetConv) {
        addMessageTo(targetConv, {
          role: 'assistant',
          content: data.text,
          thinking: data.thinking,
          agent: data.agent,
          provider: data.provider,
          model: data.model,
          tokens: data.tokens,
          elapsed: data.elapsed,
          progressLog: savedProgress.length > 0 ? savedProgress : undefined,
        });
      }
      setConversationLoading(null);
    });

    ws.on('error', (data: { message: string }) => {
      const targetConv = pendingConvRef.current;
      pendingConvRef.current = null;
      progressLogRef.current = [];
      setProgressLog([]);
      if (targetConv) {
        addMessageTo(targetConv, {
          role: 'assistant',
          content: `Error: ${data.message}`,
        });
      }
      setConversationLoading(null);
    });

    ws.on('progress', (data: { type: string; message: string; agent?: string; tool?: string }) => {
      const entry = { ...data, time: Date.now() };
      progressLogRef.current = [...progressLogRef.current, entry];
      setProgressLog(prev => [...prev, entry]);
    });

    ws.on('cancelled', () => {
      pendingConvRef.current = null;
      progressLogRef.current = [];
      setProgressLog([]);
      setStreamingText('');
      setConversationLoading(null);
    });

    // ── Streaming text events ──
    ws.on('stream_start', () => {
      setStreamingText('');
    });

    ws.on('text_chunk', (data: { text: string }) => {
      setStreamingText(prev => prev + data.text);
    });

    ws.on('stream_reset', () => {
      setStreamingText('');
    });

    ws.connect(token);

    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, [addMessageTo, setConversationLoading]);

  // ── Auto-scroll on new messages ──────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, streamingText]);

  // ── Focus search input when toggled ──────────────────────────────
  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  // ── Close context menu on outside click ──────────────────────────
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  // ── Close mode menu on outside click ──────────────────────────────
  useEffect(() => {
    if (!showModeMenu) return;
    const close = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setShowModeMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showModeMenu]);

  // ── Close model menu on outside click ────────────────────────────
  useEffect(() => {
    if (!showModelMenu) return;
    const close = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showModelMenu]);

  // ── Fetch available models on mount ────────────────────────────
  useEffect(() => {
    api.getModels().then(data => setModelList(data.models)).catch(() => {});
  }, []);

  // ── Sync conversations from server on mount ──────────────────────
  useEffect(() => {
    syncWithServer();
  }, [syncWithServer]);

  // ── Load conversation messages from server when switching to an empty one ──
  useEffect(() => {
    if (activeConversationId) {
      loadConversationFromServer(activeConversationId);
      // Clear stale streaming text from a different conversation
      setStreamingText('');
    }
  }, [activeConversationId, loadConversationFromServer]);

  // ── Send message (WS primary, REST fallback) ────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    const file = attachedFile;
    if (!text && !file) return;

    // Backend processes one request at a time — block if ANY conversation is loading
    if (loadingConversationId) return;

    // Auto-create conversation if none active
    let convId = activeConversationId;
    if (!convId) {
      convId = newConversation();
    }

    setInput('');
    setAttachedFile(null);
    setProgressLog([]);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const displayText = file
      ? `${text}${text ? '\n' : ''}[${file.name}]`
      : text;
    addMessage({ role: 'user', content: displayText });
    pendingConvRef.current = convId;
    setConversationLoading(convId);

    // If file attached, must use REST API (WebSocket doesn't support binary)
    if (file) {
      try {
        const res = await api.chatWithFile(text, file, convId, responseMode === 'auto' ? undefined : responseMode, selectedModel === 'auto' ? undefined : selectedModel);
        addMessageTo(convId, { role: 'assistant', content: res.message, thinking: res.thinking, agent: res.agent, provider: res.provider, model: res.model, tokens: res.tokens ? { ...res.tokens, total: res.tokens.input + res.tokens.output } : undefined, elapsed: res.elapsed });
      } catch (err: any) {
        addMessageTo(convId, { role: 'assistant', content: `Error: ${err.message}` });
      }
      pendingConvRef.current = null;
      setConversationLoading(null);
      return;
    }

    // Try WebSocket first
    if (wsRef.current && wsConnected) {
      try {
        wsRef.current.send(text, convId, responseMode === 'auto' ? undefined : responseMode, selectedModel === 'auto' ? undefined : selectedModel);
        return; // Response will arrive via WS event handler
      } catch {
        setWsConnected(false);
      }
    }

    // REST API fallback
    try {
      const res = await api.chat(text, convId, responseMode === 'auto' ? undefined : responseMode, selectedModel === 'auto' ? undefined : selectedModel);
      addMessageTo(convId, { role: 'assistant', content: res.message, thinking: res.thinking, agent: res.agent, provider: res.provider, model: res.model, tokens: res.tokens ? { ...res.tokens, total: res.tokens.input + res.tokens.output } : undefined, elapsed: res.elapsed });
    } catch (err: any) {
      addMessageTo(convId, { role: 'assistant', content: `Error: ${err.message}` });
    }
    pendingConvRef.current = null;
    setConversationLoading(null);
  }, [input, attachedFile, loadingConversationId, wsConnected, activeConversationId, addMessage, addMessageTo, setConversationLoading, newConversation, responseMode, selectedModel]);

  // ── Cancel / Stop processing ────────────────────────────────────
  const handleCancel = useCallback(() => {
    if (wsRef.current && wsConnected) {
      wsRef.current.cancel();
    }
    pendingConvRef.current = null;
    setProgressLog([]);
    setConversationLoading(null);
  }, [wsConnected, setConversationLoading]);

  // ── Clear chat with confirmation ─────────────────────────────────
  const handleClear = useCallback(() => {
    if (messages.length === 0) return;
    clear();
  }, [messages.length, clear]);

  // ── New chat handler ─────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    newConversation();
    setProgressLog([]); // Clear progress text (response goes to original conversation)
    inputRef.current?.focus();
  }, [newConversation]);

  // ── Toggle RTL / Styled / Theme ─────────────────────────────────
  const toggleRtl = useCallback(() => {
    setIsRtl(v => { const n = !v; localStorage.setItem('clawdagent-rtl', String(n)); return n; });
  }, []);

  const toggleStyled = useCallback(() => {
    setIsStyled(v => { const n = !v; localStorage.setItem('clawdagent-styled', String(n)); return n; });
  }, []);

  const toggleTheme = useCallback(() => {
    setChatTheme(v => { const n = v === 'default' ? 'glass' : 'default'; localStorage.setItem('clawdagent-theme', n); return n; });
  }, []);

  // ── Export conversation ────────────────────────────────────────
  const handleExport = useCallback((format: 'md' | 'json') => {
    if (messages.length === 0) return;
    const conv = conversations.find(c => c.id === activeConversationId);
    const title = conv?.title || 'conversation';
    let content: string;
    let mime: string;
    let ext: string;

    if (format === 'json') {
      content = JSON.stringify({ title, exportedAt: new Date().toISOString(), messages: messages.map(m => ({
        role: m.role, content: m.content, agent: m.agent, model: m.model, tokens: m.tokens, elapsed: m.elapsed, timestamp: m.timestamp,
      })) }, null, 2);
      mime = 'application/json';
      ext = 'json';
    } else {
      const lines = [`# ${title}\n`, `_Exported ${new Date().toLocaleString()}_\n`];
      for (const m of messages) {
        lines.push(`---\n`);
        lines.push(`**${m.role === 'user' ? 'User' : (m.agent || 'Assistant')}** _(${new Date(m.timestamp).toLocaleTimeString()})_\n`);
        lines.push(m.content + '\n');
      }
      content = lines.join('\n');
      mime = 'text/markdown';
      ext = 'md';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9\u0590-\u05FF-_ ]/g, '')}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, conversations, activeConversationId]);

  // ── Retry last user message ────────────────────────────────────
  const handleRetry = useCallback((messageId: string) => {
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx < 0) return;
    // Find the user message before this assistant message
    for (let j = idx - 1; j >= 0; j--) {
      if (messages[j].role === 'user') {
        setInput(messages[j].content);
        inputRef.current?.focus();
        break;
      }
    }
  }, [messages]);

  // ── Switch conversation — free switch, no cancel ───────────────
  const handleSwitchConversation = useCallback((id: string) => {
    if (id === activeConversationId) return;
    switchConversation(id);
    setProgressLog([]); // Clear progress text for the new view
  }, [activeConversationId, switchConversation]);

  // ── Filtered messages for search ─────────────────────────────────
  const filteredMessages = searchQuery.trim()
    ? messages.filter(m =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.agent?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  // ── Format timestamp HH:MM ───────────────────────────────────────
  const formatTime = (date: Date) => {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  // ── Format date for conversation list ────────────────────────────
  const formatDate = (date: Date) => {
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return formatTime(d);
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex h-full bg-dark-950">
      {/* ── Conversations Sidebar ──────────────────────────────── */}
      {showConversations && (
        <div className="w-64 shrink-0 flex flex-col border-r border-gray-800 bg-dark-900 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:shadow-2xl max-md:shadow-black/50">
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-3 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-gray-300">Conversations</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewChat}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
                title="New chat"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowConversations(false)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
                title="Hide panel"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {conversations.length === 0 && (
              <div className="text-center py-8 text-gray-600 text-xs">
                No conversations yet
              </div>
            )}
            {conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => handleSwitchConversation(conv.id)}
                className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  conv.id === activeConversationId
                    ? 'bg-primary-600/20 text-white border border-primary-500/30'
                    : 'text-gray-400 hover:bg-dark-800 hover:text-gray-200 border border-transparent'
                }`}
              >
                {loadingConversationId === conv.id ? (
                  <Loader2 className="w-4 h-4 shrink-0 text-primary-400 animate-spin" />
                ) : (
                  <MessageSquare className="w-4 h-4 shrink-0 opacity-50" />
                )}
                <div className="flex-1 min-w-0">
                  {editingTitle === conv.id ? (
                    <input
                      autoFocus
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onBlur={() => {
                        if (editTitleValue.trim()) renameConversation(conv.id, editTitleValue.trim());
                        setEditingTitle(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (editTitleValue.trim()) renameConversation(conv.id, editTitleValue.trim());
                          setEditingTitle(null);
                        }
                        if (e.key === 'Escape') setEditingTitle(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-dark-800 border border-primary-500 rounded px-1.5 py-0.5 text-xs text-white outline-none"
                    />
                  ) : (
                    <>
                      <p className="text-xs font-medium truncate">{conv.title}</p>
                      <p className="text-[10px] text-gray-500">{conv.messages.length} msgs · {formatDate(conv.updatedAt)}</p>
                    </>
                  )}
                </div>

                {/* Context menu button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setContextMenu(contextMenu === conv.id ? null : conv.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-white rounded transition-all"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>

                {/* Context menu dropdown */}
                {contextMenu === conv.id && (
                  <div className="absolute right-0 top-full mt-1 z-20 bg-dark-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[120px]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditTitleValue(conv.title);
                        setEditingTitle(conv.id);
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-dark-700 transition-colors"
                    >
                      Rename
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conv.id);
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-dark-700 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main Chat Area ─────────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col min-w-0 relative"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) setAttachedFile(file);
        }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-dark-900">
          <div className="flex items-center gap-3">
            {!showConversations && (
              <button
                onClick={() => setShowConversations(true)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors mr-1"
                title="Show conversations"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
            <MessageSquare className="w-6 h-6 text-primary-500" />
            <h1 className="text-lg font-bold text-white">Chat</h1>
            {wsConnected ? (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <Wifi className="w-3 h-3" /> Live
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-yellow-400">
                <WifiOff className="w-3 h-3" /> REST
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* New chat */}
            <button
              onClick={handleNewChat}
              className="p-2 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
              title="New chat"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Search toggle */}
            <button
              onClick={() => { setShowSearch(s => !s); setSearchQuery(''); }}
              className="p-2 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
              title="Search messages"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Clear chat */}
            <button
              onClick={handleClear}
              disabled={messages.length === 0}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-dark-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Export conversation */}
            <div className="relative group/export">
              <button
                disabled={messages.length === 0}
                className="p-2 text-gray-400 hover:text-primary-400 hover:bg-dark-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Export conversation"
              >
                <Download className="w-4 h-4" />
              </button>
              <div className="absolute top-full right-0 mt-1 bg-dark-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden min-w-[140px] z-50 hidden group-hover/export:block">
                <button
                  onClick={() => handleExport('md')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-dark-700 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" /> Markdown
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-dark-700 transition-colors"
                >
                  <FileIcon className="w-3.5 h-3.5" /> JSON
                </button>
              </div>
            </div>

            {/* WhatsApp QR */}
            <button
              onClick={async () => {
                setShowWhatsAppQR(true);
                setWhatsappLoading(true);
                try {
                  const data = await api.whatsappQR();
                  setWhatsappQR({ qrDataUrl: data.qrDataUrl, status: data.status });
                } catch {
                  setWhatsappQR({ qrDataUrl: null, status: 'error' });
                }
                setWhatsappLoading(false);
              }}
              className="p-2 text-gray-400 hover:text-green-400 hover:bg-dark-800 rounded-lg transition-colors"
              title="WhatsApp QR"
            >
              <QrCode className="w-4 h-4" />
            </button>

            {/* Divider */}
            <div className="w-px h-5 bg-gray-700 mx-0.5" />

            {/* RTL toggle */}
            <button
              onClick={toggleRtl}
              className={`p-2 rounded-lg transition-colors ${
                isRtl
                  ? 'text-primary-400 bg-primary-500/15 hover:bg-primary-500/25'
                  : 'text-gray-400 hover:text-white hover:bg-dark-800'
              }`}
              title={isRtl ? 'Switch to LTR' : 'Switch to RTL (Hebrew)'}
            >
              <Languages className="w-4 h-4" />
            </button>

            {/* Styled text toggle */}
            <button
              onClick={toggleStyled}
              className={`p-2 rounded-lg transition-colors ${
                isStyled
                  ? 'text-amber-400 bg-amber-500/15 hover:bg-amber-500/25'
                  : 'text-gray-400 hover:text-white hover:bg-dark-800'
              }`}
              title={isStyled ? 'Plain text mode' : 'Styled text mode'}
            >
              <Sparkles className="w-4 h-4" />
            </button>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg transition-colors ${
                chatTheme === 'glass'
                  ? 'text-purple-400 bg-purple-500/15 hover:bg-purple-500/25'
                  : 'text-gray-400 hover:text-white hover:bg-dark-800'
              }`}
              title={chatTheme === 'glass' ? 'Default theme' : 'Glass theme'}
            >
              <Palette className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Search bar (collapsible) ───────────────────────── */}
        {showSearch && (
          <div className="px-4 py-2 border-b border-gray-800 bg-dark-900">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="w-full pl-10 pr-8 py-2 rounded-lg bg-dark-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="text-xs text-gray-500 mt-1">
                {filteredMessages.length} result{filteredMessages.length !== 1 ? 's' : ''} found
              </p>
            )}
          </div>
        )}

        {/* ── WS Error Banner ────────────────────────────────── */}
        {wsError && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{wsError} -- using REST API fallback</span>
            <button
              onClick={() => setWsError(null)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── Messages Area ──────────────────────────────────── */}
        <div className={`flex-1 overflow-y-auto px-4 py-6 space-y-4 ${chatTheme === 'glass' ? 'chat-glass' : ''}`}>
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 select-none">
              <div className="w-20 h-20 mb-6 rounded-2xl bg-dark-800 border border-gray-800 flex items-center justify-center">
                <Bot className="w-10 h-10 text-primary-500 opacity-60" />
              </div>
              <p className="text-2xl font-bold text-gray-400 mb-2">ClawdAgent</p>
              <p className="text-sm text-gray-600">Send a message to start</p>
            </div>
          )}

          {/* Search empty state */}
          {messages.length > 0 && filteredMessages.length === 0 && searchQuery && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Search className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-sm">No messages match "{searchQuery}"</p>
            </div>
          )}

          {/* Message bubbles */}
          {filteredMessages.map((m) => {
            const isUser = m.role === 'user';
            const msgDir = isRtl ? 'rtl' : (detectDir(m.content) || undefined);
            const isGlass = chatTheme === 'glass';

            return (
              <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex items-end gap-2 max-w-[80%] md:max-w-2xl ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar */}
                  <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    isUser
                      ? (isGlass ? 'bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/20' : 'bg-primary-600')
                      : (isGlass ? 'bg-dark-800/80 border border-gray-600/50 backdrop-blur-sm' : 'bg-dark-800 border border-gray-700')
                  }`}>
                    {isUser
                      ? <User className="w-3.5 h-3.5 text-white" />
                      : <Bot className="w-3.5 h-3.5 text-primary-400" />
                    }
                  </div>

                  {/* Bubble — dir goes HERE for text direction only */}
                  <div dir={msgDir} className={`group relative rounded-2xl px-4 py-2.5 ${
                    isUser
                      ? (isGlass
                        ? 'bg-gradient-to-br from-primary-600/90 to-primary-700/90 text-white rounded-br-md backdrop-blur-sm shadow-lg shadow-primary-600/10 border border-primary-500/30'
                        : 'bg-primary-600 text-white rounded-br-md')
                      : (isGlass
                        ? 'bg-dark-800/60 text-gray-100 border border-gray-700/50 rounded-bl-md backdrop-blur-md shadow-lg shadow-black/20'
                        : 'bg-dark-800 text-gray-100 border border-gray-800 rounded-bl-md')
                  }`}>
                    {/* Agent name + provider badge */}
                    {!isUser && m.agent && (
                      <div className={`flex items-center gap-2 mb-1.5 ${msgDir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                        <span className={`text-xs font-semibold ${isGlass ? 'text-primary-300' : 'text-primary-400'}`}>{m.agent}</span>
                        {m.provider && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            isGlass ? 'bg-primary-400/10 text-primary-200 border border-primary-400/20' : 'bg-primary-500/15 text-primary-300'
                          }`}>
                            {m.provider}
                          </span>
                        )}
                        {(m as any).modelDisplay && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            isGlass ? 'bg-amber-400/10 text-amber-200 border border-amber-400/20' : 'bg-amber-500/15 text-amber-300'
                          }`} title={`Model: ${(m as any).modelDisplay}`}>
                            🤖 {(m as any).modelDisplay}
                          </span>
                        )}
                      </div>
                    )}

                    {/* THINKING — always visible, collapsible */}
                    {!isUser && m.thinking && (
                      <div className="mb-2">
                        <button
                          onClick={() => setExpandedThinking(prev => {
                            const next = new Set(prev);
                            const key = `${m.id}_collapsed`;
                            if (prev.has(key)) {
                              next.delete(key);
                            } else {
                              next.add(key);
                            }
                            return next;
                          })}
                          className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                            isGlass ? 'text-amber-300/90 hover:text-amber-200' : 'text-amber-400 hover:text-amber-300'
                          }`}
                        >
                          <Brain className="w-3.5 h-3.5" />
                          <span>THINKING</span>
                          {expandedThinking.has(`${m.id}_collapsed`)
                            ? <ChevronDown className="w-3 h-3" />
                            : <ChevronUp className="w-3 h-3" />
                          }
                        </button>
                        {/* Default: expanded (shown). Only hide if _collapsed flag is set */}
                        {!expandedThinking.has(`${m.id}_collapsed`) && (
                          <div className={`mt-1.5 px-3 py-2 rounded-lg text-[12px] whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto ${
                            isGlass
                              ? 'bg-amber-500/8 border border-amber-500/20 text-amber-200/80 backdrop-blur-sm'
                              : 'bg-amber-500/8 border border-amber-500/15 text-amber-200/80'
                          }`}>
                            {m.thinking}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Progress Log — saved pipeline steps */}
                    {!isUser && m.progressLog && m.progressLog.length > 0 && (
                      <div className="mb-2">
                        <button
                          onClick={() => setExpandedThinking(prev => {
                            const next = new Set(prev);
                            if (prev.has(`${m.id}_progress_collapsed`)) {
                              next.delete(`${m.id}_progress_collapsed`);
                            } else {
                              next.add(`${m.id}_progress_collapsed`);
                            }
                            return next;
                          })}
                          className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                            isGlass ? 'text-cyan-300/90 hover:text-cyan-200' : 'text-cyan-400 hover:text-cyan-300'
                          }`}
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          <span>{m.progressLog.filter(e => e.type === 'tool').length} STEPS</span>
                          {expandedThinking.has(`${m.id}_progress_collapsed`)
                            ? <ChevronDown className="w-3 h-3" />
                            : <ChevronUp className="w-3 h-3" />
                          }
                        </button>
                        {!expandedThinking.has(`${m.id}_progress_collapsed`) && (
                          <div className={`mt-1.5 px-3 py-2 rounded-lg text-[11px] leading-relaxed max-h-48 overflow-y-auto space-y-1 ${
                            isGlass
                              ? 'bg-cyan-500/5 border border-cyan-500/15 backdrop-blur-sm'
                              : 'bg-cyan-500/5 border border-cyan-500/10'
                          }`}>
                            {m.progressLog.map((ev, i) => {
                              const isToolEv = ev.type === 'tool';
                              const isError = ev.type === 'error';
                              return (
                                <div key={i} className="flex items-start gap-1.5">
                                  <span className={`shrink-0 mt-0.5 ${
                                    isError ? 'text-red-400' : isToolEv ? 'text-green-400' : 'text-cyan-400/70'
                                  }`}>
                                    {isError ? '✗' : isToolEv ? '⚡' : '›'}
                                  </span>
                                  <span className={isError ? 'text-red-300/80' : isToolEv ? 'text-green-300/80' : 'text-gray-400'}>{ev.message}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Content — styled or plain */}
                    {!isUser && isStyled
                      ? renderFormattedContent(m.content)
                      : renderMessageContent(m.content)
                    }

                    {/* Metadata footer — cost, tokens, model, time */}
                    {!isUser && m.tokens && (
                      <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 pt-1.5 border-t ${
                        isGlass ? 'border-gray-600/30' : 'border-gray-700/50'
                      }`} dir="ltr">
                        <span className={`text-[10px] font-mono ${isGlass ? 'text-emerald-300/70' : 'text-emerald-400/70'}`}>
                          💰 {(() => {
                            const t = m.tokens!;
                            const pricing: Record<string, { i: number; o: number }> = {
                              'claude-opus-4-6': { i: 0.005, o: 0.025 },
                              'claude-sonnet-4-6': { i: 0.003, o: 0.015 },
                              'claude-haiku-4-5': { i: 0.001, o: 0.005 },
                            };
                            const mod = m.model ?? '';
                            const key = Object.keys(pricing).find(k => mod.includes(k));
                            const p = key ? pricing[key] : null;
                            if (!p) return 'N/A';
                            const cost = (t.input / 1000) * p.i + (t.output / 1000) * p.o;
                            return cost === 0 ? 'Free' : `$${cost.toFixed(4)}`;
                          })()}
                        </span>
                        <span className={`text-[10px] font-mono ${isGlass ? 'text-blue-300/70' : 'text-blue-400/70'}`}>
                          📊 {m.tokens.total.toLocaleString()} tokens ({m.tokens.input.toLocaleString()}↓ {m.tokens.output.toLocaleString()}↑)
                        </span>
                        <span className={`text-[10px] font-mono ${isGlass ? 'text-amber-300/70' : 'text-amber-400/70'}`}>
                          🤖 {m.agent ?? '?'} · {m.model ? m.model.replace(/^anthropic\//, '').replace(/^openai\//, '').replace(/:free$/, ' (free)').split('/').pop() : m.provider ?? '?'}
                        </span>
                        {m.elapsed != null && (
                          <span className={`text-[10px] font-mono ${isGlass ? 'text-purple-300/70' : 'text-purple-400/70'}`}>
                            ⏱️ {m.elapsed}s
                          </span>
                        )}
                      </div>
                    )}

                    {/* Timestamp + Message Actions */}
                    <div className={`flex items-center gap-2 mt-1 ${msgDir === 'rtl' ? 'flex-row-reverse' : ''}`} dir="ltr">
                      <p className={`text-[10px] ${
                        isUser ? 'text-white/50' : (isGlass ? 'text-gray-400' : 'text-gray-500')
                      }`}>
                        {formatTime(m.timestamp)}
                      </p>
                      {/* Action buttons — visible on hover */}
                      {!isUser && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(m.content);
                            }}
                            className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700/50 transition-colors"
                            title="Copy message"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleRetry(m.id)}
                            className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700/50 transition-colors"
                            title="Retry"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Streaming text — token-by-token display */}
          {isLoading && streamingText && (
            <div className="flex justify-start">
              <div className="flex items-end gap-2 max-w-[80%] md:max-w-2xl">
                <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-dark-800 border border-gray-700">
                  <Bot className="w-3.5 h-3.5 text-primary-400" />
                </div>
                <div dir={detectDir(streamingText) || undefined} className="bg-dark-800 text-gray-100 border border-gray-800 rounded-2xl rounded-bl-md px-4 py-2.5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{streamingText}<span className="inline-block w-1.5 h-4 bg-primary-400 animate-pulse ml-0.5 align-text-bottom" /></p>
                </div>
              </div>
            </div>
          )}

          {/* Live progress — pipeline stages with component badges */}
          {isLoading && (() => {
            // Filter: skip "Still working..." / "Working..." keepalive spam, keep real events
            const realEvents = progressLog.filter(ev =>
              !/^(Still working|Working\.\.\.)/.test(ev.message) && ev.message !== 'Processing your message...'
            );
            const lastKeepAlive = progressLog.filter(ev => /working/i.test(ev.message)).pop();
            const currentAgent = [...realEvents].reverse().find(ev => ev.agent)?.agent;
            const elapsed = lastKeepAlive?.message.match(/(\d+)s/)?.[1] || (realEvents.length > 0 ? Math.round((Date.now() - realEvents[0].time) / 1000) : 0);
            const toolCount = realEvents.filter(ev => ev.type === 'tool').length;
            const errorCount = realEvents.filter(ev => ev.type === 'error' || ev.message.includes('failed')).length;
            // Show only last 6 real events (newest at bottom)
            const visible = realEvents.slice(-6);

            // Parse component label from message: "🔀 Router — classifying..." → { badge: "Router", action: "classifying..." }
            const parseEvent = (msg: string) => {
              // Match: emoji + space + ComponentName + " — " + action
              const m = msg.match(/^[^\w]*\s*(\S+)\s*—\s*(.+)$/);
              if (m) return { badge: m[1], action: m[2] };
              // Match: emoji + space + Component: detail — action
              const m2 = msg.match(/^[^\w]*\s*(\S+:\s*\S+)\s*—\s*(.+)$/);
              if (m2) return { badge: m2[1], action: m2[2] };
              return { badge: '', action: msg };
            };

            // Badge styling per component type
            const badgeStyle = (badge: string, evType: string) => {
              const b = badge.toLowerCase();
              if (b.includes('router') || evType === 'status' && b.includes('router'))
                return { bg: 'bg-violet-500/20 text-violet-300 border-violet-500/30', icon: <GitBranch className="w-2.5 h-2.5" /> };
              if (b.includes('agent') || evType === 'agent' || b.includes('assistant') || b.includes('general') || b.includes('code'))
                return { bg: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: <Cpu className="w-2.5 h-2.5" /> };
              if (b.includes('engine'))
                return { bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', icon: <Cog className="w-2.5 h-2.5" /> };
              if (b.includes('tool') || evType === 'tool')
                return { bg: 'bg-green-500/20 text-green-300 border-green-500/30', icon: <Wrench className="w-2.5 h-2.5" /> };
              if (b.includes('intelligence') || b.includes('meta') || evType === 'thinking')
                return { bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: <Brain className="w-2.5 h-2.5" /> };
              if (b.includes('security') || b.includes('safety'))
                return { bg: 'bg-rose-500/20 text-rose-300 border-rose-500/30', icon: <Shield className="w-2.5 h-2.5" /> };
              if (b.includes('fast') || b.includes('api') || b.includes('provider') || b.includes('claude') || b.includes('openrouter'))
                return { bg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', icon: <Zap className="w-2.5 h-2.5" /> };
              if (evType === 'error')
                return { bg: 'bg-red-500/20 text-red-300 border-red-500/30', icon: <AlertCircle className="w-2.5 h-2.5" /> };
              return { bg: 'bg-gray-500/20 text-gray-300 border-gray-500/30', icon: <Zap className="w-2.5 h-2.5" /> };
            };

            // Detect which pipeline stages have been hit
            const stageHits = {
              router: realEvents.some(e => e.message.toLowerCase().includes('router')),
              agent: realEvents.some(e => e.type === 'agent' || e.message.toLowerCase().includes('agent') || e.message.toLowerCase().includes('assistant')),
              engine: realEvents.some(e => e.message.toLowerCase().includes('engine')),
              provider: realEvents.some(e => e.message.toLowerCase().includes('provider') || e.message.toLowerCase().includes('api') || e.message.toLowerCase().includes('claude') || e.message.toLowerCase().includes('openrouter')),
              tool: realEvents.some(e => e.type === 'tool'),
              security: realEvents.some(e => e.message.toLowerCase().includes('security')),
            };
            const lastEvent = realEvents[realEvents.length - 1];
            const lastMsg = lastEvent?.message.toLowerCase() || '';
            const activeStage = lastMsg.includes('security') ? 'security'
              : lastMsg.includes('tool') || lastEvent?.type === 'tool' ? 'tool'
              : lastMsg.includes('provider') || lastMsg.includes('api') || lastMsg.includes('claude') || lastMsg.includes('openrouter') || lastMsg.includes('generating') ? 'provider'
              : lastMsg.includes('engine') ? 'engine'
              : lastEvent?.type === 'agent' || lastMsg.includes('agent') || lastMsg.includes('assistant') ? 'agent'
              : lastMsg.includes('router') ? 'router' : '';

            return (
              <div className="flex justify-start">
                <div className="flex items-end gap-2 max-w-2xl w-full">
                  <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-dark-800 border border-gray-700">
                    <Bot className="w-3.5 h-3.5 text-primary-400 animate-pulse" />
                  </div>
                  <div className="bg-dark-800/80 border border-gray-800 rounded-2xl rounded-bl-md px-4 py-3 min-w-[280px] max-w-lg backdrop-blur-sm">
                    {/* Header: agent name + stats */}
                    <div className="flex items-center justify-between gap-3 mb-2 pb-1.5 border-b border-gray-800">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 text-primary-400 animate-spin shrink-0" />
                        <span className="text-xs font-medium text-gray-300">
                          {currentAgent || (isRtl ? 'מעבד...' : 'Processing...')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500">
                        {toolCount > 0 && <span>{toolCount} {isRtl ? 'צעדים' : 'steps'}</span>}
                        {errorCount > 0 && <span className="text-red-400">{errorCount} {isRtl ? 'שגיאות' : 'errors'}</span>}
                        {Number(elapsed) > 0 && <span>{elapsed}s</span>}
                      </div>
                    </div>

                    {/* Mini pipeline breadcrumb */}
                    {realEvents.length > 0 && (
                      <div className="flex items-center gap-1 mb-2 flex-wrap">
                        {([
                          { key: 'router', label: 'Router', icon: <GitBranch className="w-2.5 h-2.5" />,
                            active: 'bg-violet-500/30 text-violet-200 border-violet-400/50',
                            hit: 'bg-violet-500/10 text-violet-400/70 border-violet-500/20' },
                          { key: 'agent', label: 'Agent', icon: <Cpu className="w-2.5 h-2.5" />,
                            active: 'bg-blue-500/30 text-blue-200 border-blue-400/50',
                            hit: 'bg-blue-500/10 text-blue-400/70 border-blue-500/20' },
                          { key: 'engine', label: 'Engine', icon: <Cog className="w-2.5 h-2.5" />,
                            active: 'bg-cyan-500/30 text-cyan-200 border-cyan-400/50',
                            hit: 'bg-cyan-500/10 text-cyan-400/70 border-cyan-500/20' },
                          { key: 'provider', label: 'LLM', icon: <Zap className="w-2.5 h-2.5" />,
                            active: 'bg-yellow-500/30 text-yellow-200 border-yellow-400/50',
                            hit: 'bg-yellow-500/10 text-yellow-400/70 border-yellow-500/20' },
                          { key: 'tool', label: 'Tools', icon: <Wrench className="w-2.5 h-2.5" />,
                            active: 'bg-green-500/30 text-green-200 border-green-400/50',
                            hit: 'bg-green-500/10 text-green-400/70 border-green-500/20' },
                          { key: 'security', label: 'Security', icon: <Shield className="w-2.5 h-2.5" />,
                            active: 'bg-rose-500/30 text-rose-200 border-rose-400/50',
                            hit: 'bg-rose-500/10 text-rose-400/70 border-rose-500/20' },
                        ] as { key: string; label: string; icon: JSX.Element; active: string; hit: string }[]).map((stage, idx) => {
                          const isHit = stageHits[stage.key as keyof typeof stageHits];
                          const isActive = activeStage === stage.key;
                          return (
                            <span key={stage.key} className="flex items-center gap-0.5">
                              {idx > 0 && <span className="text-gray-700 text-[9px] mx-0.5">›</span>}
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium border transition-all duration-300 ${
                                isActive ? stage.active :
                                isHit ? stage.hit :
                                'bg-gray-800/50 text-gray-600 border-gray-700/50'
                              }`}>
                                {stage.icon}
                                <span className="hidden sm:inline">{stage.label}</span>
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Event log — with component badges */}
                    {visible.length === 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 animate-pulse">{isRtl ? '...מתחיל לעבוד' : 'Starting...'}</span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {visible.map((ev, i) => {
                          const isLatest = i === visible.length - 1;
                          const { badge, action } = parseEvent(ev.message);
                          const style = badgeStyle(badge, ev.type || 'status');
                          return (
                            <div key={i} className={`flex items-start gap-1.5 transition-all duration-300 ${isLatest ? 'opacity-100' : 'opacity-40'}`}>
                              {badge ? (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 mt-px ${style.bg} ${isLatest ? '' : 'opacity-60'}`}>
                                  {style.icon}
                                  {badge}
                                </span>
                              ) : (
                                <span className={`shrink-0 mt-0.5 ${ev.type === 'error' ? 'text-red-400' : 'text-primary-400'}`}>
                                  <Zap className="w-3 h-3" />
                                </span>
                              )}
                              <span className={`text-[11px] leading-relaxed ${isLatest ? 'text-gray-200' : 'text-gray-500'}`}>
                                {badge ? action : ev.message}
                              </span>
                            </div>
                          );
                        })}
                        {/* Current action spinner */}
                        {visible.length > 0 && (
                          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-800/50">
                            <Loader2 className="w-3 h-3 text-primary-400 animate-spin shrink-0" />
                            <span className="text-[10px] text-gray-400 animate-pulse">
                              {visible[visible.length - 1].type === 'tool'
                                ? (isRtl ? '...מריץ כלי' : 'Running tool...')
                                : visible[visible.length - 1].type === 'thinking'
                                ? (isRtl ? '...חושב' : 'Thinking...')
                                : (isRtl ? '...עובד' : 'Working...')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          <div ref={bottomRef} />
        </div>

        {/* ── WhatsApp QR Popup ──────────────────────────────── */}
        {showWhatsAppQR && (
          <div className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center backdrop-blur-sm" onClick={() => setShowWhatsAppQR(false)}>
            <div className="bg-dark-800 border border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-green-400" />
                  <h3 className="font-semibold text-white">WhatsApp QR</h3>
                </div>
                <button onClick={() => setShowWhatsAppQR(false)} className="text-gray-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {whatsappLoading ? (
                <div className="flex flex-col items-center py-8">
                  <Loader2 className="w-8 h-8 text-green-400 animate-spin mb-3" />
                  <p className="text-sm text-gray-400">Loading QR code...</p>
                </div>
              ) : whatsappQR?.status === 'authenticated' ? (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                    <Wifi className="w-6 h-6 text-green-400" />
                  </div>
                  <p className="text-green-400 font-medium">WhatsApp Connected</p>
                  <p className="text-xs text-gray-500 mt-1">Already authenticated</p>
                </div>
              ) : whatsappQR?.qrDataUrl ? (
                <div className="text-center">
                  <img src={whatsappQR.qrDataUrl} alt="WhatsApp QR Code" className="mx-auto rounded-lg border border-gray-700 max-w-[250px]" />
                  <p className="text-xs text-gray-400 mt-3">Scan with WhatsApp to connect</p>
                  <button
                    onClick={async () => {
                      setWhatsappLoading(true);
                      try {
                        const data = await api.whatsappQR();
                        setWhatsappQR({ qrDataUrl: data.qrDataUrl, status: data.status });
                      } catch { /* ignore */ }
                      setWhatsappLoading(false);
                    }}
                    className="mt-3 px-4 py-2 bg-dark-900 border border-gray-700 rounded-lg text-xs text-gray-300 hover:bg-dark-800 transition-colors"
                  >
                    Refresh QR
                  </button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-gray-400 text-sm">
                    {whatsappQR?.status === 'error' ? 'Failed to load QR code' : 'No QR code available'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">WhatsApp may not be enabled</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Drag & Drop Overlay ────────────────────────────── */}
        {isDragging && (
          <div className="absolute inset-0 z-30 bg-primary-600/10 border-2 border-dashed border-primary-500 rounded-lg flex items-center justify-center backdrop-blur-sm">
            <div className="text-center">
              <Paperclip className="w-12 h-12 text-primary-400 mx-auto mb-3" />
              <p className="text-lg font-semibold text-primary-300">Drop file here</p>
              <p className="text-sm text-gray-400 mt-1">Images, PDFs, documents, code files</p>
            </div>
          </div>
        )}

        {/* ── Input Area ─────────────────────────────────────── */}
        <div className="px-4 py-3 border-t border-gray-800 bg-dark-900">
          {/* File preview */}
          {attachedFile && (
            <div className="max-w-4xl mx-auto mb-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800 border border-gray-700 text-sm">
                {attachedFile.type.startsWith('image/') ? (
                  <ImageIcon className="w-4 h-4 text-green-400 shrink-0" />
                ) : attachedFile.name.endsWith('.pdf') ? (
                  <FileText className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <FileIcon className="w-4 h-4 text-blue-400 shrink-0" />
                )}
                <span className="text-gray-300 truncate max-w-[200px]">{attachedFile.name}</span>
                <span className="text-gray-500 text-xs">({(attachedFile.size / 1024).toFixed(0)}KB)</span>
                <button
                  onClick={() => setAttachedFile(null)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".txt,.md,.csv,.json,.pdf,.docx,.xlsx,.xls,.ts,.js,.py,.jpg,.jpeg,.png,.gif,.webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setAttachedFile(file);
                e.target.value = '';
              }}
            />

            {/* Attach file button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="p-3 rounded-xl text-gray-400 hover:text-primary-400 hover:bg-dark-800 transition-colors disabled:opacity-40 shrink-0"
              title="Attach file (images, PDFs, documents)"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Response mode selector */}
            <div className="relative" ref={modeMenuRef}>
              <button
                onClick={() => setShowModeMenu(v => !v)}
                className={`p-3 rounded-xl hover:bg-dark-800 transition-colors shrink-0 ${
                  responseMode !== 'auto'
                    ? (RESPONSE_MODES.find(m => m.id === responseMode)?.color ?? 'text-gray-400')
                    : 'text-gray-400'
                }`}
                title={`${isRtl ? 'מצב תגובה' : 'Response mode'}: ${RESPONSE_MODES.find(m => m.id === responseMode)?.label ?? 'Auto'}`}
              >
                {responseMode === 'auto' ? <Cpu className="w-5 h-5" /> :
                 responseMode === 'quick' ? <Zap className="w-5 h-5" /> :
                 <Brain className="w-5 h-5" />}
              </button>
              {showModeMenu && (
                <div className="absolute bottom-full mb-2 left-0 bg-dark-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-[170px] z-50">
                  {RESPONSE_MODES.map(mode => {
                    const ModeIcon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => {
                          setResponseMode(mode.id);
                          localStorage.setItem('clawdagent-response-mode', mode.id);
                          setShowModeMenu(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-dark-700 transition-colors ${
                          responseMode === mode.id ? 'bg-dark-700' : ''
                        }`}
                      >
                        <ModeIcon className={`w-4 h-4 ${mode.color}`} />
                        <span className={responseMode === mode.id ? 'text-white font-medium' : 'text-gray-300'}>
                          {isRtl ? mode.label : mode.labelEn}
                        </span>
                        {isRtl && <span className="text-gray-500 text-xs mr-auto">{mode.desc}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Model selector */}
            <div className="relative" ref={modelMenuRef}>
              <button
                onClick={() => setShowModelMenu(v => !v)}
                className={`p-3 rounded-xl hover:bg-dark-800 transition-colors shrink-0 ${
                  selectedModel !== 'auto' ? 'text-green-400' : 'text-gray-400'
                }`}
                title={`${isRtl ? 'מודל' : 'Model'}: ${modelList.find(m => m.id === selectedModel)?.name ?? 'Auto'}`}
              >
                <Bot className="w-5 h-5" />
              </button>
              {showModelMenu && (
                <div className="absolute bottom-full mb-2 left-0 bg-dark-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-[240px] max-h-[400px] overflow-y-auto z-50">
                  {(['auto', 'free', 'cheap', 'mid', 'premium', 'ultra'] as const).map(tier => {
                    const modelsInTier = modelList.filter(m => m.tier === tier);
                    if (modelsInTier.length === 0) return null;
                    const tierLabel: Record<string, string> = {
                      auto: isRtl ? 'אוטומטי' : 'Automatic',
                      free: isRtl ? 'חינמי' : 'Free',
                      cheap: isRtl ? 'חסכוני' : 'Economy',
                      mid: isRtl ? 'סטנדרטי' : 'Standard',
                      premium: isRtl ? 'פרימיום' : 'Premium',
                      ultra: isRtl ? 'אולטרה' : 'Ultra',
                    };
                    const tierColor: Record<string, string> = {
                      auto: 'bg-blue-400', free: 'bg-gray-400', cheap: 'bg-green-400',
                      mid: 'bg-cyan-400', premium: 'bg-amber-400', ultra: 'bg-purple-400',
                    };
                    return (
                      <div key={tier}>
                        <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-dark-900/50 sticky top-0">
                          {tierLabel[tier] ?? tier}
                        </div>
                        {modelsInTier.map(model => (
                          <button
                            key={model.id}
                            onClick={() => {
                              setSelectedModel(model.id);
                              localStorage.setItem('clawdagent-selected-model', model.id);
                              setShowModelMenu(false);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-dark-700 transition-colors ${
                              selectedModel === model.id ? 'bg-dark-700' : ''
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${tierColor[model.tier] ?? 'bg-gray-400'}`} />
                            <span className={`flex-1 text-left truncate ${selectedModel === model.id ? 'text-white font-medium' : 'text-gray-300'}`}>
                              {model.name}
                            </span>
                            {model.provider !== 'auto' && (
                              <span className="text-[10px] text-gray-600 shrink-0">{model.provider}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <textarea
              ref={inputRef}
              value={input}
              dir={isRtl || detectDir(input) === 'rtl' ? 'rtl' : 'ltr'}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && loadingConversationId) {
                  e.preventDefault();
                  handleCancel();
                }
                if (e.key === 'Enter' && !e.shiftKey && !loadingConversationId) {
                  e.preventDefault();
                  send();
                }
              }}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of Array.from(items)) {
                  if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) setAttachedFile(file);
                    break;
                  }
                }
              }}
              placeholder={
                loadingConversationId
                  ? (loadingConversationId === activeConversationId
                    ? (isRtl ? '...מעבד — לחץ Stop או Escape לביטול' : 'Processing... press Stop or Escape to cancel')
                    : (isRtl ? '...שיחה אחרת מעובדת — לחץ Stop לביטול' : 'Another conversation is processing... press Stop to cancel'))
                  : (attachedFile
                    ? (isRtl ? `...הודעה על ${attachedFile.name}` : `Message about ${attachedFile.name}...`)
                    : (isRtl ? '...כתוב הודעה' : 'Type a message...'))
              }
              disabled={false}
              rows={1}
              className={`flex-1 px-4 py-3 rounded-xl border text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors resize-none overflow-y-auto ${
                chatTheme === 'glass'
                  ? 'bg-dark-800/60 border-gray-700/50 backdrop-blur-sm'
                  : 'bg-dark-800 border-gray-700'
              }`}
              style={{ maxHeight: '160px' }}
            />
            {loadingConversationId ? (
              <button
                onClick={handleCancel}
                className="p-3 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors shrink-0"
                title="Stop"
              >
                <Square className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim() && !attachedFile}
                className="p-3 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                title="Send message"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </div>
          <p className="text-center text-[11px] text-gray-600 mt-2 hidden sm:block" dir="ltr">
            Enter to send · Shift+Enter for new line · Paste/drop images & files{!wsConnected && ' · REST fallback'}
          </p>
        </div>
      </div>
    </div>
  );
}

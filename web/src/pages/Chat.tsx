import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatStore } from '../stores/chat';
import { api } from '../api/client';
import { WsClient } from '../api/websocket';
import {
  Send, Search, Trash2, Bot, User, Loader2, Square,
  MessageSquare, WifiOff, Wifi, X, AlertCircle,
  Brain, ChevronDown, ChevronUp, Plus, PanelLeftClose, PanelLeft, MoreVertical,
  Paperclip, FileText, Image as ImageIcon, File as FileIcon,
} from 'lucide-react';

/** Render message content — detects inline images (data URLs, markdown images) */
function renderMessageContent(content: string) {
  // Match [QR_IMAGE:data:...] or ![alt](data:image/...) or bare data:image/... URLs
  const imagePattern = /\[QR_IMAGE:(data:image\/[^\]]+)\]|!\[[^\]]*\]\((data:image\/[^)]+)\)|(data:image\/\S+)/g;
  const parts: Array<{ type: 'text' | 'image'; value: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = imagePattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    const dataUrl = match[1] || match[2] || match[3];
    parts.push({ type: 'image', value: dataUrl });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  // No images found — return plain text
  if (parts.length === 1 && parts[0].type === 'text') {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">{content}</p>;
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
  const [progressStatus, setProgressStatus] = useState<string | null>(null);

  const {
    conversations, activeConversationId, isLoading, loadingConversationId,
    getMessages, addMessage, addMessageTo, setConversationLoading, clear,
    newConversation, switchConversation, deleteConversation, renameConversation,
  } = useChatStore();

  // Track which conversation is awaiting a WS response
  const pendingConvRef = useRef<string | null>(null);

  const messages = useMemo(() => {
    return getMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, activeConversationId, getMessages]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WsClient | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    ws.on('message', (data: { text: string; thinking?: string; agent?: string; tokens?: number; provider?: string; elapsed?: number }) => {
      const targetConv = pendingConvRef.current;
      pendingConvRef.current = null;
      setProgressStatus(null);
      if (targetConv) {
        addMessageTo(targetConv, {
          role: 'assistant',
          content: data.text,
          thinking: data.thinking,
          agent: data.agent,
          provider: data.provider,
        });
      }
      setConversationLoading(null);
    });

    ws.on('error', (data: { message: string }) => {
      const targetConv = pendingConvRef.current;
      pendingConvRef.current = null;
      setProgressStatus(null);
      if (targetConv) {
        addMessageTo(targetConv, {
          role: 'assistant',
          content: `Error: ${data.message}`,
        });
      }
      setConversationLoading(null);
    });

    ws.on('progress', (data: { type: string; message: string; agent?: string; tool?: string }) => {
      setProgressStatus(data.message);
    });

    ws.on('cancelled', () => {
      pendingConvRef.current = null;
      setProgressStatus(null);
      setConversationLoading(null);
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
  }, [messages, isLoading]);

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
    setProgressStatus(null);
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
        const res = await api.chatWithFile(text, file);
        addMessageTo(convId, { role: 'assistant', content: res.message, thinking: res.thinking, agent: res.agent, provider: res.provider });
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
        wsRef.current.send(text);
        return; // Response will arrive via WS event handler
      } catch {
        setWsConnected(false);
      }
    }

    // REST API fallback
    try {
      const res = await api.chat(text);
      addMessageTo(convId, { role: 'assistant', content: res.message, thinking: res.thinking, agent: res.agent, provider: res.provider });
    } catch (err: any) {
      addMessageTo(convId, { role: 'assistant', content: `Error: ${err.message}` });
    }
    pendingConvRef.current = null;
    setConversationLoading(null);
  }, [input, attachedFile, loadingConversationId, wsConnected, activeConversationId, addMessage, addMessageTo, setConversationLoading, newConversation]);

  // ── Cancel / Stop processing ────────────────────────────────────
  const handleCancel = useCallback(() => {
    if (wsRef.current && wsConnected) {
      wsRef.current.cancel();
    }
    pendingConvRef.current = null;
    setProgressStatus(null);
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
    setProgressStatus(null); // Clear progress text (response goes to original conversation)
    inputRef.current?.focus();
  }, [newConversation]);

  // ── Switch conversation — free switch, no cancel ───────────────
  const handleSwitchConversation = useCallback((id: string) => {
    if (id === activeConversationId) return;
    switchConversation(id);
    setProgressStatus(null); // Clear progress text for the new view
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
        <div className="w-64 shrink-0 flex flex-col border-r border-gray-800 bg-dark-900">
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
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
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

            return (
              <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex items-end gap-2 max-w-[80%] md:max-w-2xl ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar */}
                  <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    isUser ? 'bg-primary-600' : 'bg-dark-800 border border-gray-700'
                  }`}>
                    {isUser
                      ? <User className="w-3.5 h-3.5 text-white" />
                      : <Bot className="w-3.5 h-3.5 text-primary-400" />
                    }
                  </div>

                  {/* Bubble */}
                  <div className={`group relative rounded-2xl px-4 py-2.5 ${
                    isUser
                      ? 'bg-primary-600 text-white rounded-br-md'
                      : 'bg-dark-800 text-gray-100 border border-gray-800 rounded-bl-md'
                  }`}>
                    {/* Agent name + provider badge */}
                    {!isUser && m.agent && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-primary-400">{m.agent}</span>
                        {m.provider && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-500/15 text-primary-300 font-medium">
                            {m.provider}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Thinking (collapsible, like Claude Code) */}
                    {!isUser && m.thinking && (
                      <div className="mb-2">
                        <button
                          onClick={() => setExpandedThinking(prev => {
                            const next = new Set(prev);
                            next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                            return next;
                          })}
                          className="flex items-center gap-1.5 text-[11px] text-amber-400/80 hover:text-amber-300 transition-colors"
                        >
                          <Brain className="w-3 h-3" />
                          <span>Thinking</span>
                          {expandedThinking.has(m.id)
                            ? <ChevronUp className="w-3 h-3" />
                            : <ChevronDown className="w-3 h-3" />
                          }
                        </button>
                        {expandedThinking.has(m.id) && (
                          <div className="mt-1.5 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10 text-[12px] text-amber-200/70 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                            {m.thinking}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Content */}
                    {renderMessageContent(m.content)}

                    {/* Timestamp */}
                    <p className={`text-[10px] mt-1 ${
                      isUser ? 'text-white/50 text-right' : 'text-gray-500'
                    }`}>
                      {formatTime(m.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Live progress indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-end gap-2 max-w-2xl">
                <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-dark-800 border border-gray-700">
                  <Bot className="w-3.5 h-3.5 text-primary-400 animate-pulse" />
                </div>
                <div className="bg-dark-800 border border-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-primary-400 animate-spin shrink-0" />
                    <span className="text-sm text-gray-400 animate-pulse">
                      {progressStatus || 'Processing...'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

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

            <textarea
              ref={inputRef}
              value={input}
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
              placeholder={
                loadingConversationId
                  ? (loadingConversationId === activeConversationId
                    ? 'Processing... press Stop or Escape to cancel'
                    : 'Another conversation is processing... press Stop to cancel')
                  : (attachedFile ? `Message about ${attachedFile.name}...` : 'Type a message...')
              }
              disabled={false}
              rows={1}
              className="flex-1 px-4 py-3 rounded-xl bg-dark-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors resize-none overflow-y-auto"
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
          <p className="text-center text-[11px] text-gray-600 mt-2">
            Enter to send · Shift+Enter for new line · Drag & drop files{!wsConnected && ' · REST fallback'}
          </p>
        </div>
      </div>
    </div>
  );
}

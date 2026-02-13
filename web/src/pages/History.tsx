import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import {
  Clock, MessageSquare, Filter, ChevronDown, ChevronUp,
  RefreshCw, Hash, Globe, Send, Loader2, Inbox, User, Bot,
} from 'lucide-react';

interface ConversationMessage {
  role: string;
  content: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  userId: string;
  platform: string;
  startedAt: string;
  lastMessage: string;
  messageCount: number;
  messages?: ConversationMessage[];
}

interface HistoryResponse {
  conversations: Conversation[];
  total: number;
}

const PLATFORMS = ['all', 'telegram', 'web', 'discord'] as const;
const PAGE_SIZE = 20;

// ── Platform visual config ─────────────────────────────────────────
const platformConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  telegram: { icon: Send,  color: 'text-blue-400',   bg: 'bg-blue-500/15',   label: 'Telegram' },
  web:      { icon: Globe, color: 'text-green-400',  bg: 'bg-green-500/15',  label: 'Web' },
  discord:  { icon: Hash,  color: 'text-purple-400', bg: 'bg-purple-500/15', label: 'Discord' },
};

const getPlatformConfig = (platform: string) =>
  platformConfig[platform.toLowerCase()] ?? { icon: Globe, color: 'text-gray-400', bg: 'bg-gray-500/15', label: platform };

// ── Relative time formatter ────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function History() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [platform, setPlatform] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // ── Fetch conversations ──────────────────────────────────────────
  const fetchHistory = useCallback(async (currentOffset: number, append: boolean = false) => {
    try {
      const params: { platform?: string; limit: number; offset: number } = {
        limit: PAGE_SIZE,
        offset: currentOffset,
      };
      if (platform !== 'all') params.platform = platform;

      const data: HistoryResponse = await api.getHistory(params);

      if (append) {
        setConversations(prev => [...prev, ...data.conversations]);
      } else {
        setConversations(data.conversations);
      }
      setTotal(data.total);
    } catch {
      // silently fail - conversations will stay as-is
    }
  }, [platform]);

  // ── Initial load + platform change ───────────────────────────────
  useEffect(() => {
    setLoading(true);
    setOffset(0);
    setExpandedId(null);
    fetchHistory(0).finally(() => setLoading(false));
  }, [fetchHistory]);

  // ── Auto-refresh every 30s ───────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      fetchHistory(0);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  // ── Load more (pagination) ───────────────────────────────────────
  const loadMore = async () => {
    const nextOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    await fetchHistory(nextOffset, true);
    setOffset(nextOffset);
    setLoadingMore(false);
  };

  // ── Manual refresh ───────────────────────────────────────────────
  const refresh = async () => {
    setRefreshing(true);
    setOffset(0);
    await fetchHistory(0);
    setRefreshing(false);
  };

  // ── Toggle expand ────────────────────────────────────────────────
  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const hasMore = conversations.length < total;

  // ── Loading state ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-dark-950">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-800 bg-dark-900">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Clock className="w-7 h-7 text-primary-500" />
            <h1 className="text-2xl font-bold text-white">Conversation History</h1>
            {total > 0 && (
              <span className="text-sm text-gray-400">({total})</span>
            )}
          </div>

          <button
            onClick={refresh}
            disabled={refreshing}
            className="p-2 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* ── Platform filter ────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <div className="flex gap-1">
            {PLATFORMS.map((p) => {
              const isActive = platform === p;
              const cfg = p === 'all' ? null : getPlatformConfig(p);

              return (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-600 text-white'
                      : 'bg-dark-800 text-gray-400 hover:text-white hover:bg-dark-700 border border-gray-800'
                  }`}
                >
                  {p === 'all' ? 'All' : cfg?.label ?? p}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Conversation List ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Empty state */}
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-gray-500">
            <Inbox className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium text-gray-400">No conversations found</p>
            <p className="text-sm mt-1 text-gray-600">
              {platform !== 'all'
                ? `No conversations from ${getPlatformConfig(platform).label} yet`
                : 'Chat history will appear here once conversations are recorded'}
            </p>
          </div>
        )}

        {/* Conversation items */}
        <div className="divide-y divide-gray-800/60">
          {conversations.map((convo) => {
            const isExpanded = expandedId === convo.id;
            const plat = getPlatformConfig(convo.platform);
            const PlatformIcon = plat.icon;

            return (
              <div key={convo.id} className="group">
                {/* ── Conversation row ─────────────────────────── */}
                <button
                  onClick={() => toggleExpand(convo.id)}
                  className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-dark-800/50 transition-colors"
                >
                  {/* Platform icon */}
                  <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${plat.bg}`}>
                    <PlatformIcon className={`w-5 h-5 ${plat.color}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {/* Platform badge */}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${plat.bg} ${plat.color}`}>
                        {plat.label}
                      </span>
                      {/* User ID */}
                      <span className="text-xs text-gray-400 font-mono truncate">{convo.userId}</span>
                    </div>
                    {/* Last message preview */}
                    <p className="text-sm text-gray-300 truncate">{convo.lastMessage}</p>
                  </div>

                  {/* Meta */}
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-xs text-gray-500">{timeAgo(convo.startedAt)}</span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <MessageSquare className="w-3 h-3" />
                      {convo.messageCount}
                    </span>
                  </div>

                  {/* Chevron */}
                  <div className="shrink-0 text-gray-600">
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4" />
                      : <ChevronDown className="w-4 h-4" />
                    }
                  </div>
                </button>

                {/* ── Expanded detail panel ─────────────────────── */}
                {isExpanded && (
                  <div className="px-6 pb-4 bg-dark-900/50 border-t border-gray-800/40">
                    <div className="ml-14 pt-3 space-y-3">
                      {/* Conversation metadata */}
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500 pb-2">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Started {new Date(convo.startedAt).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {convo.messageCount} message{convo.messageCount !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                          <User className="w-3 h-3" />
                          {convo.userId}
                        </span>
                      </div>

                      {/* Messages (if available) or last message preview */}
                      {convo.messages && convo.messages.length > 0 ? (
                        <div className="space-y-2">
                          {convo.messages.map((msg, idx) => {
                            const isUserMsg = msg.role === 'user';
                            return (
                              <div key={idx} className="flex items-start gap-2">
                                <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${
                                  isUserMsg ? 'bg-primary-600' : 'bg-dark-800 border border-gray-700'
                                }`}>
                                  {isUserMsg
                                    ? <User className="w-2.5 h-2.5 text-white" />
                                    : <Bot className="w-2.5 h-2.5 text-primary-400" />
                                  }
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className={`text-xs font-medium ${isUserMsg ? 'text-primary-400' : 'text-gray-400'}`}>
                                      {isUserMsg ? 'User' : 'Assistant'}
                                    </span>
                                    <span className="text-[10px] text-gray-600">
                                      {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                                        hour: '2-digit', minute: '2-digit', hour12: false,
                                      })}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{msg.content}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="bg-dark-800 rounded-lg border border-gray-800 p-3">
                          <p className="text-xs text-gray-500 mb-1">Last message</p>
                          <p className="text-sm text-gray-300">{convo.lastMessage}</p>
                          {convo.messageCount > 1 && (
                            <p className="text-xs text-gray-600 mt-2">
                              + {convo.messageCount - 1} earlier message{convo.messageCount - 1 !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Load More ────────────────────────────────────────── */}
        {hasMore && (
          <div className="flex justify-center py-6">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-dark-800 border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-600 transition-colors disabled:opacity-50"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Load More ({total - conversations.length} remaining)
                </>
              )}
            </button>
          </div>
        )}

        {/* ── End-of-list indicator ────────────────────────────── */}
        {!hasMore && conversations.length > 0 && (
          <div className="text-center py-6 text-xs text-gray-600">
            All {total} conversation{total !== 1 ? 's' : ''} loaded
          </div>
        )}
      </div>
    </div>
  );
}

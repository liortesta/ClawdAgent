import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, X, Clock, Zap, Bot, Shield, Sparkles, Rss,
  ArrowUpCircle, Search, ExternalLink, ChevronRight,
} from 'lucide-react';
import { useNotificationsStore, type SystemNotification } from '../../stores/notifications';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  success: 'bg-green-500/20 text-green-400 border-green-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const severityDots: Record<string, string> = {
  critical: 'bg-red-400',
  warning: 'bg-amber-400',
  success: 'bg-green-400',
  info: 'bg-blue-400',
};

/** Type-specific icon for each notification type */
function TypeIcon({ type }: { type: string }) {
  const cls = 'w-4 h-4';
  switch (type) {
    case 'cron_publish': return <Clock className={`${cls} text-green-400`} />;
    case 'model_new': return <Sparkles className={`${cls} text-purple-400`} />;
    case 'model_deprecated': return <ArrowUpCircle className={`${cls} text-amber-400`} />;
    case 'ecosystem_discovery': return <Search className={`${cls} text-cyan-400`} />;
    case 'self_repair': return <Zap className={`${cls} text-yellow-400`} />;
    case 'evolution_complete': return <Zap className={`${cls} text-primary-400`} />;
    case 'security_alert': return <Shield className={`${cls} text-red-400`} />;
    case 'skill_installed': return <Sparkles className={`${cls} text-emerald-400`} />;
    case 'agent_created': return <Bot className={`${cls} text-blue-400`} />;
    case 'update_available': return <ArrowUpCircle className={`${cls} text-primary-400`} />;
    default: return <Rss className={`${cls} text-gray-400`} />;
  }
}

/** Fallback actionUrl based on notification type */
function getActionUrl(n: SystemNotification): string | undefined {
  if (n.actionUrl) return n.actionUrl;
  switch (n.type) {
    case 'cron_publish': return '/cron';
    case 'model_new':
    case 'model_deprecated':
    case 'price_change':
    case 'evolution_complete': return '/evolution';
    case 'ecosystem_discovery': return '/evolution';
    case 'security_alert': return '/logs';
    case 'skill_installed': return '/skills';
    case 'agent_created': return '/agents';
    default: return undefined;
  }
}

/** Readable type label */
function typeLabel(type: string): string {
  switch (type) {
    case 'cron_publish': return 'Cron';
    case 'model_new': return 'Model';
    case 'model_deprecated': return 'Model';
    case 'ecosystem_discovery': return 'Discovery';
    case 'self_repair': return 'Repair';
    case 'evolution_complete': return 'Evolution';
    case 'security_alert': return 'Security';
    case 'skill_installed': return 'Skill';
    case 'agent_created': return 'Agent';
    case 'update_available': return 'Update';
    case 'price_change': return 'Pricing';
    default: return 'System';
  }
}

/** Detail modal for viewing full notification content */
function DetailModal({ notification, onClose, onNavigate }: {
  notification: SystemNotification;
  onClose: () => void;
  onNavigate: (url: string) => void;
}) {
  const url = getActionUrl(notification);
  const meta = notification.metadata as Record<string, unknown> | undefined;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-4 bg-dark-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={`flex items-center gap-3 px-5 py-4 border-b border-gray-800 ${severityColors[notification.severity] || severityColors.info}`}>
          <TypeIcon type={notification.type} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-100 truncate">{notification.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-400">{typeLabel(notification.type)}</span>
              <span className="text-[10px] text-gray-500">{timeAgo(notification.createdAt)}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-5 py-4 max-h-[400px] overflow-y-auto">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{notification.body}</pre>

          {/* Metadata display for cron_publish */}
          {meta && Array.isArray(meta.platforms) && (
            <div className="mt-4 pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-2">Platforms</p>
              <div className="flex gap-1.5 flex-wrap">
                {(meta.platforms as string[]).map((p: string) => (
                  <span key={p} className="text-xs px-2 py-0.5 rounded bg-primary-500/20 text-primary-300">{p}</span>
                ))}
              </div>
            </div>
          )}

          {meta && typeof meta.fullContent === 'string' && meta.fullContent.length > 150 && (
            <details className="mt-4 pt-3 border-t border-gray-800">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">
                Full content ({String(meta.fullContent).length} chars)
              </summary>
              <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap font-sans bg-dark-800 rounded-lg p-3 max-h-[200px] overflow-y-auto">
                {String(meta.fullContent)}
              </pre>
            </details>
          )}
        </div>

        {/* Modal Footer */}
        {url && (
          <div className="px-5 py-3 border-t border-gray-800">
            <button
              onClick={() => onNavigate(url)}
              className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in {url.replace('/', '').replace('-', ' ')}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, fetchAll, fetchUnreadCount, markRead, markAllRead } = useNotificationsStore();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SystemNotification | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Poll unread count
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Load notifications when dropdown opens
  useEffect(() => {
    if (open) fetchAll({ limit: 30 });
  }, [open, fetchAll]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = (n: SystemNotification) => {
    if (!n.readAt) markRead(n.id);
    setSelected(n);
  };

  const handleNavigate = (url: string) => {
    setSelected(null);
    setOpen(false);
    navigate(url);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-dark-800 border border-gray-700 hover:bg-dark-700 transition-colors"
        title="Notifications"
      >
        <Bell className="w-4 h-4 text-gray-400" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-96 max-h-[480px] flex flex-col bg-dark-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-gray-200">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead()}
                  className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                  title="Mark all read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Read all
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-500">
                <Bell className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-right px-4 py-3 border-b border-gray-800/50 hover:bg-dark-800 transition-colors cursor-pointer ${!n.readAt ? 'bg-dark-850' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex-shrink-0">
                      <TypeIcon type={n.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium truncate flex-1 ${!n.readAt ? 'text-gray-100' : 'text-gray-400'}`}>{n.title}</p>
                        <span className="text-[10px] text-gray-600 flex-shrink-0">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{n.body}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${severityColors[n.severity] || severityColors.info}`}>
                          {typeLabel(n.type)}
                        </span>
                        {!n.readAt && (
                          <div className={`w-1.5 h-1.5 rounded-full ${severityDots[n.severity] || severityDots.info}`} />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <button
              onClick={() => { setOpen(false); navigate('/evolution'); }}
              className="w-full px-4 py-2.5 text-xs text-center text-primary-400 hover:text-primary-300 border-t border-gray-800 hover:bg-dark-800 transition-colors"
            >
              View all notifications
            </button>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <DetailModal
          notification={selected}
          onClose={() => setSelected(null)}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}

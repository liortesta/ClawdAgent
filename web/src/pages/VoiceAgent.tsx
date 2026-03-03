import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/auth';
import {
  Phone, PhoneCall, PhoneOff, PhoneIncoming, PhoneOutgoing,
  Clock, BarChart3, Loader2, RefreshCw, Settings2, Save, Mic,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface CallRecord {
  id: number;
  call_sid: string;
  from_number: string;
  to_number: string;
  direction: 'inbound' | 'outbound';
  status: string;
  duration: number;
  recording_url: string | null;
  transcript: string | null;
  created_at: string;
}

interface CallStats {
  totalCalls: number;
  completedCalls: number;
  avgDuration: number;
  activeCalls: number;
  todayCalls: number;
}

interface ActiveCall {
  callSid: string;
  from: string;
  to: string;
  direction: 'inbound' | 'outbound';
  startedAt: string;
  streamSid: string | null;
}

interface VoiceConfig {
  instructions: string;
  voice: string;
  language: string;
  model: string;
}

// ── Component ──────────────────────────────────────────────────────

export default function VoiceAgent() {
  const token = useAuthStore((s) => s.token);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [calling, setCalling] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [editInstructions, setEditInstructions] = useState('');
  const [editVoice, setEditVoice] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, callsRes, activeRes, configRes] = await Promise.all([
        fetch('/api/voice-agent/stats', { headers }),
        fetch('/api/voice-agent/calls?limit=30', { headers }),
        fetch('/api/voice-agent/active', { headers }),
        fetch('/api/voice-agent/config', { headers }),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (callsRes.ok) { const d = await callsRes.json(); setCalls(d.calls ?? []); }
      if (activeRes.ok) { const d = await activeRes.json(); setActiveCalls(d.calls ?? []); }
      if (configRes.ok) {
        const cfg = await configRes.json();
        setConfig(cfg);
        setEditInstructions(cfg.instructions);
        setEditVoice(cfg.voice);
      }
    } catch {
      /* silently fail — will retry */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const makeCall = async () => {
    if (!phoneNumber.trim()) return;
    setCalling(true);
    try {
      const res = await fetch('/api/voice-agent/call', {
        method: 'POST',
        headers,
        body: JSON.stringify({ to: phoneNumber.trim() }),
      });
      if (res.ok) {
        setPhoneNumber('');
        setTimeout(fetchAll, 1000);
      }
    } finally {
      setCalling(false);
    }
  };

  const hangup = async (callSid: string) => {
    await fetch(`/api/voice-agent/hangup/${callSid}`, { method: 'POST', headers });
    setTimeout(fetchAll, 500);
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      await fetch('/api/voice-agent/config', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ instructions: editInstructions, voice: editVoice }),
      });
      await fetchAll();
    } finally {
      setSavingConfig(false);
    }
  };

  const formatDuration = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    } catch { return iso; }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'in-progress': case 'ringing': case 'initiated': return 'text-yellow-400';
      case 'failed': case 'busy': case 'no-answer': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-700 shadow-lg">
            <Phone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Voice Agent</h1>
            <p className="text-xs text-gray-500">Twilio + OpenAI Realtime</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowConfig(!showConfig)} className="px-3 py-1.5 rounded-lg bg-dark-800 text-gray-300 hover:bg-dark-700 text-sm flex items-center gap-1.5">
            <Settings2 className="w-4 h-4" /> Config
          </button>
          <button onClick={fetchAll} className="px-3 py-1.5 rounded-lg bg-dark-800 text-gray-300 hover:bg-dark-700 text-sm flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Calls', value: stats?.totalCalls ?? 0, icon: Phone, color: 'text-blue-400' },
          { label: 'Completed', value: stats?.completedCalls ?? 0, icon: PhoneOff, color: 'text-green-400' },
          { label: 'Avg Duration', value: formatDuration(stats?.avgDuration ?? 0), icon: Clock, color: 'text-yellow-400' },
          { label: 'Active Now', value: stats?.activeCalls ?? 0, icon: PhoneCall, color: activeCalls.length > 0 ? 'text-red-400 animate-pulse' : 'text-gray-400' },
          { label: 'Today', value: stats?.todayCalls ?? 0, icon: BarChart3, color: 'text-purple-400' },
        ].map((s) => (
          <div key={s.label} className="bg-dark-900 border border-gray-800/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-gray-500">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Make Call */}
      <div className="bg-dark-900 border border-gray-800/50 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <PhoneOutgoing className="w-4 h-4 text-green-400" /> Make a Call
        </h2>
        <div className="flex gap-3">
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+972501234567"
            className="flex-1 px-4 py-2.5 rounded-lg bg-dark-800 border border-gray-700/50 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500/50"
            onKeyDown={(e) => e.key === 'Enter' && makeCall()}
            dir="ltr"
          />
          <button
            onClick={makeCall}
            disabled={calling || !phoneNumber.trim()}
            className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-medium hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {calling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
            Call
          </button>
        </div>
      </div>

      {/* Active Calls */}
      {activeCalls.length > 0 && (
        <div className="bg-dark-900 border border-red-800/30 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <PhoneCall className="w-4 h-4 animate-pulse" /> Active Calls ({activeCalls.length})
          </h2>
          <div className="space-y-2">
            {activeCalls.map((c) => (
              <div key={c.callSid} className="flex items-center justify-between p-3 rounded-lg bg-dark-800/50 border border-red-900/20">
                <div className="flex items-center gap-3">
                  {c.direction === 'inbound' ? <PhoneIncoming className="w-4 h-4 text-blue-400" /> : <PhoneOutgoing className="w-4 h-4 text-green-400" />}
                  <div>
                    <p className="text-sm text-white">{c.from || '?'} → {c.to || '?'}</p>
                    <p className="text-xs text-gray-500">Started {formatTime(c.startedAt)}</p>
                  </div>
                </div>
                <button onClick={() => hangup(c.callSid)} className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 text-xs font-medium flex items-center gap-1">
                  <PhoneOff className="w-3 h-3" /> Hangup
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Config Panel */}
      {showConfig && config && (
        <div className="bg-dark-900 border border-gray-800/50 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Mic className="w-4 h-4 text-purple-400" /> Voice Agent Configuration
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Voice</label>
              <select
                value={editVoice}
                onChange={(e) => setEditVoice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-dark-800 border border-gray-700/50 text-white text-sm focus:outline-none focus:border-purple-500/50"
              >
                {['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Language: {config.language}</label>
              <label className="block text-xs text-gray-500 mb-1">Model: {config.model}</label>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Instructions</label>
              <textarea
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 rounded-lg bg-dark-800 border border-gray-700/50 text-white text-sm focus:outline-none focus:border-purple-500/50 resize-y"
              />
            </div>
            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-500 disabled:opacity-50 flex items-center gap-2"
            >
              {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Config
            </button>
          </div>
        </div>
      )}

      {/* Call History */}
      <div className="bg-dark-900 border border-gray-800/50 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800/50">
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" /> Call History
          </h2>
        </div>
        {calls.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No calls yet. Make your first call above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-800/50">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Dir</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">To</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Duration</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-b border-gray-800/30 hover:bg-dark-800/30">
                    <td className="px-4 py-3 text-gray-400">{formatTime(c.created_at)}</td>
                    <td className="px-4 py-3">
                      {c.direction === 'inbound' ? (
                        <PhoneIncoming className="w-4 h-4 text-blue-400" />
                      ) : (
                        <PhoneOutgoing className="w-4 h-4 text-green-400" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs" dir="ltr">{c.from_number}</td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs" dir="ltr">{c.to_number}</td>
                    <td className={`px-4 py-3 font-medium ${statusColor(c.status)}`}>{c.status}</td>
                    <td className="px-4 py-3 text-gray-400">{c.duration > 0 ? formatDuration(c.duration) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

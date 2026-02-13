import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { DollarSign, TrendingUp, Loader2, BarChart3, PieChart, LineChart } from 'lucide-react';
import { useAuthStore } from '../stores/auth';

export default function Costs() {
  const [today, setToday] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [tradingPnl, setTradingPnl] = useState<any>(null);
  const [tradingStats, setTradingStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    loadCosts();
    const interval = setInterval(loadCosts, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadCosts = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [t, b, h, tp, ts] = await Promise.all([
        api.getCostsToday().catch(() => null),
        api.getCostsBreakdown().catch(() => null),
        api.getCostsHistory().catch(() => null),
        fetch('/api/trading/pnl', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/trading/stats', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setToday(t);
      setBreakdown(b);
      setHistory(h);
      setTradingPnl(tp);
      setTradingStats(ts);
    } catch { /* ignore */ }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const totalToday = today?.totalCost ?? 0;
  const totalCalls = today?.totalCalls ?? 0;
  const modelEntries = today?.byModel ? Object.entries(today.byModel) : [];
  const providerEntries = breakdown?.byProvider ? Object.entries(breakdown.byProvider) : [];

  // Calculate bar widths
  const maxModelCost = Math.max(...modelEntries.map(([_, d]: [string, any]) => d.cost ?? 0), 0.001);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <DollarSign className="w-7 h-7 text-primary-500" />
          <h1 className="text-2xl font-bold">Costs</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-5 bg-dark-800 rounded-lg border border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-gray-400">Today's Cost</span>
            </div>
            <p className="text-3xl font-bold text-yellow-400">${totalToday.toFixed(4)}</p>
          </div>
          <div className="p-5 bg-dark-800 rounded-lg border border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-gray-400">API Calls Today</span>
            </div>
            <p className="text-3xl font-bold text-cyan-400">{totalCalls}</p>
          </div>
          <div className="p-5 bg-dark-800 rounded-lg border border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-green-400" />
              <span className="text-sm text-gray-400">Models Used</span>
            </div>
            <p className="text-3xl font-bold text-green-400">{modelEntries.length}</p>
          </div>
        </div>

        {/* Crypto P&L Card */}
        {tradingPnl && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <LineChart className="w-5 h-5 text-gray-400" />
              Crypto P&L
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-lg border bg-dark-800 border-gray-800">
                <p className="text-sm text-gray-400 mb-1">Today P&L</p>
                <p className={`text-2xl font-bold ${(tradingPnl.dayPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(tradingPnl.dayPnl ?? 0) >= 0 ? '+' : ''}${(tradingPnl.dayPnl ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="p-4 rounded-lg border bg-dark-800 border-gray-800">
                <p className="text-sm text-gray-400 mb-1">Realized P&L</p>
                <p className={`text-2xl font-bold ${(tradingPnl.totalRealizedPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(tradingPnl.totalRealizedPnl ?? 0) >= 0 ? '+' : ''}${(tradingPnl.totalRealizedPnl ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="p-4 rounded-lg border bg-dark-800 border-gray-800">
                <p className="text-sm text-gray-400 mb-1">Unrealized P&L</p>
                <p className={`text-2xl font-bold ${(tradingPnl.totalUnrealizedPnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(tradingPnl.totalUnrealizedPnl ?? 0) >= 0 ? '+' : ''}${(tradingPnl.totalUnrealizedPnl ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="p-4 rounded-lg border bg-dark-800 border-gray-800">
                <p className="text-sm text-gray-400 mb-1">Win Rate</p>
                <p className="text-2xl font-bold text-cyan-400">
                  {tradingStats?.winRate?.toFixed(1) ?? '0.0'}%
                  <span className="text-xs text-gray-500 ml-1">({tradingStats?.totalTrades ?? 0} trades)</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* By Provider */}
        {providerEntries.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-gray-400" />
              Cost by Provider
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {providerEntries.map(([provider, cost]: [string, any]) => {
                const colors: Record<string, string> = {
                  anthropic: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
                  openai: 'text-green-400 bg-green-500/10 border-green-500/20',
                  openrouter: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
                  other: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
                };
                const style = colors[provider] ?? colors.other;
                return (
                  <div key={provider} className={`p-4 rounded-lg border ${style}`}>
                    <p className="text-sm capitalize font-medium">{provider}</p>
                    <p className="text-2xl font-bold mt-1">${(cost as number).toFixed(4)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* By Model — Bar Chart */}
        {modelEntries.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-gray-400" />
              Cost by Model
            </h2>
            <div className="bg-dark-800 rounded-lg border border-gray-800 p-4 space-y-3">
              {modelEntries
                .sort((a: any, b: any) => (b[1].cost ?? 0) - (a[1].cost ?? 0))
                .map(([model, data]: [string, any]) => {
                  const cost = data.cost ?? 0;
                  const pct = (cost / maxModelCost) * 100;
                  return (
                    <div key={model}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate max-w-[60%]">{model}</span>
                        <div className="text-right">
                          <span className="text-sm font-mono text-yellow-400">${cost.toFixed(4)}</span>
                          <span className="text-xs text-gray-500 ml-2">{data.calls ?? 0} calls</span>
                        </div>
                      </div>
                      <div className="w-full bg-dark-900 rounded-full h-2">
                        <div
                          className="bg-primary-600 h-2 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* History */}
        {history?.days && history.days.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Daily History</h2>
            <div className="bg-dark-800 rounded-lg border border-gray-800 divide-y divide-gray-800">
              {history.days.map((day: any) => (
                <div key={day.date} className="flex items-center justify-between p-4">
                  <span className="text-sm font-mono">{day.date}</span>
                  <div className="flex items-center gap-6">
                    <span className="text-sm text-gray-400">{day.calls} calls</span>
                    <span className="text-sm font-mono text-yellow-400">${day.cost.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {modelEntries.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No costs recorded today</p>
            <p className="text-sm mt-1">Costs will appear here as you use AI models</p>
          </div>
        )}
      </div>
    </div>
  );
}

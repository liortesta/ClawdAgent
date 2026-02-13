import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/auth';
import {
  LineChart, TrendingUp, TrendingDown, BarChart3, Shield, Clock,
  Activity, Wallet, ArrowUpDown, Loader2, RefreshCw, AlertTriangle,
  CheckCircle, XCircle, Save, Target, Zap, DollarSign,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

interface Holding {
  asset: string;
  amount: number;
  avgEntry: number;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPercent: number;
}

interface Portfolio {
  totalValue: number;
  dayPnl: number;
  dayPnlPercent: number;
  realizedPnl: number;
  holdings: Holding[];
  paperMode?: boolean;
}

interface Signal {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  confidence: number;
  strategy: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  reasoning: string;
  timestamp: string;
}

interface Trade {
  id: string;
  date: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  pnl: number | null;
  strategy: string;
  status: 'open' | 'closed' | 'cancelled';
}

interface Stats {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  bestTrade: number;
  worstTrade: number;
}

interface RiskConfig {
  paperMode: boolean;
  maxPositionPercent: number;
  maxOpenPositions: number;
  dailyLossLimit: number;
  defaultStopLoss: number;
  defaultTakeProfit: number;
  cooldownMinutes: number;
}

interface PriceEntry {
  symbol: string;
  price: number;
  change24h: number;
}

type TabId = 'portfolio' | 'trade' | 'signals' | 'history' | 'stats' | 'risk';

// ── Helpers ────────────────────────────────────────────────────────

function pnlColor(value: number): string {
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-400';
}

function pnlBg(value: number): string {
  if (value > 0) return 'bg-green-500/10 border-green-500/20';
  if (value < 0) return 'bg-red-500/10 border-red-500/20';
  return 'bg-gray-500/10 border-gray-500/20';
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatNumber(value: number, decimals = 4): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Main Component ─────────────────────────────────────────────────

export default function Trading() {
  const token = useAuthStore((s) => s.token);
  const [activeTab, setActiveTab] = useState<TabId>('portfolio');
  const [paperMode, setPaperMode] = useState(false);

  const fetchApi = useCallback(async (path: string, options?: RequestInit) => {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
    });
    return res.json();
  }, [token]);

  useEffect(() => {
    document.title = 'ClawdAgent | Trading';
  }, []);

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'portfolio', label: 'Portfolio', icon: Wallet },
    { id: 'trade', label: 'Trade', icon: ArrowUpDown },
    { id: 'signals', label: 'Signals', icon: Activity },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'stats', label: 'Stats', icon: BarChart3 },
    { id: 'risk', label: 'Risk', icon: Shield },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-7xl mx-auto animate-fade-in">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-600/20">
              <LineChart className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold tracking-tight">Trading</h1>
                {paperMode && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                    PAPER TRADING
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500">AI-powered trading dashboard</p>
            </div>
          </div>
        </div>

        {/* ── Tab Bar ────────────────────────────────────────── */}
        <div className="flex gap-1 mb-6 bg-dark-900 p-1 rounded-lg border border-gray-800 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-dark-800'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab Content ────────────────────────────────────── */}
        {activeTab === 'portfolio' && <PortfolioTab fetchApi={fetchApi} onPaperMode={setPaperMode} />}
        {activeTab === 'trade' && <TradeTab fetchApi={fetchApi} />}
        {activeTab === 'signals' && <SignalsTab fetchApi={fetchApi} />}
        {activeTab === 'history' && <HistoryTab fetchApi={fetchApi} />}
        {activeTab === 'stats' && <StatsTab fetchApi={fetchApi} />}
        {activeTab === 'risk' && <RiskTab fetchApi={fetchApi} />}
      </div>
    </div>
  );
}

// ── Portfolio Tab ──────────────────────────────────────────────────

function PortfolioTab({ fetchApi, onPaperMode }: { fetchApi: (path: string, options?: RequestInit) => Promise<any>; onPaperMode: (v: boolean) => void }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const data = await fetchApi('/api/trading/portfolio');
      setPortfolio(data);
      if (data?.paperMode !== undefined) onPaperMode(data.paperMode);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, [fetchApi, onPaperMode]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Failed to load portfolio</p>
        <button onClick={() => load()} className="mt-3 text-sm text-primary-400 hover:text-primary-300">Retry</button>
      </div>
    );
  }

  const { totalValue, dayPnl, dayPnlPercent, realizedPnl, holdings } = portfolio;

  return (
    <div>
      {/* Summary Cards */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-200">Portfolio Overview</h2>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-dark-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-5 bg-dark-800 rounded-lg border border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-primary-400" />
            <span className="text-sm text-gray-400">Total Value</span>
          </div>
          <p className="text-3xl font-bold text-white">{formatUsd(totalValue)}</p>
        </div>

        <div className={`p-5 rounded-lg border ${pnlBg(dayPnl)}`}>
          <div className="flex items-center gap-2 mb-2">
            {dayPnl >= 0 ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
            <span className="text-sm text-gray-400">Day P&L</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className={`text-3xl font-bold ${pnlColor(dayPnl)}`}>{formatUsd(dayPnl)}</p>
            <span className={`text-sm font-medium ${pnlColor(dayPnlPercent)}`}>{formatPercent(dayPnlPercent)}</span>
          </div>
        </div>

        <div className={`p-5 rounded-lg border ${pnlBg(realizedPnl)}`}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-gray-400">Realized P&L</span>
          </div>
          <p className={`text-3xl font-bold ${pnlColor(realizedPnl)}`}>{formatUsd(realizedPnl)}</p>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-dark-800 rounded-lg border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Holdings</h3>
        </div>
        {holdings && holdings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium">Asset</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="text-right px-4 py-3 font-medium">Avg Entry</th>
                  <th className="text-right px-4 py-3 font-medium">Current Price</th>
                  <th className="text-right px-4 py-3 font-medium">Value</th>
                  <th className="text-right px-4 py-3 font-medium">P&L</th>
                  <th className="text-right px-4 py-3 font-medium">P&L %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {holdings.map((h) => (
                  <tr key={h.asset} className="hover:bg-dark-850/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{h.asset}</td>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono">{formatNumber(h.amount, 6)}</td>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono">{formatUsd(h.avgEntry)}</td>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono">{formatUsd(h.currentPrice)}</td>
                    <td className="px-4 py-3 text-right text-white font-mono font-medium">{formatUsd(h.value)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${pnlColor(h.pnl)}`}>{formatUsd(h.pnl)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${pnlColor(h.pnlPercent)}`}>{formatPercent(h.pnlPercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-gray-500">
            <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No holdings found</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Trade Tab ──────────────────────────────────────────────────────

function TradeTab({ fetchApi }: { fetchApi: (path: string, options?: RequestInit) => Promise<any> }) {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(true);

  useEffect(() => {
    const loadPrices = async () => {
      try {
        const data = await fetchApi('/api/trading/prices');
        if (Array.isArray(data)) {
          setPrices(data);
        } else if (data?.prices) {
          setPrices(data.prices);
        }
      } catch { /* ignore */ }
      setLoadingPrices(false);
    };
    loadPrices();
    const interval = setInterval(loadPrices, 15_000);
    return () => clearInterval(interval);
  }, [fetchApi]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;

    setSubmitting(true);
    setResult(null);
    try {
      const payload: any = { symbol, side, amount: parseFloat(amount) };
      if (stopLoss) payload.stopLoss = parseFloat(stopLoss);
      if (takeProfit) payload.takeProfit = parseFloat(takeProfit);

      const data = await fetchApi('/api/trading/trade', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (data?.error || data?.rejected) {
        setResult({ success: false, message: data.error || data.message || 'Trade rejected by risk manager' });
      } else {
        setResult({ success: true, message: data.message || 'Trade executed successfully' });
        setAmount('');
        setStopLoss('');
        setTakeProfit('');
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || 'Failed to execute trade' });
    }
    setSubmitting(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Trade Form */}
      <div className="lg:col-span-2">
        <div className="bg-dark-800 rounded-lg border border-gray-800 p-6">
          <h3 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-primary-400" />
            New Trade
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Symbol */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="BTC/USDT"
                className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono focus:border-primary-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Side Toggle */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Side</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSide('buy')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    side === 'buy'
                      ? 'bg-green-600 text-white shadow-lg shadow-green-600/20'
                      : 'bg-dark-900 text-gray-400 border border-gray-700 hover:border-green-500/50 hover:text-green-400'
                  }`}
                >
                  <TrendingUp className="w-4 h-4 inline mr-1.5" />
                  Buy / Long
                </button>
                <button
                  type="button"
                  onClick={() => setSide('sell')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    side === 'sell'
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                      : 'bg-dark-900 text-gray-400 border border-gray-700 hover:border-red-500/50 hover:text-red-400'
                  }`}
                >
                  <TrendingDown className="w-4 h-4 inline mr-1.5" />
                  Sell / Short
                </button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Amount (USDT)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100.00"
                className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono focus:border-primary-500 focus:outline-none transition-colors"
              />
            </div>

            {/* SL / TP */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Stop Loss (optional)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="Price"
                  className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono focus:border-primary-500 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Take Profit (optional)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  placeholder="Price"
                  className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono focus:border-primary-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Result message */}
            {result && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                result.success
                  ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}>
                {result.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                {result.message}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || !amount}
              className={`w-full py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                side === 'buy'
                  ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20'
                  : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20'
              }`}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUpDown className="w-4 h-4" />
              )}
              {submitting ? 'Executing...' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}`}
            </button>
          </form>
        </div>
      </div>

      {/* Prices Panel */}
      <div>
        <div className="bg-dark-800 rounded-lg border border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Live Prices
          </h3>
          {loadingPrices ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
            </div>
          ) : prices.length > 0 ? (
            <div className="space-y-3">
              {prices.map((p) => (
                <div key={p.symbol} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
                  <span className="text-sm font-medium text-white">{p.symbol}</span>
                  <div className="text-right">
                    <p className="text-sm font-mono text-white">{formatUsd(p.price)}</p>
                    <p className={`text-[11px] font-mono ${pnlColor(p.change24h)}`}>
                      {formatPercent(p.change24h)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No price data available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Signals Tab ────────────────────────────────────────────────────

function SignalsTab({ fetchApi }: { fetchApi: (path: string, options?: RequestInit) => Promise<any> }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchApi('/api/trading/signals');
        setSignals(Array.isArray(data) ? data : data?.signals ?? []);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [fetchApi]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No active signals</p>
        <p className="text-sm mt-1">Signals will appear here when the AI detects opportunities</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {signals.map((signal) => (
        <div key={signal.id || `${signal.symbol}-${signal.timestamp}`} className="bg-dark-800 rounded-lg border border-gray-800 p-5 hover:border-gray-700 transition-colors">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{signal.symbol}</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                signal.direction === 'long'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                {signal.direction === 'long' ? '\u{1F7E2} Long' : '\u{1F534} Short'}
              </span>
            </div>
            <span className="text-[11px] text-gray-500">{signal.strategy}</span>
          </div>

          {/* Confidence Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Confidence</span>
              <span className="text-xs font-mono font-medium text-white">{signal.confidence}%</span>
            </div>
            <div className="h-2 bg-dark-900 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  signal.confidence >= 75 ? 'bg-gradient-to-r from-green-500 to-emerald-400'
                    : signal.confidence >= 50 ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                    : 'bg-gradient-to-r from-red-500 to-orange-400'
                }`}
                style={{ width: `${Math.min(signal.confidence, 100)}%` }}
              />
            </div>
          </div>

          {/* Entry / SL / TP */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-dark-900 rounded p-2 text-center">
              <p className="text-[10px] text-gray-500 uppercase mb-0.5">Entry</p>
              <p className="text-xs font-mono text-white">{formatUsd(signal.entry)}</p>
            </div>
            <div className="bg-dark-900 rounded p-2 text-center">
              <p className="text-[10px] text-red-400 uppercase mb-0.5">Stop Loss</p>
              <p className="text-xs font-mono text-red-400">{formatUsd(signal.stopLoss)}</p>
            </div>
            <div className="bg-dark-900 rounded p-2 text-center">
              <p className="text-[10px] text-green-400 uppercase mb-0.5">Take Profit</p>
              <p className="text-xs font-mono text-green-400">{formatUsd(signal.takeProfit)}</p>
            </div>
          </div>

          {/* Reasoning */}
          <div className="border-t border-gray-800/50 pt-3">
            <p className="text-xs text-gray-400 leading-relaxed">{signal.reasoning}</p>
          </div>

          {/* Timestamp */}
          {signal.timestamp && (
            <div className="mt-2 text-[10px] text-gray-600 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(signal.timestamp).toLocaleString()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── History Tab ────────────────────────────────────────────────────

function HistoryTab({ fetchApi }: { fetchApi: (path: string, options?: RequestInit) => Promise<any> }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchApi('/api/trading/trades');
        setTrades(Array.isArray(data) ? data : data?.trades ?? []);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [fetchApi]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const filtered = trades.filter((t) => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  return (
    <div>
      {/* Filter Buttons */}
      <div className="flex gap-2 mb-4">
        {(['all', 'open', 'closed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-dark-800 text-gray-400 hover:text-white border border-gray-800 hover:border-gray-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="text-xs text-gray-500 self-center ml-2">{filtered.length} trades</span>
      </div>

      {/* Trades Table */}
      <div className="bg-dark-800 rounded-lg border border-gray-800 overflow-hidden">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Symbol</th>
                  <th className="text-left px-4 py-3 font-medium">Side</th>
                  <th className="text-right px-4 py-3 font-medium">Price</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="text-right px-4 py-3 font-medium">P&L</th>
                  <th className="text-left px-4 py-3 font-medium">Strategy</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {filtered.map((t) => (
                  <tr key={t.id || `${t.date}-${t.symbol}`} className="hover:bg-dark-850/50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                      {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{t.symbol}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        t.side === 'buy'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {t.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono">{formatUsd(t.price)}</td>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono">{formatNumber(t.amount, 4)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${t.pnl !== null ? pnlColor(t.pnl) : 'text-gray-600'}`}>
                      {t.pnl !== null ? formatUsd(t.pnl) : '---'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{t.strategy || '---'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        t.status === 'open' ? 'bg-blue-500/20 text-blue-400'
                          : t.status === 'closed' ? 'bg-gray-700 text-gray-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-gray-500">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No trades found</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stats Tab ──────────────────────────────────────────────────────

function StatsTab({ fetchApi }: { fetchApi: (path: string, options?: RequestInit) => Promise<any> }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchApi('/api/trading/stats');
        setStats(data);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [fetchApi]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-16 text-gray-500">
        <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No statistics available</p>
        <p className="text-sm mt-1">Stats will appear after you start trading</p>
      </div>
    );
  }

  const statCards: { label: string; value: string; icon: any; gradient: string; color: string }[] = [
    {
      label: 'Total Trades',
      value: stats.totalTrades.toString(),
      icon: BarChart3,
      gradient: 'from-blue-500 to-blue-600',
      color: 'text-white',
    },
    {
      label: 'Win Rate',
      value: `${stats.winRate.toFixed(1)}%`,
      icon: Target,
      gradient: 'from-green-500 to-emerald-600',
      color: stats.winRate >= 50 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'Total P&L',
      value: formatUsd(stats.totalPnl),
      icon: DollarSign,
      gradient: stats.totalPnl >= 0 ? 'from-green-500 to-emerald-600' : 'from-red-500 to-red-600',
      color: pnlColor(stats.totalPnl),
    },
    {
      label: 'Avg Win',
      value: formatUsd(stats.avgWin),
      icon: TrendingUp,
      gradient: 'from-green-500 to-emerald-600',
      color: 'text-green-400',
    },
    {
      label: 'Avg Loss',
      value: formatUsd(stats.avgLoss),
      icon: TrendingDown,
      gradient: 'from-red-500 to-red-600',
      color: 'text-red-400',
    },
    {
      label: 'Profit Factor',
      value: stats.profitFactor.toFixed(2),
      icon: Activity,
      gradient: 'from-purple-500 to-purple-600',
      color: stats.profitFactor >= 1 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'Sharpe Ratio',
      value: stats.sharpeRatio.toFixed(2),
      icon: LineChart,
      gradient: 'from-cyan-500 to-cyan-600',
      color: stats.sharpeRatio >= 1 ? 'text-green-400' : stats.sharpeRatio >= 0 ? 'text-amber-400' : 'text-red-400',
    },
    {
      label: 'Max Drawdown',
      value: `${stats.maxDrawdown.toFixed(2)}%`,
      icon: AlertTriangle,
      gradient: 'from-amber-500 to-orange-600',
      color: 'text-amber-400',
    },
    {
      label: 'Best Trade',
      value: formatUsd(stats.bestTrade),
      icon: TrendingUp,
      gradient: 'from-green-500 to-emerald-600',
      color: 'text-green-400',
    },
    {
      label: 'Worst Trade',
      value: formatUsd(stats.worstTrade),
      icon: TrendingDown,
      gradient: 'from-red-500 to-red-600',
      color: 'text-red-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {statCards.map((card) => (
        <div key={card.label} className="card-gradient rounded-xl p-5 transition-all duration-300 hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{card.label}</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${card.gradient}`}>
              <card.icon className="w-4 h-4 text-white" />
            </div>
          </div>
          <span className={`text-xl font-bold tracking-tight ${card.color}`}>
            {card.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Risk Tab ───────────────────────────────────────────────────────

function RiskTab({ fetchApi }: { fetchApi: (path: string, options?: RequestInit) => Promise<any> }) {
  const [config, setConfig] = useState<RiskConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchApi('/api/trading/risk');
        setConfig(data);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [fetchApi]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const result = await fetchApi('/api/trading/risk', {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      if (result?.error) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save risk config');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Failed to load risk configuration</p>
      </div>
    );
  }

  const updateConfig = (field: keyof RiskConfig, value: any) => {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            Risk Management
          </h2>
          <p className="text-sm text-gray-400 mt-1">Configure risk parameters and trading safeguards</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 font-medium text-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400 mb-4">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Paper Mode Toggle */}
        <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium text-white">Paper Trading Mode</p>
              <p className="text-sm text-gray-400 mt-0.5">Execute simulated trades without risking real funds</p>
            </div>
            <div
              role="switch"
              aria-checked={config.paperMode}
              tabIndex={0}
              onClick={() => updateConfig('paperMode', !config.paperMode)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); updateConfig('paperMode', !config.paperMode); } }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                config.paperMode ? 'bg-amber-500' : 'bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  config.paperMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
          </label>
          {config.paperMode && (
            <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Paper mode is active. No real trades will be executed.
            </div>
          )}
        </div>

        {/* Position Sizing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
            <label className="block text-sm text-gray-400 mb-1.5">Max Position Size (%)</label>
            <input
              type="number"
              step="1"
              min="1"
              max="100"
              value={config.maxPositionPercent}
              onChange={(e) => updateConfig('maxPositionPercent', parseFloat(e.target.value) || 0)}
              className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono focus:border-primary-500 focus:outline-none transition-colors"
            />
            <p className="text-[11px] text-gray-600 mt-1">Maximum portfolio % per single position</p>
          </div>

          <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
            <label className="block text-sm text-gray-400 mb-1.5">Max Open Positions</label>
            <input
              type="number"
              step="1"
              min="1"
              max="50"
              value={config.maxOpenPositions}
              onChange={(e) => updateConfig('maxOpenPositions', parseInt(e.target.value) || 0)}
              className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono focus:border-primary-500 focus:outline-none transition-colors"
            />
            <p className="text-[11px] text-gray-600 mt-1">Maximum simultaneous open positions</p>
          </div>
        </div>

        {/* Loss Limit */}
        <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
          <label className="block text-sm text-gray-400 mb-1.5">Daily Loss Limit (USDT)</label>
          <input
            type="number"
            step="10"
            min="0"
            value={config.dailyLossLimit}
            onChange={(e) => updateConfig('dailyLossLimit', parseFloat(e.target.value) || 0)}
            className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono focus:border-primary-500 focus:outline-none transition-colors"
          />
          <p className="text-[11px] text-gray-600 mt-1">Trading halts after this daily loss threshold</p>
        </div>

        {/* Default SL / TP */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
            <label className="block text-sm text-gray-400 mb-1.5">Default Stop Loss (%)</label>
            <input
              type="number"
              step="0.5"
              min="0.1"
              max="50"
              value={config.defaultStopLoss}
              onChange={(e) => updateConfig('defaultStopLoss', parseFloat(e.target.value) || 0)}
              className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono focus:border-primary-500 focus:outline-none transition-colors"
            />
            <p className="text-[11px] text-gray-600 mt-1">Auto-applied SL when none is specified</p>
          </div>

          <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
            <label className="block text-sm text-gray-400 mb-1.5">Default Take Profit (%)</label>
            <input
              type="number"
              step="0.5"
              min="0.1"
              max="100"
              value={config.defaultTakeProfit}
              onChange={(e) => updateConfig('defaultTakeProfit', parseFloat(e.target.value) || 0)}
              className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono focus:border-primary-500 focus:outline-none transition-colors"
            />
            <p className="text-[11px] text-gray-600 mt-1">Auto-applied TP when none is specified</p>
          </div>
        </div>

        {/* Cooldown */}
        <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
          <label className="block text-sm text-gray-400 mb-1.5">Cooldown Between Trades (minutes)</label>
          <input
            type="number"
            step="1"
            min="0"
            max="1440"
            value={config.cooldownMinutes}
            onChange={(e) => updateConfig('cooldownMinutes', parseInt(e.target.value) || 0)}
            className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono focus:border-primary-500 focus:outline-none transition-colors"
          />
          <p className="text-[11px] text-gray-600 mt-1">Minimum wait time between consecutive trades (0 = no cooldown)</p>
        </div>
      </div>
    </div>
  );
}

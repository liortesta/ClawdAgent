import type { PortfolioSummary, PortfolioHolding, TradingStats, TradeRecord } from './types.js';
import { fetchTicker, fetchBalance } from './exchange-client.js';
import { getPaperBalance, getPaperTrades } from './paper-trader.js';
import { getRiskConfig } from './risk-manager.js';
import type { ExchangeCredentials } from './types.js';

/** Get portfolio summary (paper or live) */
export async function getPortfolioSummary(credentials?: ExchangeCredentials): Promise<PortfolioSummary> {
  const riskConfig = getRiskConfig();

  if (riskConfig.paperMode) {
    return getPaperPortfolioSummary();
  }

  return getLivePortfolioSummary(credentials);
}

/** Get paper portfolio summary */
async function getPaperPortfolioSummary(): Promise<PortfolioSummary> {
  const balance = getPaperBalance();
  const trades = getPaperTrades();
  const holdings: PortfolioHolding[] = [];
  let totalValue = 0;

  for (const [asset, amount] of Object.entries(balance)) {
    if (amount <= 0) continue;

    if (asset === 'USDT' || asset === 'USD') {
      holdings.push({
        asset,
        amount,
        avgEntryPrice: 1,
        currentPrice: 1,
        valueUsd: amount,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
      });
      totalValue += amount;
    } else {
      try {
        const ticker = await fetchTicker(`${asset}/USDT`);
        const value = amount * ticker.last;

        // Calculate avg entry from trades
        const buys = trades.filter(t => t.symbol === `${asset}/USDT` && t.side === 'buy' && t.status !== 'cancelled');
        const avgEntry = buys.length > 0
          ? buys.reduce((sum, t) => sum + t.price * t.amount, 0) / buys.reduce((sum, t) => sum + t.amount, 0)
          : ticker.last;

        const unrealizedPnl = (ticker.last - avgEntry) * amount;

        holdings.push({
          asset,
          amount,
          avgEntryPrice: avgEntry,
          currentPrice: ticker.last,
          valueUsd: value,
          unrealizedPnl,
          unrealizedPnlPercent: avgEntry > 0 ? ((ticker.last - avgEntry) / avgEntry) * 100 : 0,
        });
        totalValue += value;
      } catch {
        holdings.push({
          asset,
          amount,
          avgEntryPrice: 0,
          currentPrice: 0,
          valueUsd: 0,
          unrealizedPnl: 0,
          unrealizedPnlPercent: 0,
        });
      }
    }
  }

  const closedTrades = trades.filter(t => t.status === 'closed');
  const totalRealizedPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const totalUnrealizedPnl = holdings.reduce((sum, h) => sum + h.unrealizedPnl, 0);

  const today = new Date().toISOString().split('T')[0];
  const dayTrades = closedTrades.filter(t => t.closedAt && t.closedAt.toISOString().startsWith(today));
  const dayPnl = dayTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  return {
    totalValueUsd: totalValue,
    holdings,
    totalUnrealizedPnl,
    totalRealizedPnl,
    dayPnl,
  };
}

/** Get live portfolio summary from exchange */
async function getLivePortfolioSummary(credentials?: ExchangeCredentials): Promise<PortfolioSummary> {
  const balance = await fetchBalance(undefined, credentials);
  const holdings: PortfolioHolding[] = [];
  let totalValue = 0;

  for (const [asset, data] of Object.entries(balance)) {
    if (data.total <= 0) continue;

    if (asset === 'USDT' || asset === 'USD') {
      holdings.push({
        asset,
        amount: data.total,
        avgEntryPrice: 1,
        currentPrice: 1,
        valueUsd: data.total,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
      });
      totalValue += data.total;
    } else {
      try {
        const ticker = await fetchTicker(`${asset}/USDT`);
        const value = data.total * ticker.last;
        holdings.push({
          asset,
          amount: data.total,
          avgEntryPrice: 0, // Would need trade history
          currentPrice: ticker.last,
          valueUsd: value,
          unrealizedPnl: 0,
          unrealizedPnlPercent: 0,
        });
        totalValue += value;
      } catch {
        // Skip
      }
    }
  }

  return {
    totalValueUsd: totalValue,
    holdings,
    totalUnrealizedPnl: 0,
    totalRealizedPnl: 0,
    dayPnl: 0,
  };
}

/** Calculate trading stats from trade history */
export function calculateStats(trades: TradeRecord[]): TradingStats {
  const closed = trades.filter(t => t.status === 'closed' && t.pnl !== undefined);

  if (closed.length === 0) {
    return {
      totalTrades: 0, winRate: 0, totalPnl: 0, avgWin: 0, avgLoss: 0,
      sharpeRatio: 0, maxDrawdown: 0, profitFactor: 0, bestTrade: 0, worstTrade: 0,
    };
  }

  const wins = closed.filter(t => t.pnl! > 0);
  const losses = closed.filter(t => t.pnl! <= 0);

  const totalPnl = closed.reduce((s, t) => s + t.pnl!, 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl!, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl!, 0) / losses.length : 0;

  const totalWins = wins.reduce((s, t) => s + t.pnl!, 0);
  const totalLosses = Math.abs(losses.reduce((s, t) => s + t.pnl!, 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

  // Sharpe ratio (simplified — daily returns)
  const returns = closed.map(t => t.pnlPercent ?? 0);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const stdDev = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  // Max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let cumulative = 0;
  for (const trade of closed) {
    cumulative += trade.pnl!;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak > 0 ? (peak - cumulative) / peak * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const pnls = closed.map(t => t.pnl!);

  return {
    totalTrades: closed.length,
    winRate: (wins.length / closed.length) * 100,
    totalPnl,
    avgWin,
    avgLoss,
    sharpeRatio,
    maxDrawdown,
    profitFactor,
    bestTrade: Math.max(...pnls),
    worstTrade: Math.min(...pnls),
  };
}

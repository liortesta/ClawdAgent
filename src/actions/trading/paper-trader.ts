import logger from '../../utils/logger.js';
import type { TradeRecord, OrderRequest } from './types.js';
import { fetchTicker } from './exchange-client.js';
import { recordTrade, recordLoss } from './risk-manager.js';
import { nanoid } from 'nanoid';

// In-memory paper portfolio
const paperBalance: Map<string, number> = new Map();  // asset -> amount
const paperTrades: TradeRecord[] = [];

// Initialize with $10,000 USDT
if (!paperBalance.has('USDT')) paperBalance.set('USDT', 10000);

export function getPaperBalance(): Record<string, number> {
  return Object.fromEntries(paperBalance);
}

export function getPaperTrades(): TradeRecord[] {
  return [...paperTrades];
}

export function getOpenPaperTrades(): TradeRecord[] {
  return paperTrades.filter(t => t.status === 'open');
}

export function setPaperBalance(asset: string, amount: number) {
  paperBalance.set(asset, amount);
}

/** Execute a paper trade */
export async function executePaperTrade(order: OrderRequest, exchange?: string): Promise<TradeRecord> {
  const ticker = await fetchTicker(order.symbol, exchange);
  const price = order.type === 'limit' && order.price ? order.price : ticker.last;
  const cost = price * order.amount;

  // Parse base and quote currencies from symbol (e.g. BTC/USDT -> BTC, USDT)
  const [base, quote] = order.symbol.split('/');

  if (order.side === 'buy') {
    // Check we have enough quote currency
    const quoteBalance = paperBalance.get(quote) ?? 0;
    if (quoteBalance < cost) {
      throw new Error(`Insufficient ${quote} balance: have ${quoteBalance.toFixed(2)}, need ${cost.toFixed(2)}`);
    }
    paperBalance.set(quote, quoteBalance - cost);
    paperBalance.set(base, (paperBalance.get(base) ?? 0) + order.amount);
  } else {
    // Selling
    const baseBalance = paperBalance.get(base) ?? 0;
    if (baseBalance < order.amount) {
      throw new Error(`Insufficient ${base} balance: have ${baseBalance}, need ${order.amount}`);
    }
    paperBalance.set(base, baseBalance - order.amount);
    paperBalance.set(quote, (paperBalance.get(quote) ?? 0) + cost);
  }

  const fee = cost * 0.001; // 0.1% simulated fee

  const trade: TradeRecord = {
    id: nanoid(),
    exchange: exchange ?? 'paper',
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    price,
    amount: order.amount,
    cost,
    fee,
    stopLoss: order.stopLoss,
    takeProfit: order.takeProfit,
    strategy: order.strategy,
    status: 'open',
    isPaper: true,
    createdAt: new Date(),
  };

  paperTrades.push(trade);
  recordTrade(order.symbol);

  logger.info('Paper trade executed', {
    symbol: order.symbol,
    side: order.side,
    price: price.toFixed(2),
    amount: order.amount,
    cost: cost.toFixed(2),
  });

  return trade;
}

/** Close a paper trade at current market price */
export async function closePaperTrade(tradeId: string, exchange?: string): Promise<TradeRecord | null> {
  const trade = paperTrades.find(t => t.id === tradeId && t.status === 'open');
  if (!trade) return null;

  const ticker = await fetchTicker(trade.symbol, exchange);
  const closePrice = ticker.last;

  const [base, quote] = trade.symbol.split('/');

  // Calculate P&L
  let pnl: number;
  if (trade.side === 'buy') {
    pnl = (closePrice - trade.price) * trade.amount - trade.fee;
    // Return base currency to quote
    paperBalance.set(base, (paperBalance.get(base) ?? 0) - trade.amount);
    paperBalance.set(quote, (paperBalance.get(quote) ?? 0) + closePrice * trade.amount);
  } else {
    pnl = (trade.price - closePrice) * trade.amount - trade.fee;
    paperBalance.set(quote, (paperBalance.get(quote) ?? 0) - closePrice * trade.amount);
    paperBalance.set(base, (paperBalance.get(base) ?? 0) + trade.amount);
  }

  trade.pnl = pnl;
  trade.pnlPercent = (pnl / trade.cost) * 100;
  trade.status = 'closed';
  trade.closedAt = new Date();

  if (pnl < 0) recordLoss(Math.abs(pnl));

  logger.info('Paper trade closed', {
    symbol: trade.symbol,
    pnl: pnl.toFixed(2),
    pnlPercent: trade.pnlPercent.toFixed(2) + '%',
  });

  return trade;
}

/** Check SL/TP for all open paper trades */
export async function checkPaperStopLossTakeProfit(): Promise<TradeRecord[]> {
  const closed: TradeRecord[] = [];
  const openTrades = getOpenPaperTrades();

  for (const trade of openTrades) {
    if (!trade.stopLoss && !trade.takeProfit) continue;

    try {
      const ticker = await fetchTicker(trade.symbol);
      const price = ticker.last;

      const hitSL = trade.side === 'buy'
        ? (trade.stopLoss && price <= trade.stopLoss)
        : (trade.stopLoss && price >= trade.stopLoss);

      const hitTP = trade.side === 'buy'
        ? (trade.takeProfit && price >= trade.takeProfit)
        : (trade.takeProfit && price <= trade.takeProfit);

      if (hitSL || hitTP) {
        const result = await closePaperTrade(trade.id);
        if (result) {
          logger.info(`Paper ${hitSL ? 'SL' : 'TP'} triggered`, { symbol: trade.symbol, price, pnl: result.pnl });
          closed.push(result);
        }
      }
    } catch (err: any) {
      logger.error('Error checking SL/TP', { symbol: trade.symbol, error: err.message });
    }
  }

  return closed;
}

/** Get total paper portfolio value in USD */
export async function getPaperPortfolioValue(): Promise<number> {
  let total = 0;
  for (const [asset, amount] of paperBalance) {
    if (amount <= 0) continue;
    if (asset === 'USDT' || asset === 'USD') {
      total += amount;
    } else {
      try {
        const ticker = await fetchTicker(`${asset}/USDT`);
        total += amount * ticker.last;
      } catch {
        // Skip assets we can't price
      }
    }
  }
  return total;
}

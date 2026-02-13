import logger from '../../utils/logger.js';
import type { OrderRequest, TradeRecord, RiskCheck, ExchangeCredentials } from './types.js';
import { checkRisk, recordTrade, getRiskConfig } from './risk-manager.js';
import { executePaperTrade, closePaperTrade, getOpenPaperTrades, getPaperPortfolioValue } from './paper-trader.js';
import { placeOrder, cancelOrder as exchangeCancelOrder, fetchTicker } from './exchange-client.js';

/**
 * Execute a trade with full risk checks.
 * Automatically routes to paper or live based on config.
 */
export async function executeTrade(
  order: OrderRequest,
  exchangeId?: string,
  credentials?: ExchangeCredentials,
): Promise<{ trade: TradeRecord | null; riskCheck: RiskCheck }> {
  const riskConfig = getRiskConfig();

  // Get current price for risk calculations
  const ticker = await fetchTicker(order.symbol, exchangeId);
  const currentPrice = ticker.last;

  // Calculate portfolio value and open positions
  const portfolioValue = riskConfig.paperMode
    ? await getPaperPortfolioValue()
    : 10000; // TODO: get live portfolio value

  const openPositions = riskConfig.paperMode
    ? getOpenPaperTrades().length
    : 0;

  // Run risk checks
  const riskCheck = checkRisk(order, portfolioValue, openPositions, currentPrice);

  if (!riskCheck.allowed) {
    logger.warn('Trade blocked by risk manager', { symbol: order.symbol, reason: riskCheck.reason });
    return { trade: null, riskCheck };
  }

  // Apply risk adjustments
  const adjustedOrder: OrderRequest = {
    ...order,
    amount: riskCheck.adjustedAmount ?? order.amount,
    stopLoss: riskCheck.adjustedStopLoss ?? order.stopLoss,
    takeProfit: riskCheck.adjustedTakeProfit ?? order.takeProfit,
  };

  try {
    let trade: TradeRecord;

    if (riskConfig.paperMode) {
      trade = await executePaperTrade(adjustedOrder, exchangeId);
    } else {
      // Live trading
      const result = await placeOrder(
        adjustedOrder.symbol,
        adjustedOrder.side,
        adjustedOrder.type,
        adjustedOrder.amount,
        adjustedOrder.price,
        exchangeId,
        credentials,
      );

      trade = {
        id: result.id,
        exchange: exchangeId ?? 'unknown',
        symbol: adjustedOrder.symbol,
        side: adjustedOrder.side,
        type: adjustedOrder.type,
        price: result.price,
        amount: result.amount,
        cost: result.cost,
        fee: result.fee,
        stopLoss: adjustedOrder.stopLoss,
        takeProfit: adjustedOrder.takeProfit,
        strategy: adjustedOrder.strategy,
        status: 'open',
        isPaper: false,
        createdAt: new Date(),
      };
    }

    recordTrade(order.symbol);
    logger.info('Trade executed', {
      mode: riskConfig.paperMode ? 'paper' : 'live',
      symbol: trade.symbol,
      side: trade.side,
      price: trade.price,
      amount: trade.amount,
    });

    return { trade, riskCheck };
  } catch (err: any) {
    logger.error('Trade execution failed', { symbol: order.symbol, error: err.message });
    return { trade: null, riskCheck: { allowed: false, reason: err.message } };
  }
}

/** Close a position */
export async function closePosition(
  tradeId: string,
  exchangeId?: string,
  _credentials?: ExchangeCredentials,
): Promise<TradeRecord | null> {
  const riskConfig = getRiskConfig();

  if (riskConfig.paperMode) {
    return closePaperTrade(tradeId, exchangeId);
  }

  // Live close — would need to place an opposite order
  logger.warn('Live position close not yet implemented');
  return null;
}

/** Cancel an order */
export async function cancelTrade(
  orderId: string,
  symbol: string,
  exchangeId?: string,
  credentials?: ExchangeCredentials,
): Promise<boolean> {
  const riskConfig = getRiskConfig();

  if (riskConfig.paperMode) {
    // For paper trading, just mark as cancelled
    return true;
  }

  try {
    await exchangeCancelOrder(orderId, symbol, exchangeId, credentials);
    return true;
  } catch (err: any) {
    logger.error('Cancel order failed', { orderId, error: err.message });
    return false;
  }
}

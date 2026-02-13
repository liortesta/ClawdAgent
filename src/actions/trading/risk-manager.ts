import config from '../../config.js';
import logger from '../../utils/logger.js';
import type { RiskCheck, RiskConfig, OrderRequest } from './types.js';

const DEFAULT_RISK: RiskConfig = {
  paperMode: true,
  maxPositionPercent: 5,
  maxOpenPositions: 3,
  maxDailyLossPercent: 3,
  maxDailyLossUsd: 100,
  defaultSlPercent: 2,
  defaultTpPercent: 4,
  cooldownMinutes: 5,
  maxLeverage: 2,
  allowedPairs: [],
};

// In-memory risk state (per-user state would go in DB for multi-user)
let riskConfig: RiskConfig = { ...DEFAULT_RISK, paperMode: config.TRADING_PAPER_MODE };
const recentTrades: Map<string, number> = new Map(); // symbol -> last trade timestamp
let dailyLoss = 0;
let dailyLossResetDate = new Date().toISOString().split('T')[0];

function resetDailyLossIfNeeded() {
  const today = new Date().toISOString().split('T')[0];
  if (today !== dailyLossResetDate) {
    dailyLoss = 0;
    dailyLossResetDate = today;
  }
}

export function getRiskConfig(): RiskConfig {
  return { ...riskConfig };
}

export function updateRiskConfig(updates: Partial<RiskConfig>): RiskConfig {
  riskConfig = { ...riskConfig, ...updates };
  logger.info('Risk config updated', { config: riskConfig });
  return { ...riskConfig };
}

/**
 * Check if a trade is allowed by risk rules.
 * Returns { allowed: true } or { allowed: false, reason: '...' }
 */
export function checkRisk(
  order: OrderRequest,
  portfolioValueUsd: number,
  openPositions: number,
  currentPrice: number,
): RiskCheck {
  resetDailyLossIfNeeded();

  // 1. Check paper mode requirement
  if (!riskConfig.paperMode && !config.TRADING_ENABLED) {
    return { allowed: false, reason: 'Live trading is disabled. Set TRADING_ENABLED=true in .env' };
  }

  // 2. Check allowed pairs (if configured)
  if (riskConfig.allowedPairs.length > 0 && !riskConfig.allowedPairs.includes(order.symbol)) {
    return { allowed: false, reason: `${order.symbol} not in allowed pairs: ${riskConfig.allowedPairs.join(', ')}` };
  }

  // 3. Check max open positions
  if (order.side === 'buy' && openPositions >= riskConfig.maxOpenPositions) {
    return { allowed: false, reason: `Max open positions reached (${riskConfig.maxOpenPositions})` };
  }

  // 4. Check position size (% of portfolio)
  const positionValue = order.amount * currentPrice;
  const positionPercent = portfolioValueUsd > 0 ? (positionValue / portfolioValueUsd) * 100 : 100;
  if (positionPercent > riskConfig.maxPositionPercent) {
    const adjustedAmount = (portfolioValueUsd * riskConfig.maxPositionPercent / 100) / currentPrice;
    return {
      allowed: true,
      reason: `Position sized down from ${positionPercent.toFixed(1)}% to ${riskConfig.maxPositionPercent}%`,
      adjustedAmount,
    };
  }

  // 5. Check daily loss limit
  if (dailyLoss >= riskConfig.maxDailyLossUsd) {
    return { allowed: false, reason: `Daily loss limit reached ($${dailyLoss.toFixed(2)} / $${riskConfig.maxDailyLossUsd})` };
  }

  // 6. Check cooldown per symbol
  const lastTradeTime = recentTrades.get(order.symbol);
  if (lastTradeTime) {
    const elapsed = (Date.now() - lastTradeTime) / 60000;
    if (elapsed < riskConfig.cooldownMinutes) {
      return { allowed: false, reason: `Cooldown: wait ${(riskConfig.cooldownMinutes - elapsed).toFixed(1)} more minutes for ${order.symbol}` };
    }
  }

  // 7. Enforce SL/TP
  let adjustedSL = order.stopLoss;
  let adjustedTP = order.takeProfit;

  if (!adjustedSL) {
    adjustedSL = order.side === 'buy'
      ? currentPrice * (1 - riskConfig.defaultSlPercent / 100)
      : currentPrice * (1 + riskConfig.defaultSlPercent / 100);
  }
  if (!adjustedTP) {
    adjustedTP = order.side === 'buy'
      ? currentPrice * (1 + riskConfig.defaultTpPercent / 100)
      : currentPrice * (1 - riskConfig.defaultTpPercent / 100);
  }

  // 8. Enforce minimum R:R ratio (1.5:1)
  const riskAmount = Math.abs(currentPrice - adjustedSL);
  const rewardAmount = Math.abs(adjustedTP - currentPrice);
  if (riskAmount > 0 && rewardAmount / riskAmount < 1.5) {
    adjustedTP = order.side === 'buy'
      ? currentPrice + riskAmount * 2
      : currentPrice - riskAmount * 2;
  }

  return {
    allowed: true,
    adjustedStopLoss: adjustedSL,
    adjustedTakeProfit: adjustedTP,
    adjustedAmount: order.amount,
  };
}

/** Record a trade for cooldown tracking */
export function recordTrade(symbol: string) {
  recentTrades.set(symbol, Date.now());
}

/** Record a loss for daily limit tracking */
export function recordLoss(amount: number) {
  resetDailyLossIfNeeded();
  dailyLoss += Math.abs(amount);
}

/** Get current daily loss */
export function getDailyLoss(): number {
  resetDailyLossIfNeeded();
  return dailyLoss;
}

/** Reset risk state (for testing) */
export function resetRiskState() {
  dailyLoss = 0;
  recentTrades.clear();
  riskConfig = { ...DEFAULT_RISK, paperMode: config.TRADING_PAPER_MODE };
}

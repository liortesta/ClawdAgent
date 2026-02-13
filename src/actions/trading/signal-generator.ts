import logger from '../../utils/logger.js';
import type { TradingSignal } from './types.js';
import { fetchCandles } from './exchange-client.js';
import { analyzeCandles } from './ta-engine.js';
import { scalpingStrategy } from './strategies/scalping.js';
import { dayTradingStrategy } from './strategies/day-trading.js';
import { swingTradingStrategy } from './strategies/swing-trading.js';
import { dcaStrategy } from './strategies/dca.js';
import type { Strategy } from './strategies/base-strategy.js';

const allStrategies: Strategy[] = [
  scalpingStrategy,
  dayTradingStrategy,
  swingTradingStrategy,
  dcaStrategy,
];

/** Get all available strategies */
export function getStrategies(): Strategy[] {
  return [...allStrategies];
}

/** Generate signals for a single symbol using all strategies */
export async function generateSignals(
  symbol: string,
  timeframe: string = '1h',
  exchangeId?: string,
): Promise<TradingSignal[]> {
  const signals: TradingSignal[] = [];

  try {
    const candles = await fetchCandles(symbol, timeframe, 200, exchangeId);
    if (candles.length < 50) {
      logger.warn('Not enough candles for analysis', { symbol, timeframe, count: candles.length });
      return signals;
    }

    const ta = analyzeCandles(symbol, timeframe, candles);

    for (const strategy of allStrategies) {
      if (!strategy.timeframes.includes(timeframe)) continue;

      try {
        const signal = strategy.analyze(symbol, candles, ta);
        if (signal && signal.confidence >= 60) {
          signals.push(signal);
          logger.info('Signal generated', {
            symbol,
            strategy: strategy.id,
            direction: signal.direction,
            confidence: signal.confidence,
          });
        }
      } catch (err: any) {
        logger.error('Strategy analysis error', { strategy: strategy.id, symbol, error: err.message });
      }
    }
  } catch (err: any) {
    logger.error('Signal generation failed', { symbol, error: err.message });
  }

  return signals;
}

/** Scan multiple symbols for signals */
export async function scanMarket(
  symbols: string[],
  timeframe: string = '1h',
  exchangeId?: string,
): Promise<TradingSignal[]> {
  const allSignals: TradingSignal[] = [];

  for (const symbol of symbols) {
    const signals = await generateSignals(symbol, timeframe, exchangeId);
    allSignals.push(...signals);
  }

  // Sort by confidence descending
  return allSignals.sort((a, b) => b.confidence - a.confidence);
}

/** Generate a specific strategy signal */
export async function generateStrategySignal(
  symbol: string,
  strategyId: string,
  timeframe?: string,
  exchangeId?: string,
): Promise<TradingSignal | null> {
  const strategy = allStrategies.find(s => s.id === strategyId);
  if (!strategy) {
    logger.warn('Unknown strategy', { strategyId });
    return null;
  }

  const tf = timeframe ?? strategy.timeframes[0];
  const candles = await fetchCandles(symbol, tf, 200, exchangeId);
  if (candles.length < 50) return null;

  const ta = analyzeCandles(symbol, tf, candles);
  return strategy.analyze(symbol, candles, ta);
}

import type { Strategy } from './base-strategy.js';
import type { OHLCV, TradingSignal, TAResult } from '../types.js';

export const dcaStrategy: Strategy = {
  id: 'dca',
  name: 'DCA (Dollar-Cost Averaging)',
  description: 'Smart DCA — buy more when RSI < 30, less when RSI > 70. Consistent accumulation.',
  timeframes: ['4h', '1d'],

  analyze(symbol: string, candles: OHLCV[], ta: TAResult): TradingSignal | null {
    const { rsi } = ta.indicators;
    const price = candles[candles.length - 1].close;

    // DCA always generates a buy signal — confidence varies by RSI
    let confidence = 50;  // base DCA confidence
    let reasoning = 'Regular DCA buy';

    if (rsi !== undefined) {
      if (rsi < 30) {
        confidence = 85;
        reasoning = `Smart DCA: RSI very low (${rsi.toFixed(1)}) — accumulate more`;
      } else if (rsi < 40) {
        confidence = 75;
        reasoning = `Smart DCA: RSI below average (${rsi.toFixed(1)}) — good entry`;
      } else if (rsi > 70) {
        confidence = 30;
        reasoning = `Smart DCA: RSI high (${rsi.toFixed(1)}) — reduce allocation`;
      } else {
        confidence = 60;
        reasoning = `Regular DCA: RSI neutral (${rsi.toFixed(1)})`;
      }
    }

    // DCA doesn't use traditional SL/TP — it's a long-term strategy
    return {
      symbol,
      timeframe: ta.timeframe,
      direction: 'long',
      confidence,
      strategy: 'dca',
      entryPrice: price,
      stopLoss: 0,       // No SL for DCA
      takeProfit: 0,     // No TP for DCA
      indicators: { ...(rsi !== undefined ? { rsi } : {}), trend: ta.trend === 'bullish' ? 1 : ta.trend === 'bearish' ? -1 : 0 },
      reasoning,
      createdAt: new Date(),
    };
  },
};

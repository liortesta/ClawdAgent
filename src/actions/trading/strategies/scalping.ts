import type { Strategy } from './base-strategy.js';
import type { OHLCV, TradingSignal, TAResult } from '../types.js';

export const scalpingStrategy: Strategy = {
  id: 'scalping',
  name: 'Scalping',
  description: 'Short-term scalp — RSI + Bollinger Bands + Volume. SL 0.5-1%, TP 1-2%.',
  timeframes: ['1m', '5m'],

  analyze(symbol: string, candles: OHLCV[], ta: TAResult): TradingSignal | null {
    const { rsi, bollingerBands } = ta.indicators;
    if (!rsi || !bollingerBands) return null;

    const price = candles[candles.length - 1].close;
    const avgVolume = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
    const currentVolume = candles[candles.length - 1].volume;
    const volumeSpike = currentVolume > avgVolume * 1.5;

    let direction: 'long' | 'short' | 'neutral' = 'neutral';
    let confidence = 0;
    let reasoning = '';

    // Long: RSI < 30, price near lower BB, volume spike
    if (rsi < 30 && price <= bollingerBands.lower * 1.005) {
      direction = 'long';
      confidence = 50 + (volumeSpike ? 20 : 0) + (rsi < 25 ? 15 : 0);
      reasoning = `RSI oversold (${rsi.toFixed(1)}), price at lower BB ($${bollingerBands.lower.toFixed(2)})${volumeSpike ? ', volume spike' : ''}`;
    }
    // Short: RSI > 70, price near upper BB, volume spike
    else if (rsi > 70 && price >= bollingerBands.upper * 0.995) {
      direction = 'short';
      confidence = 50 + (volumeSpike ? 20 : 0) + (rsi > 75 ? 15 : 0);
      reasoning = `RSI overbought (${rsi.toFixed(1)}), price at upper BB ($${bollingerBands.upper.toFixed(2)})${volumeSpike ? ', volume spike' : ''}`;
    }

    if (direction === 'neutral' || confidence < 60) return null;

    const slPercent = direction === 'long' ? 0.75 : 0.75;
    const tpPercent = direction === 'long' ? 1.5 : 1.5;

    return {
      symbol,
      timeframe: ta.timeframe,
      direction,
      confidence: Math.min(confidence, 95),
      strategy: 'scalping',
      entryPrice: price,
      stopLoss: direction === 'long' ? price * (1 - slPercent / 100) : price * (1 + slPercent / 100),
      takeProfit: direction === 'long' ? price * (1 + tpPercent / 100) : price * (1 - tpPercent / 100),
      indicators: { rsi, bbUpper: bollingerBands.upper, bbLower: bollingerBands.lower, volumeRatio: currentVolume / avgVolume },
      reasoning,
      createdAt: new Date(),
    };
  },
};

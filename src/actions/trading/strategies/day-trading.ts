import type { Strategy } from './base-strategy.js';
import type { OHLCV, TradingSignal, TAResult } from '../types.js';

export const dayTradingStrategy: Strategy = {
  id: 'day-trading',
  name: 'Day Trading',
  description: 'Intraday — MACD + EMA crossover + ADX trend strength. SL 1-2%, TP 2-4%.',
  timeframes: ['15m', '1h'],

  analyze(symbol: string, candles: OHLCV[], ta: TAResult): TradingSignal | null {
    const { macd, ema, adx, rsi } = ta.indicators;
    if (!macd || !ema || !adx) return null;

    const price = candles[candles.length - 1].close;
    const ema20 = ema['20'];
    const ema50 = ema['50'];
    if (!ema20 || !ema50) return null;

    // ADX must indicate trending market (> 25)
    if (adx < 25) return null;

    let direction: 'long' | 'short' | 'neutral' = 'neutral';
    let confidence = 0;
    let reasoning = '';

    // Long: MACD bullish crossover + EMA20 > EMA50 + price above EMA20
    if (macd.histogram > 0 && macd.macd > macd.signal && ema20 > ema50 && price > ema20) {
      direction = 'long';
      confidence = 55 + (adx > 30 ? 15 : 0) + (rsi && rsi < 65 ? 10 : 0) + (macd.histogram > 0 ? 5 : 0);
      reasoning = `MACD bullish (hist ${macd.histogram.toFixed(2)}), EMA20 > EMA50, ADX ${adx.toFixed(1)}${rsi ? `, RSI ${rsi.toFixed(1)}` : ''}`;
    }
    // Short: MACD bearish crossover + EMA20 < EMA50 + price below EMA20
    else if (macd.histogram < 0 && macd.macd < macd.signal && ema20 < ema50 && price < ema20) {
      direction = 'short';
      confidence = 55 + (adx > 30 ? 15 : 0) + (rsi && rsi > 35 ? 10 : 0) + (macd.histogram < 0 ? 5 : 0);
      reasoning = `MACD bearish (hist ${macd.histogram.toFixed(2)}), EMA20 < EMA50, ADX ${adx.toFixed(1)}${rsi ? `, RSI ${rsi.toFixed(1)}` : ''}`;
    }

    if (direction === 'neutral' || confidence < 60) return null;

    const slPercent = 1.5;
    const tpPercent = 3;

    return {
      symbol,
      timeframe: ta.timeframe,
      direction,
      confidence: Math.min(confidence, 95),
      strategy: 'day-trading',
      entryPrice: price,
      stopLoss: direction === 'long' ? price * (1 - slPercent / 100) : price * (1 + slPercent / 100),
      takeProfit: direction === 'long' ? price * (1 + tpPercent / 100) : price * (1 - tpPercent / 100),
      indicators: { macdHist: macd.histogram, ema20, ema50, adx, ...(rsi ? { rsi } : {}) },
      reasoning,
      createdAt: new Date(),
    };
  },
};

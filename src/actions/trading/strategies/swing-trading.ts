import type { Strategy } from './base-strategy.js';
import type { OHLCV, TradingSignal, TAResult } from '../types.js';

export const swingTradingStrategy: Strategy = {
  id: 'swing-trading',
  name: 'Swing Trading',
  description: 'Multi-day — EMA 50/200 + RSI + Support/Resistance. SL 3-5%, TP 6-15%.',
  timeframes: ['4h', '1d'],

  analyze(symbol: string, candles: OHLCV[], ta: TAResult): TradingSignal | null {
    const { rsi, ema, atr } = ta.indicators;
    if (!rsi || !ema) return null;

    const price = candles[candles.length - 1].close;
    const ema50 = ema['50'];
    const ema200 = ema['200'];
    if (!ema50) return null;

    const nearSupport = ta.support.some(s => Math.abs(price - s) / s < 0.02);
    const nearResistance = ta.resistance.some(r => Math.abs(price - r) / r < 0.02);

    let direction: 'long' | 'short' | 'neutral' = 'neutral';
    let confidence = 0;
    let reasoning = '';

    const goldenCross = ema200 ? ema50 > ema200 : false;
    const deathCross = ema200 ? ema50 < ema200 : false;

    // Long: Price near support + RSI < 40 + EMA50 trending up (or golden cross)
    if (nearSupport && rsi < 40) {
      direction = 'long';
      confidence = 50 + (goldenCross ? 20 : 0) + (rsi < 35 ? 10 : 0) + (ta.trend === 'bullish' ? 10 : 0);
      reasoning = `Price near support, RSI low (${rsi.toFixed(1)})${goldenCross ? ', golden cross' : ''}, trend: ${ta.trend}`;
    }
    // Short: Price near resistance + RSI > 60 + EMA50 trending down (or death cross)
    else if (nearResistance && rsi > 60) {
      direction = 'short';
      confidence = 50 + (deathCross ? 20 : 0) + (rsi > 65 ? 10 : 0) + (ta.trend === 'bearish' ? 10 : 0);
      reasoning = `Price near resistance, RSI high (${rsi.toFixed(1)})${deathCross ? ', death cross' : ''}, trend: ${ta.trend}`;
    }

    if (direction === 'neutral' || confidence < 60) return null;

    // Use ATR-based stops for swing trades
    const atrValue = atr ?? price * 0.02;
    const slMultiplier = 2;
    const tpMultiplier = 4;

    return {
      symbol,
      timeframe: ta.timeframe,
      direction,
      confidence: Math.min(confidence, 95),
      strategy: 'swing-trading',
      entryPrice: price,
      stopLoss: direction === 'long' ? price - atrValue * slMultiplier : price + atrValue * slMultiplier,
      takeProfit: direction === 'long' ? price + atrValue * tpMultiplier : price - atrValue * tpMultiplier,
      indicators: { rsi, ema50, ...(ema200 ? { ema200 } : {}), atr: atrValue },
      reasoning,
      createdAt: new Date(),
    };
  },
};

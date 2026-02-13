import { RSI, MACD, BollingerBands, EMA, SMA, ATR, Stochastic, ADX, OBV } from 'technicalindicators';
import type { OHLCV, TAResult } from './types.js';

/** Calculate RSI */
export function calcRSI(closes: number[], period: number = 14): number | undefined {
  const result = RSI.calculate({ values: closes, period });
  return result.length > 0 ? result[result.length - 1] : undefined;
}

/** Calculate MACD */
export function calcMACD(closes: number[]) {
  const result = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  if (result.length === 0) return undefined;
  const last = result[result.length - 1];
  return { macd: last.MACD ?? 0, signal: last.signal ?? 0, histogram: last.histogram ?? 0 };
}

/** Calculate Bollinger Bands */
export function calcBollingerBands(closes: number[], period: number = 20, stdDev: number = 2) {
  const result = BollingerBands.calculate({ values: closes, period, stdDev });
  if (result.length === 0) return undefined;
  const last = result[result.length - 1];
  return { upper: last.upper, middle: last.middle, lower: last.lower };
}

/** Calculate EMA for multiple periods */
export function calcEMAs(closes: number[], periods: number[] = [9, 20, 50, 200]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const period of periods) {
    if (closes.length < period) continue;
    const ema = EMA.calculate({ values: closes, period });
    if (ema.length > 0) result[String(period)] = ema[ema.length - 1];
  }
  return result;
}

/** Calculate SMA for multiple periods */
export function calcSMAs(closes: number[], periods: number[] = [20, 50, 200]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const period of periods) {
    if (closes.length < period) continue;
    const sma = SMA.calculate({ values: closes, period });
    if (sma.length > 0) result[String(period)] = sma[sma.length - 1];
  }
  return result;
}

/** Calculate ATR */
export function calcATR(candles: OHLCV[], period: number = 14): number | undefined {
  const result = ATR.calculate({
    high: candles.map(c => c.high),
    low: candles.map(c => c.low),
    close: candles.map(c => c.close),
    period,
  });
  return result.length > 0 ? result[result.length - 1] : undefined;
}

/** Calculate Stochastic */
export function calcStochastic(candles: OHLCV[], period: number = 14, signalPeriod: number = 3) {
  const result = Stochastic.calculate({
    high: candles.map(c => c.high),
    low: candles.map(c => c.low),
    close: candles.map(c => c.close),
    period,
    signalPeriod,
  });
  if (result.length === 0) return undefined;
  const last = result[result.length - 1];
  return { k: last.k, d: last.d };
}

/** Calculate ADX */
export function calcADX(candles: OHLCV[], period: number = 14): number | undefined {
  const result = ADX.calculate({
    high: candles.map(c => c.high),
    low: candles.map(c => c.low),
    close: candles.map(c => c.close),
    period,
  });
  return result.length > 0 ? result[result.length - 1].adx : undefined;
}

/** Calculate OBV */
export function calcOBV(candles: OHLCV[]): number | undefined {
  const result = OBV.calculate({
    close: candles.map(c => c.close),
    volume: candles.map(c => c.volume),
  });
  return result.length > 0 ? result[result.length - 1] : undefined;
}

/** Find support and resistance levels using pivot points */
export function findSupportResistance(candles: OHLCV[], lookback: number = 50): { support: number[]; resistance: number[] } {
  const recent = candles.slice(-lookback);
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);

  const resistance: number[] = [];
  const support: number[] = [];

  // Simple pivot detection — find local maxima/minima
  for (let i = 2; i < recent.length - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
      resistance.push(highs[i]);
    }
    if (lows[i] < lows[i-1] && lows[i] < lows[i-2] && lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
      support.push(lows[i]);
    }
  }

  // Sort and deduplicate (merge levels within 0.5% of each other)
  const merge = (levels: number[]) => {
    const sorted = levels.sort((a, b) => a - b);
    const merged: number[] = [];
    for (const level of sorted) {
      if (merged.length === 0 || Math.abs(level - merged[merged.length - 1]) / merged[merged.length - 1] > 0.005) {
        merged.push(level);
      }
    }
    return merged.slice(-5); // keep top 5
  };

  return { support: merge(support), resistance: merge(resistance) };
}

/** Determine overall trend */
export function determineTrend(closes: number[]): 'bullish' | 'bearish' | 'neutral' {
  const emas = calcEMAs(closes, [20, 50]);
  const ema20 = emas['20'];
  const ema50 = emas['50'];
  const currentPrice = closes[closes.length - 1];

  if (!ema20 || !ema50) return 'neutral';

  if (currentPrice > ema20 && ema20 > ema50) return 'bullish';
  if (currentPrice < ema20 && ema20 < ema50) return 'bearish';
  return 'neutral';
}

/** Run full technical analysis on candle data */
export function analyzeCandles(symbol: string, timeframe: string, candles: OHLCV[]): TAResult {
  const closes = candles.map(c => c.close);
  const sr = findSupportResistance(candles);

  return {
    symbol,
    timeframe,
    indicators: {
      rsi: calcRSI(closes),
      macd: calcMACD(closes),
      bollingerBands: calcBollingerBands(closes),
      ema: calcEMAs(closes),
      sma: calcSMAs(closes),
      atr: calcATR(candles),
      stochastic: calcStochastic(candles),
      adx: calcADX(candles),
      obv: calcOBV(candles),
    },
    support: sr.support,
    resistance: sr.resistance,
    trend: determineTrend(closes),
    timestamp: new Date(),
  };
}

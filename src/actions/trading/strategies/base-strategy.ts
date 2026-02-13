import type { OHLCV, TradingSignal, TAResult } from '../types.js';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  timeframes: string[];
  analyze(symbol: string, candles: OHLCV[], ta: TAResult): TradingSignal | null;
}

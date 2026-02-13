// OHLCV candle data
export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Trading signal
export interface TradingSignal {
  symbol: string;
  timeframe: string;
  direction: 'long' | 'short' | 'neutral';
  confidence: number;        // 0-100
  strategy: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  indicators: Record<string, number>;
  reasoning: string;
  createdAt: Date;
}

// Risk check result
export interface RiskCheck {
  allowed: boolean;
  reason?: string;
  adjustedAmount?: number;
  adjustedStopLoss?: number;
  adjustedTakeProfit?: number;
}

// Risk configuration
export interface RiskConfig {
  paperMode: boolean;
  maxPositionPercent: number;
  maxOpenPositions: number;
  maxDailyLossPercent: number;
  maxDailyLossUsd: number;
  defaultSlPercent: number;
  defaultTpPercent: number;
  cooldownMinutes: number;
  maxLeverage: number;
  allowedPairs: string[];
}

// Portfolio summary
export interface PortfolioSummary {
  totalValueUsd: number;
  holdings: PortfolioHolding[];
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  dayPnl: number;
}

export interface PortfolioHolding {
  asset: string;
  amount: number;
  avgEntryPrice: number;
  currentPrice: number;
  valueUsd: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

// Trade record
export interface TradeRecord {
  id: string;
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  price: number;
  amount: number;
  cost: number;
  fee: number;
  stopLoss?: number;
  takeProfit?: number;
  pnl?: number;
  pnlPercent?: number;
  strategy?: string;
  status: 'open' | 'closed' | 'cancelled';
  isPaper: boolean;
  createdAt: Date;
  closedAt?: Date;
}

// Order request
export interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price?: number;        // required for limit
  stopLoss?: number;
  takeProfit?: number;
  strategy?: string;
}

// Exchange credentials
export interface ExchangeCredentials {
  exchange: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;   // OKX only
}

// Trading stats
export interface TradingStats {
  totalTrades: number;
  winRate: number;         // percentage
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
}

// Strategy definition
export interface StrategyConfig {
  id: string;
  name: string;
  description: string;
  timeframes: string[];
  defaultSl: number;     // percent
  defaultTp: number;     // percent
  minConfidence: number;  // 0-100
}

// TA result from analysis
export interface TAResult {
  symbol: string;
  timeframe: string;
  indicators: {
    rsi?: number;
    macd?: { macd: number; signal: number; histogram: number };
    bollingerBands?: { upper: number; middle: number; lower: number };
    ema?: Record<string, number>;     // e.g. { '20': 42000, '50': 41500 }
    sma?: Record<string, number>;
    atr?: number;
    stochastic?: { k: number; d: number };
    adx?: number;
    obv?: number;
    vwap?: number;
  };
  support: number[];
  resistance: number[];
  trend: 'bullish' | 'bearish' | 'neutral';
  timestamp: Date;
}

// Price ticker
export interface PriceTicker {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  timestamp: number;
}

// Orderbook
export interface OrderbookData {
  symbol: string;
  bids: [number, number][];   // [price, amount]
  asks: [number, number][];
  timestamp: number;
}

import ccxt, { Exchange } from 'ccxt';
import config from '../../config.js';
import logger from '../../utils/logger.js';
import type { OHLCV, PriceTicker, OrderbookData, ExchangeCredentials } from './types.js';

// Connection pool for exchange instances
const exchangePool: Map<string, Exchange> = new Map();

/**
 * Get or create a ccxt exchange instance.
 * For public endpoints (prices, candles), no credentials needed.
 * For private endpoints (orders, balances), credentials required.
 */
export function getExchange(exchangeId: string, credentials?: ExchangeCredentials): Exchange {
  const key = credentials ? `${exchangeId}:${credentials.apiKey.slice(0, 8)}` : `${exchangeId}:public`;

  if (exchangePool.has(key)) return exchangePool.get(key)!;

  const ExchangeClass = (ccxt as any)[exchangeId];
  if (!ExchangeClass) throw new Error(`Exchange "${exchangeId}" not supported by ccxt`);

  const opts: any = {
    enableRateLimit: true,
    timeout: 30000,
  };

  if (credentials) {
    opts.apiKey = credentials.apiKey;
    opts.secret = credentials.apiSecret;
    if (credentials.passphrase) opts.password = credentials.passphrase;
  }

  const exchange = new ExchangeClass(opts);
  exchangePool.set(key, exchange);
  logger.debug(`Exchange ${exchangeId} instance created`, { key });
  return exchange;
}

/** Get default exchange from config */
export function getDefaultExchange(): Exchange {
  const id = config.TRADING_DEFAULT_EXCHANGE;

  // Try to use configured credentials
  let creds: ExchangeCredentials | undefined;
  if (id === 'binance' && config.BINANCE_API_KEY) {
    creds = { exchange: 'binance', apiKey: config.BINANCE_API_KEY, apiSecret: config.BINANCE_API_SECRET! };
  } else if (id === 'okx' && config.OKX_API_KEY) {
    creds = { exchange: 'okx', apiKey: config.OKX_API_KEY, apiSecret: config.OKX_API_SECRET!, passphrase: config.OKX_PASSPHRASE };
  }

  return getExchange(id, creds);
}

/** Fetch OHLCV candles */
export async function fetchCandles(
  symbol: string,
  timeframe: string = '1h',
  limit: number = 100,
  exchangeId?: string,
): Promise<OHLCV[]> {
  const exchange = exchangeId ? getExchange(exchangeId) : getDefaultExchange();

  const raw = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
  return raw.map(([timestamp, open, high, low, close, volume]) => ({
    timestamp: timestamp!,
    open: open!,
    high: high!,
    low: low!,
    close: close!,
    volume: volume!,
  }));
}

/** Fetch current price ticker */
export async function fetchTicker(symbol: string, exchangeId?: string): Promise<PriceTicker> {
  const exchange = exchangeId ? getExchange(exchangeId) : getDefaultExchange();
  const ticker = await exchange.fetchTicker(symbol);

  return {
    symbol,
    last: ticker.last ?? 0,
    bid: ticker.bid ?? 0,
    ask: ticker.ask ?? 0,
    high24h: ticker.high ?? 0,
    low24h: ticker.low ?? 0,
    volume24h: ticker.baseVolume ?? 0,
    change24h: ticker.change ?? 0,
    changePercent24h: ticker.percentage ?? 0,
    timestamp: ticker.timestamp ?? Date.now(),
  };
}

/** Fetch multiple tickers */
export async function fetchTickers(symbols: string[], exchangeId?: string): Promise<PriceTicker[]> {
  const exchange = exchangeId ? getExchange(exchangeId) : getDefaultExchange();

  try {
    const tickers = await exchange.fetchTickers(symbols);
    return Object.values(tickers).map(t => ({
      symbol: t.symbol,
      last: t.last ?? 0,
      bid: t.bid ?? 0,
      ask: t.ask ?? 0,
      high24h: t.high ?? 0,
      low24h: t.low ?? 0,
      volume24h: t.baseVolume ?? 0,
      change24h: t.change ?? 0,
      changePercent24h: t.percentage ?? 0,
      timestamp: t.timestamp ?? Date.now(),
    }));
  } catch {
    // Fallback: fetch one by one
    return Promise.all(symbols.map(s => fetchTicker(s, exchangeId)));
  }
}

/** Fetch orderbook */
export async function fetchOrderbook(symbol: string, limit: number = 20, exchangeId?: string): Promise<OrderbookData> {
  const exchange = exchangeId ? getExchange(exchangeId) : getDefaultExchange();
  const book = await exchange.fetchOrderBook(symbol, limit);

  return {
    symbol,
    bids: book.bids.map(([p, a]) => [p, a] as [number, number]),
    asks: book.asks.map(([p, a]) => [p, a] as [number, number]),
    timestamp: book.timestamp ?? Date.now(),
  };
}

/** Fetch account balance (requires credentials) */
export async function fetchBalance(_exchangeId?: string, credentials?: ExchangeCredentials) {
  const exchange = credentials
    ? getExchange(credentials.exchange, credentials)
    : getDefaultExchange();

  const balance = await exchange.fetchBalance();
  const holdings: Record<string, { free: number; used: number; total: number }> = {};

  for (const [asset, data] of Object.entries(balance.total ?? {})) {
    if (typeof data === 'number' && data > 0) {
      holdings[asset] = {
        free: (balance.free as any)?.[asset] ?? 0,
        used: (balance.used as any)?.[asset] ?? 0,
        total: data,
      };
    }
  }

  return holdings;
}

/** Place an order (requires credentials) */
export async function placeOrder(
  symbol: string,
  side: 'buy' | 'sell',
  type: 'market' | 'limit',
  amount: number,
  price?: number,
  _exchangeId?: string,
  credentials?: ExchangeCredentials,
) {
  const exchange = credentials
    ? getExchange(credentials.exchange, credentials)
    : getDefaultExchange();

  logger.info('Placing order', { symbol, side, type, amount, price });

  const order = type === 'market'
    ? await exchange.createMarketOrder(symbol, side, amount)
    : await exchange.createLimitOrder(symbol, side, amount, price!);

  return {
    id: order.id,
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    price: order.price ?? order.average ?? price ?? 0,
    amount: order.amount ?? amount,
    cost: order.cost ?? 0,
    fee: order.fee?.cost ?? 0,
    status: order.status,
    timestamp: order.timestamp,
  };
}

/** Cancel an order */
export async function cancelOrder(
  orderId: string,
  symbol: string,
  _exchangeId?: string,
  credentials?: ExchangeCredentials,
) {
  const exchange = credentials
    ? getExchange(credentials.exchange, credentials)
    : getDefaultExchange();

  return exchange.cancelOrder(orderId, symbol);
}

/** Fetch open orders */
export async function fetchOpenOrders(symbol?: string, _exchangeId?: string, credentials?: ExchangeCredentials) {
  const exchange = credentials
    ? getExchange(credentials.exchange, credentials)
    : getDefaultExchange();

  return exchange.fetchOpenOrders(symbol);
}

/** Test exchange connection */
export async function testExchangeConnection(exchangeId: string, credentials?: ExchangeCredentials): Promise<boolean> {
  try {
    const exchange = getExchange(exchangeId, credentials);
    await exchange.fetchTicker('BTC/USDT');
    if (credentials) {
      await exchange.fetchBalance();
    }
    return true;
  } catch (err: any) {
    logger.error('Exchange connection test failed', { exchange: exchangeId, error: err.message });
    return false;
  }
}

/** List supported exchanges */
export function listSupportedExchanges(): string[] {
  return ['binance', 'okx', 'bybit', 'kucoin', 'kraken', 'gate', 'bitget'];
}

/** Close all exchange connections */
export async function closeAllExchanges() {
  for (const [_key, exchange] of exchangePool) {
    try { await exchange.close(); } catch {}
  }
  exchangePool.clear();
}

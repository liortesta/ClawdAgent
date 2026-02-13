import { BaseTool, ToolResult } from './base-tool.js';
import config from '../../config.js';

// Exchange client
import {
  fetchTicker,
  fetchTickers,
  fetchCandles,
  fetchOrderbook,
  testExchangeConnection,
  listSupportedExchanges,
} from '../../actions/trading/exchange-client.js';

// Paper trader
import {
  getPaperBalance,
  getPaperTrades,
  getOpenPaperTrades,
} from '../../actions/trading/paper-trader.js';

// Portfolio tracker
import {
  getPortfolioSummary,
  calculateStats,
} from '../../actions/trading/portfolio-tracker.js';

// Trade executor
import {
  executeTrade,
  cancelTrade,
  closePosition,
} from '../../actions/trading/trade-executor.js';

// Technical analysis
import { analyzeCandles } from '../../actions/trading/ta-engine.js';

// Signal generator
import {
  generateSignals,
  scanMarket,
  getStrategies,
} from '../../actions/trading/signal-generator.js';

// Risk manager
import {
  getRiskConfig,
  updateRiskConfig,
} from '../../actions/trading/risk-manager.js';

import type { TAResult } from '../../actions/trading/types.js';

export class TradingTool extends BaseTool {
  name = 'trading';
  description = 'Crypto trading — analyze, trade, portfolio, risk management. Supports paper and live trading on Binance/OKX.';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;

    if (!action) {
      return { success: false, output: '', error: 'Missing "action" parameter. Available actions: get_price, get_prices, get_candles, get_orderbook, get_portfolio, get_balance, sync_portfolio, place_order, cancel_order, close_position, get_orders, analyze, get_signals, scan_market, set_strategy, get_strategies, get_pnl, get_stats, get_trades, get_risk, set_risk, add_exchange, list_exchanges, test_exchange' };
    }

    this.log(`Action: ${action}`, { input });

    switch (action) {
      case 'get_price':
        return this.getPrice(input);
      case 'get_prices':
        return this.getPrices(input);
      case 'get_candles':
        return this.getCandles(input);
      case 'get_orderbook':
        return this.getOrderbook(input);
      case 'get_portfolio':
        return this.getPortfolio();
      case 'get_balance':
        return this.getBalance();
      case 'sync_portfolio':
        return this.syncPortfolio();
      case 'place_order':
        return this.placeOrder(input);
      case 'cancel_order':
        return this.cancelOrder(input);
      case 'close_position':
        return this.closePosition(input);
      case 'get_orders':
        return this.getOrders();
      case 'analyze':
        return this.analyze(input);
      case 'get_signals':
        return this.getSignals(input);
      case 'scan_market':
        return this.scanMarket(input);
      case 'set_strategy':
        return this.setStrategy();
      case 'get_strategies':
        return this.getStrategies();
      case 'get_pnl':
        return this.getPnl();
      case 'get_stats':
        return this.getStats();
      case 'get_trades':
        return this.getTrades(input);
      case 'get_risk':
        return this.getRisk();
      case 'set_risk':
        return this.setRisk(input);
      case 'add_exchange':
        return this.addExchange();
      case 'list_exchanges':
        return this.listExchanges();
      case 'test_exchange':
        return this.testExchange(input);
      default:
        return { success: false, output: '', error: `Unknown action "${action}". Available actions: get_price, get_prices, get_candles, get_orderbook, get_portfolio, get_balance, sync_portfolio, place_order, cancel_order, close_position, get_orders, analyze, get_signals, scan_market, set_strategy, get_strategies, get_pnl, get_stats, get_trades, get_risk, set_risk, add_exchange, list_exchanges, test_exchange` };
    }
  }

  // ─── 1. get_price ──────────────────────────────────────────────────────────

  private async getPrice(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const symbol = input.symbol as string;
      if (!symbol) return { success: false, output: '', error: 'Missing "symbol" parameter (e.g. "BTC/USDT")' };

      const ticker = await fetchTicker(symbol);
      return { success: true, output: JSON.stringify(ticker, null, 2) };
    } catch (err: any) {
      this.error('get_price failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 2. get_prices ─────────────────────────────────────────────────────────

  private async getPrices(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const symbols = input.symbols as string[];
      if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return { success: false, output: '', error: 'Missing "symbols" parameter (array of symbols, e.g. ["BTC/USDT","ETH/USDT"])' };
      }

      const tickers = await fetchTickers(symbols);
      return { success: true, output: JSON.stringify(tickers, null, 2) };
    } catch (err: any) {
      this.error('get_prices failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 3. get_candles ────────────────────────────────────────────────────────

  private async getCandles(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const symbol = input.symbol as string;
      if (!symbol) return { success: false, output: '', error: 'Missing "symbol" parameter' };

      const timeframe = (input.timeframe as string) ?? '1h';
      const limit = (input.limit as number) ?? 100;

      const candles = await fetchCandles(symbol, timeframe, limit);
      return { success: true, output: JSON.stringify(candles, null, 2) };
    } catch (err: any) {
      this.error('get_candles failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 4. get_orderbook ──────────────────────────────────────────────────────

  private async getOrderbook(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const symbol = input.symbol as string;
      if (!symbol) return { success: false, output: '', error: 'Missing "symbol" parameter' };

      const limit = (input.limit as number) ?? 20;

      const orderbook = await fetchOrderbook(symbol, limit);
      return { success: true, output: JSON.stringify(orderbook, null, 2) };
    } catch (err: any) {
      this.error('get_orderbook failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 5. get_portfolio ──────────────────────────────────────────────────────

  private async getPortfolio(): Promise<ToolResult> {
    try {
      const summary = await getPortfolioSummary();
      return { success: true, output: JSON.stringify(summary, null, 2) };
    } catch (err: any) {
      this.error('get_portfolio failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 6. get_balance ────────────────────────────────────────────────────────

  private async getBalance(): Promise<ToolResult> {
    try {
      const balance = getPaperBalance();
      return { success: true, output: JSON.stringify(balance, null, 2) };
    } catch (err: any) {
      this.error('get_balance failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 7. sync_portfolio ─────────────────────────────────────────────────────

  private async syncPortfolio(): Promise<ToolResult> {
    try {
      const summary = await getPortfolioSummary();
      return { success: true, output: JSON.stringify(summary, null, 2) };
    } catch (err: any) {
      this.error('sync_portfolio failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 8. place_order ────────────────────────────────────────────────────────

  private async placeOrder(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const symbol = input.symbol as string;
      const side = input.side as 'buy' | 'sell';
      const amount = input.amount as number;

      if (!symbol) return { success: false, output: '', error: 'Missing "symbol" parameter' };
      if (!side) return { success: false, output: '', error: 'Missing "side" parameter ("buy" or "sell")' };
      if (!amount || amount <= 0) return { success: false, output: '', error: 'Missing or invalid "amount" parameter (must be > 0)' };

      const type = (input.type as 'market' | 'limit') ?? 'market';
      const price = input.price as number | undefined;
      const stopLoss = input.stopLoss as number | undefined;
      const takeProfit = input.takeProfit as number | undefined;
      const strategy = input.strategy as string | undefined;

      if (type === 'limit' && !price) {
        return { success: false, output: '', error: 'Limit orders require a "price" parameter' };
      }

      const result = await executeTrade({
        symbol,
        side,
        type,
        amount,
        price,
        stopLoss,
        takeProfit,
        strategy,
      });

      if (!result.trade) {
        return {
          success: false,
          output: '',
          error: `Trade blocked by risk manager: ${result.riskCheck.reason ?? 'Unknown reason'}`,
        };
      }

      return { success: true, output: JSON.stringify({ trade: result.trade, riskCheck: result.riskCheck }, null, 2) };
    } catch (err: any) {
      this.error('place_order failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 9. cancel_order ───────────────────────────────────────────────────────

  private async cancelOrder(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const orderId = input.orderId as string;
      const symbol = input.symbol as string;

      if (!orderId) return { success: false, output: '', error: 'Missing "orderId" parameter' };
      if (!symbol) return { success: false, output: '', error: 'Missing "symbol" parameter' };

      const success = await cancelTrade(orderId, symbol);
      return {
        success,
        output: success ? `Order ${orderId} cancelled successfully` : `Failed to cancel order ${orderId}`,
        error: success ? undefined : `Could not cancel order ${orderId}`,
      };
    } catch (err: any) {
      this.error('cancel_order failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 10. close_position ────────────────────────────────────────────────────

  private async closePosition(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const tradeId = input.tradeId as string;
      if (!tradeId) return { success: false, output: '', error: 'Missing "tradeId" parameter' };

      const result = await closePosition(tradeId);
      if (!result) {
        return { success: false, output: '', error: `No open trade found with ID "${tradeId}"` };
      }

      return { success: true, output: JSON.stringify(result, null, 2) };
    } catch (err: any) {
      this.error('close_position failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 11. get_orders ────────────────────────────────────────────────────────

  private async getOrders(): Promise<ToolResult> {
    try {
      const trades = getOpenPaperTrades();
      return { success: true, output: JSON.stringify(trades, null, 2) };
    } catch (err: any) {
      this.error('get_orders failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 12. analyze ───────────────────────────────────────────────────────────

  private async analyze(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const symbol = input.symbol as string;
      if (!symbol) return { success: false, output: '', error: 'Missing "symbol" parameter' };

      const timeframe = (input.timeframe as string) ?? '1h';

      const candles = await fetchCandles(symbol, timeframe, 200);
      if (candles.length < 20) {
        return { success: false, output: '', error: `Not enough candle data for ${symbol} (got ${candles.length}, need at least 20)` };
      }

      const ta = analyzeCandles(symbol, timeframe, candles);
      const output = this.formatTAResult(ta);

      return { success: true, output };
    } catch (err: any) {
      this.error('analyze failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 13. get_signals ───────────────────────────────────────────────────────

  private async getSignals(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const symbol = input.symbol as string;
      if (!symbol) return { success: false, output: '', error: 'Missing "symbol" parameter' };

      const timeframe = (input.timeframe as string) ?? '1h';

      const signals = await generateSignals(symbol, timeframe);
      return { success: true, output: JSON.stringify(signals, null, 2) };
    } catch (err: any) {
      this.error('get_signals failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 14. scan_market ───────────────────────────────────────────────────────

  private async scanMarket(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const symbols = (input.symbols as string[]) ?? config.TRADING_DEFAULT_PAIRS;
      const timeframe = (input.timeframe as string) ?? '1h';

      const signals = await scanMarket(symbols, timeframe);
      return { success: true, output: JSON.stringify(signals, null, 2) };
    } catch (err: any) {
      this.error('scan_market failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 15. set_strategy ──────────────────────────────────────────────────────

  private async setStrategy(): Promise<ToolResult> {
    try {
      const strategies = getStrategies();
      const list = strategies.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        timeframes: s.timeframes,
      }));
      return {
        success: true,
        output: `Strategies are applied per-signal, not set globally. Available strategies:\n${JSON.stringify(list, null, 2)}`,
      };
    } catch (err: any) {
      this.error('set_strategy failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 16. get_strategies ────────────────────────────────────────────────────

  private async getStrategies(): Promise<ToolResult> {
    try {
      const strategies = getStrategies();
      const list = strategies.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        timeframes: s.timeframes,
      }));
      return { success: true, output: JSON.stringify(list, null, 2) };
    } catch (err: any) {
      this.error('get_strategies failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 17. get_pnl ──────────────────────────────────────────────────────────

  private async getPnl(): Promise<ToolResult> {
    try {
      const summary = await getPortfolioSummary();
      const pnl = {
        totalValueUsd: summary.totalValueUsd,
        totalRealizedPnl: summary.totalRealizedPnl,
        totalUnrealizedPnl: summary.totalUnrealizedPnl,
        dayPnl: summary.dayPnl,
      };
      return { success: true, output: JSON.stringify(pnl, null, 2) };
    } catch (err: any) {
      this.error('get_pnl failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 18. get_stats ─────────────────────────────────────────────────────────

  private async getStats(): Promise<ToolResult> {
    try {
      const trades = getPaperTrades();
      const stats = calculateStats(trades);
      return { success: true, output: JSON.stringify(stats, null, 2) };
    } catch (err: any) {
      this.error('get_stats failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 19. get_trades ────────────────────────────────────────────────────────

  private async getTrades(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      let trades = getPaperTrades();
      const status = input.status as string | undefined;

      if (status) {
        trades = trades.filter(t => t.status === status);
      }

      return { success: true, output: JSON.stringify(trades, null, 2) };
    } catch (err: any) {
      this.error('get_trades failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 20. get_risk ──────────────────────────────────────────────────────────

  private async getRisk(): Promise<ToolResult> {
    try {
      const riskConfig = getRiskConfig();
      return { success: true, output: JSON.stringify(riskConfig, null, 2) };
    } catch (err: any) {
      this.error('get_risk failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 21. set_risk ──────────────────────────────────────────────────────────

  private async setRisk(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Extract risk config fields from input, excluding the "action" key
      const { action: _, ...updates } = input;

      if (Object.keys(updates).length === 0) {
        return { success: false, output: '', error: 'No risk config fields provided. Available fields: paperMode, maxPositionPercent, maxOpenPositions, maxDailyLossPercent, maxDailyLossUsd, defaultSlPercent, defaultTpPercent, cooldownMinutes, maxLeverage, allowedPairs' };
      }

      const updated = updateRiskConfig(updates);
      return { success: true, output: JSON.stringify(updated, null, 2) };
    } catch (err: any) {
      this.error('set_risk failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 22. add_exchange ──────────────────────────────────────────────────────

  private async addExchange(): Promise<ToolResult> {
    return {
      success: false,
      output: '',
      error: 'Adding exchange credentials at runtime is not yet implemented for security reasons. Please configure exchange API keys via environment variables (BINANCE_API_KEY, BINANCE_API_SECRET, OKX_API_KEY, OKX_API_SECRET, OKX_PASSPHRASE) in your .env file.',
    };
  }

  // ─── 23. list_exchanges ────────────────────────────────────────────────────

  private async listExchanges(): Promise<ToolResult> {
    try {
      const exchanges = listSupportedExchanges();
      return { success: true, output: JSON.stringify(exchanges, null, 2) };
    } catch (err: any) {
      this.error('list_exchanges failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── 24. test_exchange ─────────────────────────────────────────────────────

  private async testExchange(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const exchange = input.exchange as string;
      if (!exchange) return { success: false, output: '', error: 'Missing "exchange" parameter (e.g. "binance", "okx")' };

      const connected = await testExchangeConnection(exchange);
      return {
        success: connected,
        output: connected
          ? `Successfully connected to ${exchange}`
          : `Failed to connect to ${exchange}`,
        error: connected ? undefined : `Connection test failed for ${exchange}. Check if the exchange is reachable.`,
      };
    } catch (err: any) {
      this.error('test_exchange failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ─── Formatting helpers ────────────────────────────────────────────────────

  private formatTAResult(ta: TAResult): string {
    const lines: string[] = [];

    lines.push(`\u{1F4CA} ${ta.symbol} Technical Analysis (${ta.timeframe})`);
    lines.push(`Trend: ${ta.trend.charAt(0).toUpperCase() + ta.trend.slice(1)}`);

    // RSI
    if (ta.indicators.rsi !== undefined) {
      lines.push(`RSI: ${ta.indicators.rsi.toFixed(1)}`);
    }

    // MACD
    if (ta.indicators.macd) {
      const m = ta.indicators.macd;
      lines.push(`MACD: ${m.macd.toFixed(1)} / Signal: ${m.signal.toFixed(1)} / Hist: ${m.histogram.toFixed(1)}`);
    }

    // Bollinger Bands
    if (ta.indicators.bollingerBands) {
      const bb = ta.indicators.bollingerBands;
      lines.push(`BB: Upper ${bb.upper.toFixed(0)} | Middle ${bb.middle.toFixed(0)} | Lower ${bb.lower.toFixed(0)}`);
    }

    // EMA
    if (ta.indicators.ema && Object.keys(ta.indicators.ema).length > 0) {
      const emaStr = Object.entries(ta.indicators.ema)
        .map(([period, val]) => `${period}=${val.toFixed(0)}`)
        .join(', ');
      lines.push(`EMA: ${emaStr}`);
    }

    // ATR
    if (ta.indicators.atr !== undefined) {
      lines.push(`ATR: ${ta.indicators.atr.toFixed(1)}`);
    }

    // Stochastic
    if (ta.indicators.stochastic) {
      const s = ta.indicators.stochastic;
      lines.push(`Stoch: K=${s.k.toFixed(1)}, D=${s.d.toFixed(1)}`);
    }

    // ADX
    if (ta.indicators.adx !== undefined) {
      lines.push(`ADX: ${ta.indicators.adx.toFixed(1)}`);
    }

    // Support / Resistance
    if (ta.support.length > 0) {
      lines.push(`Support: ${ta.support.map(v => v.toFixed(0)).join(', ')}`);
    }
    if (ta.resistance.length > 0) {
      lines.push(`Resistance: ${ta.resistance.map(v => v.toFixed(0)).join(', ')}`);
    }

    return lines.join('\n');
  }
}

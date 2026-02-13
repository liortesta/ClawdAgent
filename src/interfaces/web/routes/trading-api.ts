import { Router, Request, Response } from 'express';
import { fetchTickers, listSupportedExchanges } from '../../../actions/trading/exchange-client.js';
import { getPortfolioSummary, calculateStats } from '../../../actions/trading/portfolio-tracker.js';
import { getPaperTrades } from '../../../actions/trading/paper-trader.js';
import { getRiskConfig, updateRiskConfig } from '../../../actions/trading/risk-manager.js';
import { scanMarket, getStrategies } from '../../../actions/trading/signal-generator.js';
import { executeTrade, closePosition } from '../../../actions/trading/trade-executor.js';
import config from '../../../config.js';

export function setupTradingRoutes(): Router {
  const router = Router();

  // GET /api/trading/portfolio — full portfolio summary
  router.get('/portfolio', async (_req: Request, res: Response) => {
    try {
      const summary = await getPortfolioSummary();
      const riskConfig = getRiskConfig();

      // Transform to match frontend Portfolio interface
      res.json({
        totalValue: summary.totalValueUsd,
        dayPnl: summary.dayPnl,
        dayPnlPercent: summary.totalValueUsd > 0
          ? (summary.dayPnl / summary.totalValueUsd) * 100
          : 0,
        realizedPnl: summary.totalRealizedPnl,
        paperMode: riskConfig.paperMode,
        holdings: summary.holdings.map(h => ({
          asset: h.asset,
          amount: h.amount,
          avgEntry: h.avgEntryPrice,
          currentPrice: h.currentPrice,
          value: h.valueUsd,
          pnl: h.unrealizedPnl,
          pnlPercent: h.unrealizedPnlPercent,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch portfolio summary', details: error.message });
    }
  });

  // GET /api/trading/pnl — profit & loss breakdown
  router.get('/pnl', async (_req: Request, res: Response) => {
    try {
      const summary = await getPortfolioSummary();
      res.json({
        dayPnl: summary.dayPnl,
        totalRealizedPnl: summary.totalRealizedPnl,
        totalUnrealizedPnl: summary.totalUnrealizedPnl,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch PnL', details: error.message });
    }
  });

  // GET /api/trading/trades — list trades, filterable by ?status=open|closed|all
  router.get('/trades', async (req: Request, res: Response) => {
    try {
      const trades = await getPaperTrades();
      const status = (req.query.status as string)?.toLowerCase() ?? 'all';

      // Transform to match frontend Trade interface
      const transform = (t: any) => ({
        id: t.id,
        date: t.createdAt?.toISOString?.() ?? t.createdAt ?? new Date().toISOString(),
        symbol: t.symbol,
        side: t.side,
        price: t.price,
        amount: t.amount,
        pnl: t.pnl ?? null,
        strategy: t.strategy ?? 'manual',
        status: t.status,
      });

      if (status === 'open') {
        res.json(trades.filter((t: any) => t.status === 'open').map(transform));
      } else if (status === 'closed') {
        res.json(trades.filter((t: any) => t.status === 'closed').map(transform));
      } else {
        res.json(trades.map(transform));
      }
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch trades', details: error.message });
    }
  });

  // GET /api/trading/signals — scan market for trading signals
  router.get('/signals', async (_req: Request, res: Response) => {
    try {
      const signals = await scanMarket(config.TRADING_DEFAULT_PAIRS as string[]);
      res.json(signals);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to scan market for signals', details: error.message });
    }
  });

  // GET /api/trading/stats — trading statistics
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const trades = await getPaperTrades();
      const stats = calculateStats(trades);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to calculate stats', details: error.message });
    }
  });

  // GET /api/trading/risk — current risk configuration
  router.get('/risk', async (_req: Request, res: Response) => {
    try {
      const riskConfig = await getRiskConfig();
      res.json(riskConfig);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch risk config', details: error.message });
    }
  });

  // PUT /api/trading/risk — update risk configuration
  router.put('/risk', async (req: Request, res: Response) => {
    try {
      const updated = await updateRiskConfig(req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update risk config', details: error.message });
    }
  });

  // GET /api/trading/exchanges — list supported and configured exchanges
  router.get('/exchanges', (_req: Request, res: Response) => {
    try {
      res.json({
        configured: [],
        supported: listSupportedExchanges(),
        defaultExchange: config.TRADING_DEFAULT_EXCHANGE,
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to list exchanges', details: error.message });
    }
  });

  // GET /api/trading/prices — current prices for default trading pairs
  router.get('/prices', async (_req: Request, res: Response) => {
    try {
      const tickers = await fetchTickers(config.TRADING_DEFAULT_PAIRS as string[]);
      res.json(tickers);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch prices', details: error.message });
    }
  });

  // GET /api/trading/strategies — list available trading strategies
  router.get('/strategies', async (_req: Request, res: Response) => {
    try {
      const strategies = await getStrategies();
      res.json(strategies);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch strategies', details: error.message });
    }
  });

  // POST /api/trading/trade — execute a new trade
  router.post('/trade', async (req: Request, res: Response) => {
    try {
      const { symbol, side, type, amount, price, stopLoss, takeProfit, strategy } = req.body;

      if (!symbol || !side || !type || !amount) {
        res.status(400).json({ error: 'Missing required fields: symbol, side, type, amount' });
        return;
      }

      const result = await executeTrade({ symbol, side, type, amount, price, stopLoss, takeProfit, strategy });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to execute trade', details: error.message });
    }
  });

  // POST /api/trading/close/:tradeId — close an open position
  router.post('/close/:tradeId', async (req: Request, res: Response) => {
    try {
      const tradeId = req.params.tradeId as string;
      const result = await closePosition(tradeId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to close position', details: error.message });
    }
  });

  return router;
}

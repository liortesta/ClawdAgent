import logger from '../../utils/logger.js';
import config from '../../config.js';
import { checkPaperStopLossTakeProfit } from './paper-trader.js';
import { scanMarket } from './signal-generator.js';
import { getRiskConfig } from './risk-manager.js';

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let scanInterval: ReturnType<typeof setInterval> | null = null;

/** Start SL/TP monitoring (every 60 seconds) */
export function startPriceMonitor() {
  if (monitorInterval) return;

  logger.info('Starting price monitor (SL/TP check every 60s)');

  monitorInterval = setInterval(async () => {
    try {
      const riskConfig = getRiskConfig();
      if (riskConfig.paperMode) {
        const closed = await checkPaperStopLossTakeProfit();
        if (closed.length > 0) {
          logger.info(`Price monitor: ${closed.length} paper trades closed (SL/TP)`, {
            trades: closed.map(t => ({ symbol: t.symbol, pnl: t.pnl?.toFixed(2) })),
          });
        }
      }
      // TODO: live SL/TP monitoring via exchange websockets
    } catch (err: any) {
      logger.error('Price monitor error', { error: err.message });
    }
  }, 60_000);
}

/** Start market scan (interval from config) */
export function startMarketScanner() {
  if (scanInterval) return;

  const intervalMs = (config.TRADING_SCAN_INTERVAL_MINUTES ?? 15) * 60_000;
  logger.info(`Starting market scanner (every ${config.TRADING_SCAN_INTERVAL_MINUTES ?? 15}min)`);

  scanInterval = setInterval(async () => {
    try {
      const pairs = config.TRADING_DEFAULT_PAIRS;
      if (!pairs || pairs.length === 0) return;

      const signals = await scanMarket(pairs as string[], '1h');
      if (signals.length > 0) {
        logger.info(`Market scan: ${signals.length} signals found`, {
          signals: signals.map(s => ({
            symbol: s.symbol,
            direction: s.direction,
            confidence: s.confidence,
            strategy: s.strategy,
          })),
        });
      }
    } catch (err: any) {
      logger.error('Market scanner error', { error: err.message });
    }
  }, intervalMs);
}

/** Stop all monitors */
export function stopMonitors() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  logger.info('Price monitors stopped');
}

/** Start all trading monitors if trading is enabled */
export function initTradingMonitors() {
  if (!config.TRADING_ENABLED && !config.TRADING_PAPER_MODE) {
    logger.info('Trading disabled — monitors not started');
    return;
  }

  startPriceMonitor();
  startMarketScanner();
}

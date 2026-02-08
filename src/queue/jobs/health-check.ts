import logger from '../../utils/logger.js';

export async function handleHealthCheck(_data: Record<string, unknown>) {
  logger.debug('Running periodic health check');
  // Will check all registered servers
}

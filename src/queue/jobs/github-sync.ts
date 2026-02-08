import config from '../../config.js';
import logger from '../../utils/logger.js';

export async function handleGithubSync(_data: Record<string, unknown>) {
  if (!config.GITHUB_TOKEN) return;

  logger.debug('Syncing GitHub notifications');

  try {
    const { getGitHubClient } = await import('../../actions/github/client.js');
    const client = getGitHubClient();

    const { data: notifications } = await client.rest.activity.listNotificationsForAuthenticatedUser({
      all: false,
      per_page: 10,
    });

    if (notifications.length > 0) {
      logger.info('GitHub notifications found', {
        count: notifications.length,
        repos: [...new Set(notifications.map(n => n.repository.full_name))],
      });
    }
  } catch (err: any) {
    logger.debug('GitHub sync skipped', { error: err.message });
  }
}

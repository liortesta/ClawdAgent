import { Octokit } from 'octokit';
import config from '../../config.js';
import logger from '../../utils/logger.js';

let octokit: Octokit | null = null;

export function getGitHubClient(): Octokit {
  if (!octokit) {
    if (!config.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not configured');
    octokit = new Octokit({ auth: config.GITHUB_TOKEN });
    logger.info('GitHub client initialized');
  }
  return octokit;
}

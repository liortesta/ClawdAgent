import { getGitHubClient } from './client.js';
import logger from '../../utils/logger.js';

export async function getPRDiff(owner: string, repo: string, prNumber: number): Promise<string> {
  const client = getGitHubClient();
  const { data } = await client.rest.pulls.get({ owner, repo, pull_number: prNumber, mediaType: { format: 'diff' } });
  return data as unknown as string;
}

export async function addPRComment(owner: string, repo: string, prNumber: number, body: string) {
  const client = getGitHubClient();
  await client.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
  logger.info('PR comment added', { owner, repo, prNumber });
}

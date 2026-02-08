import { getGitHubClient } from './client.js';
import logger from '../../utils/logger.js';

export async function getRepo(owner: string, repo: string) {
  const client = getGitHubClient();
  const { data } = await client.rest.repos.get({ owner, repo });
  return data;
}

export async function listRepos(owner: string) {
  const client = getGitHubClient();
  const { data } = await client.rest.repos.listForUser({ username: owner, sort: 'updated', per_page: 10 });
  return data.map(r => ({ name: r.name, description: r.description, url: r.html_url, stars: r.stargazers_count, language: r.language }));
}

export async function getFileContent(owner: string, repo: string, path: string, ref?: string) {
  const client = getGitHubClient();
  const { data } = await client.rest.repos.getContent({ owner, repo, path, ref });
  if ('content' in data) return Buffer.from(data.content, 'base64').toString('utf-8');
  throw new Error('Not a file');
}

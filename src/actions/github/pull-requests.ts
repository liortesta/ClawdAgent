import { getGitHubClient } from './client.js';

export async function createPR(owner: string, repo: string, title: string, body: string, head: string, base = 'main') {
  const client = getGitHubClient();
  const { data } = await client.rest.pulls.create({ owner, repo, title, body, head, base });
  return { number: data.number, url: data.html_url, title: data.title };
}

export async function listPRs(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') {
  const client = getGitHubClient();
  const { data } = await client.rest.pulls.list({ owner, repo, state, per_page: 10 });
  return data.map(p => ({ number: p.number, title: p.title, state: p.state, url: p.html_url, author: p.user?.login }));
}

export async function mergePR(owner: string, repo: string, prNumber: number) {
  const client = getGitHubClient();
  await client.rest.pulls.merge({ owner, repo, pull_number: prNumber });
}

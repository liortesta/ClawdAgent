import { getGitHubClient } from './client.js';

export async function createIssue(owner: string, repo: string, title: string, body: string, labels?: string[]) {
  const client = getGitHubClient();
  const { data } = await client.rest.issues.create({ owner, repo, title, body, labels });
  return { number: data.number, url: data.html_url, title: data.title };
}

export async function listIssues(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') {
  const client = getGitHubClient();
  const { data } = await client.rest.issues.listForRepo({ owner, repo, state, per_page: 10 });
  return data.map(i => ({ number: i.number, title: i.title, state: i.state, url: i.html_url, labels: i.labels.map(l => typeof l === 'string' ? l : l.name) }));
}

export async function closeIssue(owner: string, repo: string, issueNumber: number) {
  const client = getGitHubClient();
  await client.rest.issues.update({ owner, repo, issue_number: issueNumber, state: 'closed' });
}

import { BaseTool, ToolResult } from './base-tool.js';
import { listRepos, getRepo, getFileContent } from '../../actions/github/repos.js';
import { createIssue, listIssues, closeIssue } from '../../actions/github/issues.js';
import { createPR, listPRs, mergePR } from '../../actions/github/pull-requests.js';

export class GithubTool extends BaseTool {
  name = 'github';
  description = 'Interact with GitHub (repos, issues, PRs)';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;
    const owner = input.owner as string;
    const repo = input.repo as string;

    this.log('GitHub action', { action, owner, repo });

    try {
      switch (action) {
        case 'list-repos': {
          const repos = await listRepos(owner);
          return { success: true, output: repos.map(r => `- ${r.name}: ${r.description ?? 'No description'} (${r.stars} stars)`).join('\n') };
        }

        case 'get-repo': {
          const r = await getRepo(owner, repo);
          return { success: true, output: `${r.full_name}\n${r.description}\nStars: ${r.stargazers_count} | Forks: ${r.forks_count} | ${r.language}` };
        }

        case 'get-file': {
          const content = await getFileContent(owner, repo, input.path as string, input.ref as string);
          return { success: true, output: content };
        }

        case 'list-issues': {
          const issues = await listIssues(owner, repo, (input.state as 'open' | 'closed' | 'all') ?? 'open');
          return { success: true, output: issues.map(i => `#${i.number} ${i.title} (${i.state})`).join('\n') || 'No issues' };
        }

        case 'create-issue': {
          const issue = await createIssue(owner, repo, input.title as string, input.body as string, input.labels as string[]);
          return { success: true, output: `Issue #${issue.number} created: ${issue.url}` };
        }

        case 'close-issue': {
          await closeIssue(owner, repo, input.issueNumber as number);
          return { success: true, output: `Issue #${input.issueNumber} closed` };
        }

        case 'list-prs': {
          const prs = await listPRs(owner, repo, (input.state as 'open' | 'closed' | 'all') ?? 'open');
          return { success: true, output: prs.map(p => `#${p.number} ${p.title} by ${p.author} (${p.state})`).join('\n') || 'No PRs' };
        }

        case 'create-pr': {
          const pr = await createPR(owner, repo, input.title as string, input.body as string, input.head as string, input.base as string);
          return { success: true, output: `PR #${pr.number} created: ${pr.url}` };
        }

        case 'merge-pr': {
          await mergePR(owner, repo, input.prNumber as number);
          return { success: true, output: `PR #${input.prNumber} merged` };
        }

        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Use: list-repos, get-repo, get-file, list-issues, create-issue, close-issue, list-prs, create-pr, merge-pr` };
      }
    } catch (err: any) {
      this.error('GitHub action failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }
}

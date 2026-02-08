import { ClaudeClient } from '../../core/claude-client.js';
import { SearchResult } from './brave.js';

export async function summarizeSearchResults(claude: ClaudeClient, query: string, results: SearchResult[]): Promise<string> {
  const context = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.description}\nURL: ${r.url}`).join('\n\n');

  const response = await claude.chat({
    systemPrompt: 'You are a research assistant. Summarize the search results to answer the user query. Be concise. Cite sources by number [1], [2], etc.',
    messages: [{ role: 'user', content: `Query: ${query}\n\nSearch Results:\n${context}` }],
    maxTokens: 1024,
  });

  return response.content;
}

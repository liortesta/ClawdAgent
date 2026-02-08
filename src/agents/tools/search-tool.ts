import { BaseTool, ToolResult } from './base-tool.js';
import { braveSearch } from '../../actions/web-search/brave.js';
import { scrapeUrl } from '../../actions/web-search/scraper.js';

export class SearchTool extends BaseTool {
  name = 'search';
  description = 'Search the web using Brave Search API, or scrape a URL';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const query = input.query as string;
    const action = (input.action as string) ?? 'search';

    if (!query && action !== 'scrape') return { success: false, output: '', error: 'Missing query parameter' };

    this.log('Web search', { query, action });

    try {
      if (action === 'scrape' && input.url) {
        const content = await scrapeUrl(input.url as string);
        return { success: true, output: content };
      }

      const results = await braveSearch(query, (input.count as number) ?? 5);
      const formatted = results
        .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`)
        .join('\n\n');
      return { success: true, output: formatted || 'No results found' };
    } catch (err: any) {
      this.error('Search failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }
}

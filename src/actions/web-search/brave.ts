import config from '../../config.js';
import logger from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';

export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

export async function braveSearch(query: string, count = 5): Promise<SearchResult[]> {
  if (!config.BRAVE_API_KEY) throw new Error('BRAVE_API_KEY not configured');

  return withRetry(async () => {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`, {
      headers: { 'X-Subscription-Token': config.BRAVE_API_KEY!, Accept: 'application/json' },
    });

    if (!response.ok) throw new Error(`Brave Search error: ${response.status}`);

    const data = await response.json();
    return (data.web?.results ?? []).map((r: any) => ({
      title: r.title, url: r.url, description: r.description,
    }));
  });
}

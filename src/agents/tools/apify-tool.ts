import { BaseTool, ToolResult } from './base-tool.js';
import config from '../../config.js';

const APIFY_BASE_URL = 'https://api.apify.com/v2';

const POPULAR_ACTORS: Record<string, { id: string; description: string; sampleInput: Record<string, any> }[]> = {
  'social-media': [
    { id: 'apify/facebook-posts-scraper', description: 'Scrape Facebook posts, comments, reactions', sampleInput: { startUrls: [{ url: 'https://facebook.com/PAGE' }], maxPosts: 50 } },
    { id: 'apify/instagram-scraper', description: 'Scrape Instagram posts, profiles, hashtags', sampleInput: { directUrls: ['https://instagram.com/USER'], resultsLimit: 50 } },
    { id: 'apify/tiktok-scraper', description: 'Scrape TikTok videos, profiles, hashtags', sampleInput: { profiles: ['USER'], resultsPerPage: 50 } },
    { id: 'apify/twitter-scraper', description: 'Scrape tweets, user profiles', sampleInput: { handles: ['USER'], tweetsDesired: 50 } },
    { id: 'apify/youtube-scraper', description: 'Scrape YouTube videos, channels, comments', sampleInput: { startUrls: [{ url: 'https://youtube.com/CHANNEL' }], maxResults: 50 } },
    { id: 'apify/linkedin-scraper', description: 'Scrape LinkedIn profiles, companies, jobs', sampleInput: { startUrls: [{ url: 'https://linkedin.com/in/USER' }] } },
  ],
  'e-commerce': [
    { id: 'apify/amazon-scraper', description: 'Scrape Amazon products, reviews, prices', sampleInput: { categoryOrProductUrls: [{ url: 'https://amazon.com/dp/ASIN' }] } },
    { id: 'apify/google-maps-scraper', description: 'Scrape Google Maps listings, reviews', sampleInput: { searchStringsArray: ['restaurants tel aviv'], maxCrawledPlaces: 50 } },
  ],
  'data': [
    { id: 'apify/google-search-scraper', description: 'Scrape Google search results', sampleInput: { queries: 'search query', maxPagesPerQuery: 1 } },
    { id: 'apify/website-content-crawler', description: 'Crawl entire websites', sampleInput: { startUrls: [{ url: 'https://example.com' }], maxCrawlPages: 50 } },
  ],
};

export class ApifyTool extends BaseTool {
  name = 'apify';
  description = 'Integrate with Apify for ready-made scrapers and actors — search the store, run actors, get results, and browse popular scrapers';

  private token: string;

  constructor() {
    super();
    this.token = (config as any).APIFY_API_TOKEN || '';
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;

    if (!action) return { success: false, output: '', error: 'Missing action parameter. Available: search, run, results, info, popular' };

    // search and popular don't strictly require a token
    if (!this.token && action !== 'popular') {
      return { success: false, output: '', error: 'APIFY_API_TOKEN not configured. Add it to .env' };
    }

    try {
      switch (action) {
        case 'search':
          return await this.searchStore(input);
        case 'run':
          return await this.runActor(input);
        case 'results':
          return await this.getResults(input);
        case 'info':
          return await this.getActorInfo(input);
        case 'popular':
          return this.listPopular(input);
        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Available: search, run, results, info, popular` };
      }
    } catch (err: any) {
      this.error('Apify tool error', { action, error: err.message });
      return { success: false, output: '', error: `Apify error: ${err.message}` };
    }
  }

  // ── Action: search ──────────────────────────────────────────────────

  private async searchStore(input: Record<string, unknown>): Promise<ToolResult> {
    const query = input.query as string;
    if (!query) return { success: false, output: '', error: 'Missing query parameter' };

    const category = input.category as string | undefined;
    const url = `${APIFY_BASE_URL}/store?search=${encodeURIComponent(query)}${category ? `&category=${encodeURIComponent(category)}` : ''}&limit=10`;

    this.log('Searching Apify store', { query, category });

    const res = await this.get(url);
    const items = res.data?.items || res.data || [];

    if (!items.length) return { success: true, output: 'No actors found matching your search.' };

    const formatted = items.map((a: any, i: number) => {
      const stats = a.stats ? ` | Runs: ${a.stats.totalRuns ?? 'N/A'}, Users: ${a.stats.totalUsers ?? 'N/A'}` : '';
      return `${i + 1}. **${a.name || a.title}** (${a.username}/${a.name})\n   ${a.description || 'No description'}${stats}`;
    }).join('\n\n');

    return { success: true, output: formatted };
  }

  // ── Action: run ─────────────────────────────────────────────────────

  private async runActor(input: Record<string, unknown>): Promise<ToolResult> {
    const actorId = input.actor_id as string;
    if (!actorId) return { success: false, output: '', error: 'Missing actor_id parameter (e.g. "apify/facebook-posts-scraper")' };

    const actorInput = input.input as Record<string, unknown>;
    if (!actorInput) return { success: false, output: '', error: 'Missing input parameter (object with actor configuration)' };

    const wait = input.wait !== false; // default true
    const timeout = (input.timeout as number) || 120;

    this.log('Running Apify actor', { actorId, wait, timeout });

    // Start the run
    const encodedActorId = encodeURIComponent(actorId);
    const startRes = await this.post(`${APIFY_BASE_URL}/acts/${encodedActorId}/runs?token=${this.token}`, actorInput);
    const runId = startRes.data?.id;
    const defaultDatasetId = startRes.data?.defaultDatasetId;

    if (!runId) return { success: false, output: '', error: 'Failed to start actor run — no run ID returned' };

    if (!wait) {
      return {
        success: true,
        output: `Actor run started!\nRun ID: ${runId}\nDataset ID: ${defaultDatasetId || 'N/A'}\nUse action "results" with run_id to fetch results later.`,
      };
    }

    // Poll until completed or timeout
    const startTime = Date.now();
    const maxMs = timeout * 1000;
    let status = startRes.data?.status || 'RUNNING';
    let datasetId = defaultDatasetId;

    while (status === 'RUNNING' || status === 'READY') {
      if (Date.now() - startTime > maxMs) {
        return {
          success: true,
          output: `Actor run timed out after ${timeout}s (still running).\nRun ID: ${runId}\nUse action "results" with run_id to fetch results later.`,
        };
      }

      await this.sleep(5000);

      const pollRes = await this.get(`${APIFY_BASE_URL}/actor-runs/${runId}?token=${this.token}`);
      status = pollRes.data?.status || 'UNKNOWN';
      datasetId = pollRes.data?.defaultDatasetId || datasetId;
    }

    if (status !== 'SUCCEEDED') {
      return { success: false, output: '', error: `Actor run finished with status: ${status}. Run ID: ${runId}` };
    }

    // Fetch results
    if (!datasetId) {
      return { success: true, output: `Actor run completed (${status}) but no dataset found.\nRun ID: ${runId}` };
    }

    const items = await this.get(`${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${this.token}&limit=50`);
    const data = Array.isArray(items) ? items : items.data || items;
    const count = Array.isArray(data) ? data.length : 0;

    return {
      success: true,
      output: `Actor run completed!\nRun ID: ${runId}\nStatus: ${status}\nResults: ${count} items\n\n${JSON.stringify(data, null, 2).slice(0, 10000)}`,
    };
  }

  // ── Action: results ─────────────────────────────────────────────────

  private async getResults(input: Record<string, unknown>): Promise<ToolResult> {
    const runId = input.run_id as string;
    if (!runId) return { success: false, output: '', error: 'Missing run_id parameter' };

    const format = (input.format as string) || 'json';
    const limit = (input.limit as number) || 50;

    this.log('Fetching Apify run results', { runId, format, limit });

    // Get run info to find the dataset ID
    const runInfo = await this.get(`${APIFY_BASE_URL}/actor-runs/${runId}?token=${this.token}`);
    const status = runInfo.data?.status || 'UNKNOWN';
    const datasetId = runInfo.data?.defaultDatasetId;

    if (!datasetId) {
      return { success: false, output: '', error: `No dataset found for run ${runId}. Status: ${status}` };
    }

    if (status === 'RUNNING' || status === 'READY') {
      return { success: true, output: `Run is still in progress (status: ${status}). Try again later.\nRun ID: ${runId}` };
    }

    const items = await this.get(
      `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${this.token}&format=${encodeURIComponent(format)}&limit=${limit}`
    );
    const data = Array.isArray(items) ? items : items.data || items;
    const count = Array.isArray(data) ? data.length : 0;

    return {
      success: true,
      output: `Run ID: ${runId}\nStatus: ${status}\nDataset: ${datasetId}\nResults: ${count} items\n\n${JSON.stringify(data, null, 2).slice(0, 10000)}`,
    };
  }

  // ── Action: info ────────────────────────────────────────────────────

  private async getActorInfo(input: Record<string, unknown>): Promise<ToolResult> {
    const actorId = input.actor_id as string;
    if (!actorId) return { success: false, output: '', error: 'Missing actor_id parameter' };

    this.log('Fetching Apify actor info', { actorId });

    const encodedActorId = encodeURIComponent(actorId);
    const res = await this.get(`${APIFY_BASE_URL}/acts/${encodedActorId}?token=${this.token}`);
    const actor = res.data || res;

    const lines = [
      `**${actor.name || actor.title || actorId}**`,
      `ID: ${actor.id || actorId}`,
      `Owner: ${actor.username || 'N/A'}`,
      `Description: ${actor.description || 'No description'}`,
      '',
    ];

    if (actor.stats) {
      lines.push('Stats:');
      lines.push(`  Total runs: ${actor.stats.totalRuns ?? 'N/A'}`);
      lines.push(`  Total users: ${actor.stats.totalUsers ?? 'N/A'}`);
      lines.push(`  Total builds: ${actor.stats.totalBuilds ?? 'N/A'}`);
      lines.push('');
    }

    if (actor.pricingInfo || actor.pricing) {
      const pricing = actor.pricingInfo || actor.pricing;
      lines.push(`Pricing: ${pricing.pricingModel || pricing.type || 'N/A'}`);
      if (pricing.pricePerUnitUsd) lines.push(`  Price per unit: $${pricing.pricePerUnitUsd}`);
      lines.push('');
    }

    if (actor.readme) {
      lines.push('README (truncated):');
      lines.push(actor.readme.slice(0, 2000));
    }

    return { success: true, output: lines.join('\n') };
  }

  // ── Action: popular ─────────────────────────────────────────────────

  private listPopular(input: Record<string, unknown>): ToolResult {
    const category = input.category as string | undefined;

    if (category) {
      const actors = POPULAR_ACTORS[category];
      if (!actors) {
        const available = Object.keys(POPULAR_ACTORS).join(', ');
        return { success: false, output: '', error: `Unknown category: ${category}. Available: ${available}` };
      }

      const formatted = actors.map((a, i) =>
        `${i + 1}. **${a.id}**\n   ${a.description}\n   Sample input: ${JSON.stringify(a.sampleInput)}`
      ).join('\n\n');

      return { success: true, output: `Popular ${category} actors:\n\n${formatted}` };
    }

    // List all categories
    const lines: string[] = [];
    for (const [cat, actors] of Object.entries(POPULAR_ACTORS)) {
      lines.push(`\n**${cat.toUpperCase()}**`);
      for (const a of actors) {
        lines.push(`  - ${a.id}: ${a.description}`);
      }
    }

    return { success: true, output: `Popular Apify Actors by Category:\n${lines.join('\n')}` };
  }

  // ── HTTP helpers ────────────────────────────────────────────────────

  private async get(url: string): Promise<any> {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apify ${res.status}: ${text}`);
    }
    return res.json();
  }

  private async post(url: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apify ${res.status}: ${text}`);
    }
    return res.json();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

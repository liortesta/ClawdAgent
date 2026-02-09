import { BaseTool, ToolResult } from './base-tool.js';
import config from '../../config.js';

const FIRECRAWL_API_BASE = 'https://api.firecrawl.dev/v1';

function getApiKey(): string | undefined {
  return (config as any).FIRECRAWL_API_KEY;
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getApiKey()}`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class FirecrawlTool extends BaseTool {
  name = 'firecrawl';
  description = 'Smart web scraping via Firecrawl — scrape pages, crawl sites, search, extract structured data, map site URLs.';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = String(input.action ?? '');

    if (!getApiKey()) {
      return { success: false, output: '', error: 'Firecrawl not configured. Set FIRECRAWL_API_KEY in .env' };
    }

    this.log('Firecrawl action', { action });

    try {
      switch (action) {
        case 'scrape': return await this.scrape(input);
        case 'crawl': return await this.crawl(input);
        case 'search': return await this.search(input);
        case 'extract': return await this.extract(input);
        case 'map': return await this.map(input);
        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Use: scrape, crawl, search, extract, map` };
      }
    } catch (err: any) {
      this.error('Firecrawl action failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }

  // ── scrape: Scrape a single page and return clean markdown ──────────
  private async scrape(input: Record<string, unknown>): Promise<ToolResult> {
    const url = input.url as string;
    if (!url) return { success: false, output: '', error: 'url is required' };

    const formats = (input.formats as string[]) ?? ['markdown'];
    const onlyMainContent = input.only_main_content !== false;
    const waitFor = input.wait_for as number | undefined;

    const body: Record<string, unknown> = { url, formats, onlyMainContent };
    if (waitFor) body.waitFor = waitFor;

    const res = await fetch(`${FIRECRAWL_API_BASE}/scrape`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { success: false, output: '', error: `Firecrawl scrape failed (${res.status}): ${errBody}` };
    }

    const data = await res.json() as any;

    // Build output from available formats
    const parts: string[] = [];
    if (data.data?.markdown) parts.push(data.data.markdown);
    if (data.data?.html && formats.includes('html')) parts.push(`\n--- HTML ---\n${data.data.html}`);
    if (data.data?.links && formats.includes('links')) {
      const links = (data.data.links as string[]).join('\n');
      parts.push(`\n--- Links ---\n${links}`);
    }
    if (data.data?.screenshot && formats.includes('screenshot')) {
      parts.push(`\n--- Screenshot URL ---\n${data.data.screenshot}`);
    }

    return { success: true, output: parts.join('\n') || JSON.stringify(data.data, null, 2) };
  }

  // ── crawl: Crawl an entire website (async with polling) ─────────────
  private async crawl(input: Record<string, unknown>): Promise<ToolResult> {
    const url = input.url as string;
    if (!url) return { success: false, output: '', error: 'url is required' };

    const maxPages = (input.max_pages as number) ?? 10;

    const body: Record<string, unknown> = {
      url,
      limit: maxPages,
      allowBackwardLinks: false,
      allowExternalLinks: false,
    };

    // Start the crawl
    const res = await fetch(`${FIRECRAWL_API_BASE}/crawl`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { success: false, output: '', error: `Firecrawl crawl failed (${res.status}): ${errBody}` };
    }

    const startData = await res.json() as any;
    const crawlId = startData.id;

    if (!crawlId) {
      return { success: false, output: '', error: `Firecrawl crawl did not return an ID: ${JSON.stringify(startData)}` };
    }

    this.log('Crawl started, polling for results', { crawlId });

    // Poll for completion
    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(5000);

      const pollRes = await fetch(`${FIRECRAWL_API_BASE}/crawl/${crawlId}`, {
        method: 'GET',
        headers: headers(),
      });

      if (!pollRes.ok) {
        const errBody = await pollRes.text();
        return { success: false, output: '', error: `Firecrawl crawl poll failed (${pollRes.status}): ${errBody}` };
      }

      const pollData = await pollRes.json() as any;

      if (pollData.status === 'completed') {
        const results = pollData.data ?? [];
        const formatted = results.map((page: any, i: number) => {
          const title = page.metadata?.title || page.url || `Page ${i + 1}`;
          const content = page.markdown?.slice(0, 500) || 'No content';
          return `## ${i + 1}. ${title}\nURL: ${page.url || 'N/A'}\n${content}\n`;
        }).join('\n---\n');

        return { success: true, output: `Crawl completed — ${results.length} pages:\n\n${formatted}` };
      }

      if (pollData.status === 'failed') {
        return { success: false, output: '', error: `Crawl failed: ${pollData.error || 'Unknown error'}` };
      }

      this.log(`Crawl polling attempt ${attempt + 1}/10, status: ${pollData.status}`);
    }

    return { success: false, output: '', error: `Crawl timed out after 10 polling attempts (crawl ID: ${crawlId})` };
  }

  // ── search: Search Google and optionally scrape results ─────────────
  private async search(input: Record<string, unknown>): Promise<ToolResult> {
    const query = input.query as string;
    if (!query) return { success: false, output: '', error: 'query is required' };

    const limit = (input.limit as number) ?? 5;
    const scrapeResults = input.scrape_results === true;

    const body: Record<string, unknown> = {
      query,
      limit,
      scrapeOptions: { formats: ['markdown'] },
    };

    const res = await fetch(`${FIRECRAWL_API_BASE}/search`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { success: false, output: '', error: `Firecrawl search failed (${res.status}): ${errBody}` };
    }

    const data = await res.json() as any;
    const results = data.data ?? [];

    const formatted = results.map((r: any, i: number) => {
      const title = r.title || r.metadata?.title || 'Untitled';
      const url = r.url || 'N/A';
      const description = r.description || r.metadata?.description || '';
      let entry = `${i + 1}. **${title}**\n   ${url}\n   ${description}`;

      if (scrapeResults && r.markdown) {
        entry += `\n\n${r.markdown.slice(0, 1000)}`;
      }

      return entry;
    }).join('\n\n');

    return { success: true, output: formatted || 'No search results found' };
  }

  // ── extract: Extract structured data from a page using AI ───────────
  private async extract(input: Record<string, unknown>): Promise<ToolResult> {
    const url = input.url as string;
    if (!url) return { success: false, output: '', error: 'url is required' };

    const schema = input.schema as Record<string, unknown> | undefined;
    const prompt = input.prompt as string | undefined;

    const body: Record<string, unknown> = {
      urls: [url],
    };
    if (schema) body.schema = schema;
    if (prompt) body.prompt = prompt;

    const res = await fetch(`${FIRECRAWL_API_BASE}/extract`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { success: false, output: '', error: `Firecrawl extract failed (${res.status}): ${errBody}` };
    }

    const data = await res.json() as any;
    const extracted = data.data ?? data;

    return { success: true, output: JSON.stringify(extracted, null, 2) };
  }

  // ── map: Map a website's structure (get all URLs) ───────────────────
  private async map(input: Record<string, unknown>): Promise<ToolResult> {
    const url = input.url as string;
    if (!url) return { success: false, output: '', error: 'url is required' };

    const res = await fetch(`${FIRECRAWL_API_BASE}/map`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { success: false, output: '', error: `Firecrawl map failed (${res.status}): ${errBody}` };
    }

    const data = await res.json() as any;
    const links = data.links ?? data.data ?? [];

    if (Array.isArray(links)) {
      return { success: true, output: `Found ${links.length} URLs:\n${links.join('\n')}` };
    }

    return { success: true, output: JSON.stringify(links, null, 2) };
  }
}

import { BaseTool, ToolResult } from './base-tool.js';
import config from '../../config.js';

const POPULAR_APIS: Record<string, { host: string; description: string; category: string; endpoints: string[] }> = {
  'instagram-scraper': {
    host: 'instagram-scraper-api2.p.rapidapi.com',
    description: 'Instagram profiles, posts, stories',
    category: 'social',
    endpoints: ['/user/info?username=', '/user/posts?username='],
  },
  'twitter-scraper': {
    host: 'twitter-api45.p.rapidapi.com',
    description: 'Twitter/X user data, tweets',
    category: 'social',
    endpoints: ['/timeline.php?screenname=', '/search.php?query='],
  },
  'youtube-search': {
    host: 'youtube-search-and-download.p.rapidapi.com',
    description: 'YouTube search and video info',
    category: 'social',
    endpoints: ['/search?query=', '/video?id='],
  },
  'google-translate': {
    host: 'google-translate113.p.rapidapi.com',
    description: 'Google Translate',
    category: 'translation',
    endpoints: ['/api/v1/translator/text'],
  },
  'weather': {
    host: 'weatherapi-com.p.rapidapi.com',
    description: 'Weather data',
    category: 'weather',
    endpoints: ['/current.json?q=', '/forecast.json?q='],
  },
  'news': {
    host: 'google-news13.p.rapidapi.com',
    description: 'Google News',
    category: 'data',
    endpoints: ['/latest?lr='],
  },
  'linkedin-scraper': {
    host: 'linkedin-data-api.p.rapidapi.com',
    description: 'LinkedIn profiles and companies',
    category: 'social',
    endpoints: ['/get-profile-data-by-url?url='],
  },
  'tiktok-scraper': {
    host: 'tiktok-scraper7.p.rapidapi.com',
    description: 'TikTok user data and videos',
    category: 'social',
    endpoints: ['/user/info?user_id=', '/user/posts?user_id='],
  },
  'currency-exchange': {
    host: 'currency-exchange.p.rapidapi.com',
    description: 'Real-time currency exchange rates',
    category: 'finance',
    endpoints: ['/exchange?from=&to=&q=1'],
  },
  'stock-prices': {
    host: 'yahoo-finance15.p.rapidapi.com',
    description: 'Stock prices and financial data',
    category: 'finance',
    endpoints: ['/api/v1/markets/quote?ticker=', '/api/v1/markets/stock/history?symbol='],
  },
  'openai-gpt': {
    host: 'open-ai21.p.rapidapi.com',
    description: 'OpenAI GPT text generation via RapidAPI',
    category: 'ai',
    endpoints: ['/conversationgpt35'],
  },
  'text-to-speech': {
    host: 'text-to-speech27.p.rapidapi.com',
    description: 'Convert text to speech audio',
    category: 'ai',
    endpoints: ['/speech?text=&lang=en'],
  },
  'ip-geolocation': {
    host: 'ip-geo-location.p.rapidapi.com',
    description: 'IP address geolocation lookup',
    category: 'data',
    endpoints: ['/ip/?format=json&filter='],
  },
  'url-shortener': {
    host: 'url-shortener23.p.rapidapi.com',
    description: 'Shorten and manage URLs',
    category: 'data',
    endpoints: ['/shorten', '/analytics'],
  },
};

const CATEGORIES: Record<string, string[]> = {
  social: ['instagram-scraper', 'twitter-scraper', 'youtube-search', 'linkedin-scraper', 'tiktok-scraper'],
  data: ['news', 'ip-geolocation', 'url-shortener'],
  finance: ['currency-exchange', 'stock-prices'],
  weather: ['weather'],
  translation: ['google-translate'],
  ai: ['openai-gpt', 'text-to-speech'],
};

export class RapidApiTool extends BaseTool {
  name = 'rapidapi';
  description = 'Search, explore, and call 40,000+ APIs via RapidAPI — social media scrapers, weather, finance, translation, AI, and more';

  private apiKey: string;

  constructor() {
    super();
    this.apiKey = (config as any).RAPIDAPI_KEY || '';
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    if (!this.apiKey) {
      return { success: false, output: '', error: 'RAPIDAPI_KEY not configured. Add it to your .env file. Get a free key at https://rapidapi.com' };
    }

    const action = input.action as string;

    try {
      switch (action) {
        case 'search':
          return await this.handleSearch(input);
        case 'call':
          return await this.handleCall(input);
        case 'info':
          return this.handleInfo(input);
        case 'popular':
          return this.handlePopular(input);
        default:
          return {
            success: false,
            output: '',
            error: `Unknown action: ${action}. Available: search, call, info, popular`,
          };
      }
    } catch (err: any) {
      this.error('RapidAPI tool error', { action, error: err.message });
      return { success: false, output: '', error: `RapidAPI error: ${err.message}` };
    }
  }

  // ── search: find APIs by keyword ──────────────────────────────────────────

  private async handleSearch(input: Record<string, unknown>): Promise<ToolResult> {
    const query = input.query as string;
    if (!query) return { success: false, output: '', error: 'query parameter is required' };

    const sortBy = (input.sort_by as string) || 'popularity';
    const category = input.category as string | undefined;

    this.log('Searching APIs', { query, sortBy, category });

    // Search against our curated list first
    const lowerQuery = query.toLowerCase();
    const matches = Object.entries(POPULAR_APIS).filter(([name, api]) => {
      const matchesQuery =
        name.includes(lowerQuery) ||
        api.description.toLowerCase().includes(lowerQuery) ||
        api.category.toLowerCase().includes(lowerQuery);
      const matchesCategory = !category || api.category === category.toLowerCase();
      return matchesQuery && matchesCategory;
    });

    // Also try the RapidAPI marketplace search endpoint
    let marketplaceResults = '';
    try {
      const url = new URL('https://rapidapi-marketplace.p.rapidapi.com/api/search');
      url.searchParams.set('query', query);
      if (sortBy) url.searchParams.set('sort', sortBy);

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-rapidapi-key': this.apiKey,
          'x-rapidapi-host': 'rapidapi-marketplace.p.rapidapi.com',
        },
      });

      if (res.ok) {
        const data = await res.json();
        const apis = Array.isArray(data) ? data : data.apis || data.results || [];
        if (apis.length > 0) {
          marketplaceResults = '\n\n--- Marketplace Results ---\n' +
            apis.slice(0, 10).map((api: any, i: number) =>
              `${i + 1}. **${api.name || api.title}**\n   ${api.description || ''}\n   Host: ${api.host || 'N/A'}`
            ).join('\n\n');
        }
      }
    } catch {
      // Marketplace search is best-effort; curated results are the fallback
    }

    if (matches.length === 0 && !marketplaceResults) {
      return {
        success: true,
        output: `No APIs found for "${query}". Try browsing by category with action: "popular" or call any RapidAPI endpoint directly with action: "call".`,
      };
    }

    const curatedResults = matches.length > 0
      ? '--- Curated APIs ---\n' +
        matches.map(([name, api], i) =>
          `${i + 1}. **${name}**\n   ${api.description}\n   Host: ${api.host}\n   Category: ${api.category}\n   Endpoints: ${api.endpoints.join(', ')}`
        ).join('\n\n')
      : '';

    return {
      success: true,
      output: (curatedResults + marketplaceResults).trim(),
    };
  }

  // ── call: invoke any RapidAPI endpoint ────────────────────────────────────

  private async handleCall(input: Record<string, unknown>): Promise<ToolResult> {
    const host = input.host as string;
    const endpoint = input.endpoint as string;

    if (!host) return { success: false, output: '', error: 'host parameter is required (e.g. "weatherapi-com.p.rapidapi.com")' };
    if (!endpoint) return { success: false, output: '', error: 'endpoint parameter is required (e.g. "/current.json?q=London")' };

    const method = ((input.method as string) || 'GET').toUpperCase();
    const params = input.params as Record<string, string> | undefined;
    const body = input.body as Record<string, unknown> | undefined;

    this.log('Calling RapidAPI', { host, endpoint, method });

    // Build URL
    const baseUrl = `https://${host}${endpoint}`;
    const url = new URL(baseUrl);

    // Append query params if provided
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      'x-rapidapi-key': this.apiKey,
      'x-rapidapi-host': host,
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(body);
    }

    try {
      const res = await fetch(url.toString(), fetchOptions);
      const contentType = res.headers.get('content-type') || '';

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          output: '',
          error: `RapidAPI ${res.status} ${res.statusText}: ${errorText.slice(0, 500)}`,
        };
      }

      let output: string;
      if (contentType.includes('application/json')) {
        const data = await res.json();
        output = JSON.stringify(data, null, 2);
        // Truncate very large responses
        if (output.length > 10000) {
          output = output.slice(0, 10000) + '\n\n... [truncated — response was ' + output.length + ' chars]';
        }
      } else {
        output = await res.text();
        if (output.length > 10000) {
          output = output.slice(0, 10000) + '\n\n... [truncated]';
        }
      }

      return { success: true, output };
    } catch (err: any) {
      return { success: false, output: '', error: `Fetch failed: ${err.message}` };
    }
  }

  // ── info: get details about a specific API from our curated list ──────────

  private handleInfo(input: Record<string, unknown>): ToolResult {
    const apiName = input.api_name as string;
    if (!apiName) return { success: false, output: '', error: 'api_name parameter is required' };

    const lowerName = apiName.toLowerCase().replace(/\s+/g, '-');

    // Try exact match first
    let api = POPULAR_APIS[lowerName];

    // Try partial match
    if (!api) {
      const match = Object.entries(POPULAR_APIS).find(
        ([name, a]) =>
          name.includes(lowerName) ||
          lowerName.includes(name) ||
          a.description.toLowerCase().includes(lowerName)
      );
      if (match) api = match[1];
    }

    if (!api) {
      return {
        success: true,
        output: `API "${apiName}" not found in curated list. You can still call it directly with action: "call" if you know the host and endpoint.\n\nAvailable curated APIs: ${Object.keys(POPULAR_APIS).join(', ')}`,
      };
    }

    const output = [
      `**${apiName}**`,
      `Description: ${api.description}`,
      `Host: ${api.host}`,
      `Category: ${api.category}`,
      ``,
      `Endpoints:`,
      ...api.endpoints.map((ep, i) => `  ${i + 1}. ${ep}`),
      ``,
      `Usage example:`,
      `  action: "call"`,
      `  host: "${api.host}"`,
      `  endpoint: "${api.endpoints[0]}"`,
      `  method: "GET"`,
    ].join('\n');

    return { success: true, output };
  }

  // ── popular: browse curated APIs by category ──────────────────────────────

  private handlePopular(input: Record<string, unknown>): ToolResult {
    const category = input.category as string | undefined;

    if (category) {
      const lowerCat = category.toLowerCase();
      const apiNames = CATEGORIES[lowerCat];

      if (!apiNames) {
        return {
          success: false,
          output: '',
          error: `Unknown category: ${category}. Available: ${Object.keys(CATEGORIES).join(', ')}`,
        };
      }

      const lines = apiNames.map((name) => {
        const api = POPULAR_APIS[name];
        return `- **${name}** — ${api.description}\n  Host: ${api.host}\n  Endpoints: ${api.endpoints.join(', ')}`;
      });

      return {
        success: true,
        output: `Popular ${category} APIs:\n\n${lines.join('\n\n')}`,
      };
    }

    // No category — show all categories with their APIs
    const sections = Object.entries(CATEGORIES).map(([cat, apiNames]) => {
      const items = apiNames.map((name) => {
        const api = POPULAR_APIS[name];
        return `  - **${name}** — ${api.description}`;
      });
      return `**${cat.charAt(0).toUpperCase() + cat.slice(1)}**\n${items.join('\n')}`;
    });

    return {
      success: true,
      output: `Popular RapidAPI APIs by category:\n\n${sections.join('\n\n')}\n\nUse action: "info" with api_name for details, or action: "call" to invoke any API directly.`,
    };
  }
}

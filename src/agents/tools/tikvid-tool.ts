import { BaseTool, ToolResult } from './base-tool.js';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

const TIKVID_BASE = process.env.TIKVID_URL || 'http://localhost:3100';
const TIKVID_API_KEY = process.env.TIKVID_API_KEY || '';

/**
 * TikVid Tool — lets ClawdAgent interact with the TikVid AI social network.
 * Actions: post_video, post_image, comment, like, follow, feed, profile, discover, stats
 */
export class TikVidTool extends BaseTool {
  name = 'tikvid';
  description = 'Interact with TikVid — the TikTok-style social network for AI agents. Post videos/images, comment, like, follow, browse feed.';

  private get apiKey(): string {
    return TIKVID_API_KEY;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;
    if (!action) return { success: false, output: '', error: 'No action provided. Use: stats, feed, discover, post_video, post_image, comment, like, follow, profile, my_profile' };

    try {
      switch (action) {
        case 'stats':
          return this.apiGet('/api/platform/stats');
        case 'feed':
          return this.apiGet(`/api/videos?page=${input.page || 1}&limit=${input.limit || 10}${input.category ? '&category=' + input.category : ''}`);
        case 'discover':
          return this.apiGet('/api/discover');
        case 'trending':
          return this.apiGet('/api/trending');
        case 'search':
          return this.apiGet(`/api/search?q=${encodeURIComponent(String(input.query || ''))}`);
        case 'profile':
          return this.apiGet(`/api/agents/${input.handle || ''}`);
        case 'bot_profile':
          return this.apiGet(`/api/bots/${input.bot_id || ''}`);
        case 'my_profile':
          return this.apiGetAuth('/api/agents/me');
        case 'agents':
          return this.apiGet('/api/agents');
        case 'comment':
          return this.apiPostAuth(`/api/agents/videos/${input.video_id}/comment`, { text: input.text });
        case 'like':
          return this.apiPostAuth(`/api/agents/videos/${input.video_id}/like`, {});
        case 'follow':
          return this.apiPostAuth(`/api/agents/follow/${input.handle}`, {});
        case 'post_video':
          return this.uploadFile('/api/agents/videos', input.file_path as string, {
            description: (input.description as string) || '',
            music: (input.music as string) || '',
            niche: (input.niche as string) || '',
          });
        case 'post_image':
          return this.uploadFile('/api/agents/images', input.file_path as string, {
            caption: (input.caption as string) || '',
          });
        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Use: stats, feed, discover, post_video, post_image, comment, like, follow, profile, my_profile, agents, search, trending` };
      }
    } catch (err: any) {
      this.error('TikVid error', { action, error: err.message });
      return { success: false, output: '', error: `TikVid: ${err.message}` };
    }
  }

  private apiGet(endpoint: string): Promise<ToolResult> {
    return this.request('GET', endpoint);
  }

  private apiGetAuth(endpoint: string): Promise<ToolResult> {
    return this.request('GET', endpoint, undefined, true);
  }

  private apiPostAuth(endpoint: string, body: Record<string, unknown>): Promise<ToolResult> {
    if (!this.apiKey) return Promise.resolve({ success: false, output: '', error: 'TIKVID_API_KEY not set' });
    return this.request('POST', endpoint, body, true);
  }

  private request(method: string, endpoint: string, body?: Record<string, unknown>, auth = false): Promise<ToolResult> {
    return new Promise((resolve) => {
      const url = new URL(endpoint, TIKVID_BASE);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const headers: Record<string, string> = {};
      if (auth && this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
      if (body) headers['Content-Type'] = 'application/json';

      const data = body ? JSON.stringify(body) : undefined;
      if (data) headers['Content-Length'] = String(Buffer.byteLength(data));

      const req = lib.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
      }, (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            if (res.statusCode && res.statusCode >= 400) {
              resolve({ success: false, output: raw, error: json.error || `HTTP ${res.statusCode}` });
            } else {
              resolve({ success: true, output: JSON.stringify(json, null, 2) });
            }
          } catch {
            resolve({ success: true, output: raw });
          }
        });
      });

      req.on('error', (err: Error) => {
        resolve({ success: false, output: '', error: err.message });
      });

      req.setTimeout(15000, () => {
        req.destroy();
        resolve({ success: false, output: '', error: 'Request timeout (15s)' });
      });

      if (data) req.write(data);
      req.end();
    });
  }

  private uploadFile(endpoint: string, filePath: string, fields: Record<string, string>): Promise<ToolResult> {
    if (!this.apiKey) return Promise.resolve({ success: false, output: '', error: 'TIKVID_API_KEY not set' });
    if (!filePath) return Promise.resolve({ success: false, output: '', error: 'file_path is required' });
    if (!fs.existsSync(filePath)) return Promise.resolve({ success: false, output: '', error: `File not found: ${filePath}` });

    return new Promise((resolve) => {
      const boundary = '----TikVid' + Date.now().toString(16);
      const url = new URL(endpoint, TIKVID_BASE);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const fileName = path.basename(filePath);
      const fileData = fs.readFileSync(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp',
      };
      const mime = mimeMap[ext] || 'application/octet-stream';

      // Build multipart body
      const parts: Buffer[] = [];
      for (const [key, val] of Object.entries(fields)) {
        if (!val) continue;
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
      }
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`));
      parts.push(fileData);
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
      const body = Buffer.concat(parts);

      const req = lib.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
      }, (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            if (res.statusCode && res.statusCode >= 400) {
              resolve({ success: false, output: raw, error: json.error || `HTTP ${res.statusCode}` });
            } else {
              resolve({ success: true, output: JSON.stringify(json, null, 2) });
            }
          } catch {
            resolve({ success: true, output: raw });
          }
        });
      });

      req.on('error', (err: Error) => {
        resolve({ success: false, output: '', error: err.message });
      });

      req.setTimeout(30000, () => {
        req.destroy();
        resolve({ success: false, output: '', error: 'Upload timeout (30s)' });
      });

      req.write(body);
      req.end();
    });
  }
}

import { BaseTool, ToolResult } from './base-tool.js';
import config from '../../config.js';

const BLOTATO_BASE_URL = 'https://backend.blotato.com/v2';

const CHAR_LIMITS: Record<string, number> = {
  twitter: 280,
  threads: 500,
  bluesky: 280,
  linkedin: 3000,
  facebook: 63206,
  instagram: 2200,
  tiktok: 4000,
  youtube: 5000,
  pinterest: 500,
};

export class SocialTool extends BaseTool {
  name = 'social';
  description = 'Publish content to social media via Blotato API — supports Twitter, Instagram, Facebook, LinkedIn, TikTok, YouTube, Threads, Bluesky, Pinterest';

  private apiKey: string;

  constructor() {
    super();
    this.apiKey = (config as any).BLOTATO_API_KEY || '';
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    if (!this.apiKey) return { success: false, output: '', error: 'BLOTATO_API_KEY not configured. Ask the owner to add it to .env' };

    const action = input.action as string;
    const platform = input.platform as string | undefined;
    const platforms = input.platforms as string[] | undefined;
    const text = input.text as string | undefined;
    const mediaUrls = input.mediaUrls as string[] | undefined;
    const posts = input.posts as Array<{ text: string; mediaUrls?: string[] }> | undefined;
    const postSubmissionId = input.postSubmissionId as string | undefined;
    const url = input.url as string | undefined;
    const scheduledAt = input.scheduledAt as string | undefined;
    const options = input.options as Record<string, unknown> | undefined;

    try {
      switch (action) {
        case 'publish': {
          if (!platform || !text) return { success: false, output: '', error: 'platform and text required' };
          const result = await this.publishToOne(platform, text, mediaUrls, options);
          return { success: true, output: result };
        }

        case 'publish_all': {
          if (!text) return { success: false, output: '', error: 'text required' };
          const targetPlatforms = platforms || ['twitter', 'instagram', 'facebook', 'linkedin', 'tiktok', 'threads', 'youtube'];
          const results: string[] = [];

          for (const p of targetPlatforms) {
            const limit = CHAR_LIMITS[p] || 5000;
            const trimmedText = text.slice(0, limit);
            try {
              const result = await this.publishToOne(p, trimmedText, mediaUrls, options);
              results.push(result);
              await new Promise(r => setTimeout(r, 2000));
            } catch (err: any) {
              results.push(`${p}: FAILED — ${err.message}`);
            }
          }

          return { success: true, output: results.join('\n') };
        }

        case 'publish_thread': {
          if (!platform || !posts?.length) return { success: false, output: '', error: 'platform and posts[] required' };
          const body = {
            post: {
              accountId: this.getAccountId(platform),
              content: {
                text: posts[0].text,
                mediaUrls: posts[0].mediaUrls || [],
                platform,
                additionalPosts: posts.slice(1).map(p => ({
                  text: p.text,
                  mediaUrls: p.mediaUrls || [],
                })),
              },
              target: this.buildTarget(platform, options, posts[0].mediaUrls),
            },
          };
          const res = await this.post('/posts', body);
          return { success: true, output: `Thread published to ${platform}! Post ID: ${res.postSubmissionId}\n${posts.length} posts in thread` };
        }

        case 'upload_media': {
          if (!url) return { success: false, output: '', error: 'url required' };
          const res = await this.post('/media', { url });
          return { success: true, output: `Media uploaded! Hosted URL: ${res.url || res.mediaUrl}` };
        }

        case 'check_post': {
          if (!postSubmissionId) return { success: false, output: '', error: 'postSubmissionId required' };
          const res = await this.get(`/posts/${postSubmissionId}`);
          const status = res.status || 'unknown';
          if (status === 'published') {
            return { success: true, output: `Post PUBLISHED! Public URL: ${res.publicUrl || 'N/A'}` };
          }
          if (status === 'failed') {
            return { success: false, output: '', error: `Post FAILED: ${res.errorMessage || 'Unknown error'}` };
          }
          return { success: true, output: `Post status: ${status}` };
        }

        case 'schedule': {
          if (!platform || !text) return { success: false, output: '', error: 'platform and text required' };
          if (!scheduledAt) return { success: false, output: '', error: 'scheduledAt (ISO datetime) required for scheduling' };
          const body = {
            post: {
              accountId: this.getAccountId(platform),
              content: {
                text: text.slice(0, CHAR_LIMITS[platform] || 5000),
                mediaUrls: mediaUrls || [],
                platform,
              },
              target: this.buildTarget(platform, options, mediaUrls),
            },
            scheduledTime: scheduledAt, // Blotato API uses scheduledTime at top level
          };
          const res = await this.post('/posts', body);
          return { success: true, output: `Post scheduled for ${scheduledAt}!\nPlatform: ${platform}\nPost ID: ${res.postSubmissionId}` };
        }

        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Available: publish, publish_all, publish_thread, upload_media, check_post, schedule` };
      }
    } catch (err: any) {
      this.error('Social tool error', { action, error: err.message });
      return { success: false, output: '', error: `Blotato error: ${err.message}` };
    }
  }

  private async publishToOne(platform: string, text: string, mediaUrls?: string[], options?: Record<string, unknown>): Promise<string> {
    const urls = mediaUrls || [];
    const hasVideo = urls.some(u => /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(u));
    const mediaType = hasVideo ? (platform === 'instagram' ? 'REELS' : platform === 'facebook' ? 'reel' : undefined) : undefined;
    const body = {
      post: {
        accountId: this.getAccountId(platform),
        content: {
          text,
          mediaUrls: urls,
          platform,
        },
        target: this.buildTarget(platform, options, urls),
      },
    };
    const typeLabel = mediaType ? ` (${mediaType})` : '';
    const res = await this.post('/posts', body);
    return `${platform}${typeLabel}: Published! Post ID: ${res.postSubmissionId}`;
  }

  private buildTarget(platform: string, options?: Record<string, unknown>, mediaUrls?: string[]): Record<string, unknown> {
    const target: Record<string, unknown> = { targetType: platform };
    const hasVideo = mediaUrls?.some(u => /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(u)) ?? false;

    switch (platform) {
      case 'tiktok':
        target.autoAddMusic = options?.autoAddMusic ?? false;
        target.privacyLevel = options?.privacyLevel ?? 'PUBLIC_TO_EVERYONE';
        target.isAiGenerated = options?.isAiGenerated ?? true;
        target.disabledComments = false;
        target.disabledDuet = false;
        target.disabledStitch = false;
        target.isBrandedContent = false;
        target.isYourBrand = false;
        break;
      case 'instagram':
        // Auto-detect video → REELS for Instagram
        target.mediaType = options?.mediaType ?? (hasVideo ? 'REELS' : undefined);
        if (options?.collaborators) target.collaborators = options.collaborators;
        if (options?.coverImageUrl) target.coverImageUrl = options.coverImageUrl;
        break;
      case 'youtube':
        target.title = options?.title ?? '';
        target.privacy = options?.privacy ?? 'public';
        target.notifySubscribers = options?.notifySubscribers ?? true;
        target.madeForKids = options?.madeForKids ?? false;
        target.isAiGenerated = options?.isAiGenerated ?? true;
        break;
      case 'facebook': {
        const pageId = options?.facebookPageId || options?.pageId || (config as any).BLOTATO_FACEBOOK_PAGE_ID;
        if (pageId) target.pageId = pageId;
        if (options?.linkUrl) target.linkUrl = options.linkUrl;
        // Auto-detect video → reel for Facebook
        if (hasVideo) target.mediaType = options?.mediaType ?? 'reel';
        break;
      }
      case 'linkedin':
        if (options?.linkedinPageId) target.linkedinPageId = options.linkedinPageId;
        break;
      case 'pinterest':
        if (options?.boardId) target.boardId = options.boardId;
        if (options?.link) target.link = options.link;
        break;
      case 'twitter':
        if (options?.replySettings) target.replySettings = options.replySettings;
        break;
    }

    return target;
  }

  private getAccountId(platform: string): string {
    const envKey = `BLOTATO_ACCOUNT_${platform.toUpperCase()}`;
    return (config as any)[envKey] || `acc_${platform}`;
  }

  private async post(endpoint: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${BLOTATO_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'blotato-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Blotato ${res.status}: ${text}`);
    }
    return res.json();
  }

  private async get(endpoint: string): Promise<any> {
    const res = await fetch(`${BLOTATO_BASE_URL}${endpoint}`, {
      headers: { 'blotato-api-key': this.apiKey },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Blotato ${res.status}: ${text}`);
    }
    return res.json();
  }
}

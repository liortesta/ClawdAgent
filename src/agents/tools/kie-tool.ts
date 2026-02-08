import { BaseTool, ToolResult } from './base-tool.js';
import config from '../../config.js';

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';

export class KieTool extends BaseTool {
  name = 'kie';
  description = 'AI Content Generation via Kie.ai — video, image, and music generation';

  private apiKey: string;

  constructor() {
    super();
    this.apiKey = (config as any).KIE_AI_API_KEY || '';
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    if (!this.apiKey) return { success: false, output: '', error: 'KIE_AI_API_KEY not configured. Ask the owner to add it to .env' };

    const action = input.action as string;
    const prompt = input.prompt as string | undefined;
    const imageUrl = input.imageUrl as string | undefined;
    const imageUrls = input.imageUrls as string[] | undefined;
    const model = input.model as string | undefined;
    const duration = input.duration as number | undefined;
    const aspectRatio = input.aspectRatio as string | undefined;
    const size = input.size as string | undefined;
    const nVariants = input.nVariants as number | undefined;
    const style = input.style as string | undefined;
    const resolution = input.resolution as string | undefined;
    const taskId = input.taskId as string | undefined;
    const callBackUrl = input.callBackUrl as string | undefined;

    try {
      switch (action) {
        case 'video_kling': {
          const body: Record<string, unknown> = {
            prompt,
            model_name: model || 'kling2.1',
            mode: 'std',
            duration: String(duration || 5),
            aspect_ratio: aspectRatio || '16:9',
          };
          if (imageUrl) body.image = imageUrl;
          if (callBackUrl) body.callback_url = callBackUrl;
          const res = await this.post('/kling/generate', body);
          const tid = res.data?.task_id || res.task_id;
          return { success: true, output: `Kling video task created! Task ID: ${tid}\nStatus: generating...\nUse kie status(taskId) to check progress.` };
        }

        case 'video_veo3': {
          const body: Record<string, unknown> = {
            prompt,
            model: model || 'veo3_fast',
            aspect_ratio: aspectRatio || '16:9',
          };
          if (imageUrls?.length) {
            body.imageUrls = imageUrls;
            body.generationType = imageUrls.length === 1 ? 'IMAGE_2_VIDEO' : 'REFERENCE_2_VIDEO';
          }
          if (callBackUrl) body.callBackUrl = callBackUrl;
          const res = await this.post('/veo/generate', body);
          const tid = res.data?.task_id || res.task_id;
          return { success: true, output: `Veo 3.1 video task created! Task ID: ${tid}\nModel: ${body.model}\nStatus: generating...` };
        }

        case 'video_runway': {
          const body: Record<string, unknown> = { prompt };
          if (imageUrl) body.image_url = imageUrl;
          if (duration) body.duration = duration;
          if (callBackUrl) body.callback_url = callBackUrl;
          const res = await this.post('/runway/generate', body);
          const tid = res.data?.task_id || res.task_id;
          return { success: true, output: `Runway video task created! Task ID: ${tid}\nStatus: generating...` };
        }

        case 'video_wan': {
          const body: Record<string, unknown> = {
            prompt,
            resolution: resolution || '720p',
            duration: duration || 5,
          };
          if (imageUrl) body.image_url = imageUrl;
          if (callBackUrl) body.callback_url = callBackUrl;
          const res = await this.post('/wan/generate', body);
          const tid = res.data?.task_id || res.task_id;
          return { success: true, output: `Wan 2.5 video task created! Task ID: ${tid}\nStatus: generating...` };
        }

        case 'image_4o': {
          const body: Record<string, unknown> = {
            prompt,
            size: size || '1:1',
            n: nVariants || 1,
          };
          if (imageUrl) body.image_url = imageUrl;
          const res = await this.post('/4o-image/generate', body);
          const tid = res.data?.task_id || res.task_id;
          return { success: true, output: `4o Image task created! Task ID: ${tid}\nVariants: ${body.n}\nStatus: generating...` };
        }

        case 'image_midjourney': {
          const body: Record<string, unknown> = {
            prompt,
            process_mode: imageUrl ? 'mj_img2img' : 'mj_txt2img',
          };
          if (imageUrl) body.image_url = imageUrl;
          const res = await this.post('/midjourney/generate', body);
          const tid = res.data?.task_id || res.task_id;
          return { success: true, output: `Midjourney task created! Task ID: ${tid}\nMode: ${body.process_mode}\nStatus: generating...` };
        }

        case 'image_flux': {
          const body: Record<string, unknown> = { prompt };
          if (imageUrl) body.image_url = imageUrl;
          const res = await this.post('/flux-kontext/generate', body);
          const tid = res.data?.task_id || res.task_id;
          return { success: true, output: `Flux Kontext task created! Task ID: ${tid}\nStatus: generating...` };
        }

        case 'image_grok': {
          const body: Record<string, unknown> = { prompt };
          if (imageUrl) body.image_url = imageUrl;
          const res = await this.post('/grok-imagine/generate', body);
          const tid = res.data?.task_id || res.task_id;
          return { success: true, output: `Grok Imagine task created! Task ID: ${tid}\nStatus: generating...` };
        }

        case 'music_suno': {
          const body: Record<string, unknown> = { prompt, model: 'v4' };
          if (style) body.style = style;
          if (duration) body.duration = duration;
          const res = await this.post('/suno/generate', body);
          const tid = res.data?.task_id || res.task_id;
          return { success: true, output: `Suno music task created! Task ID: ${tid}\nStatus: generating...` };
        }

        case 'status': {
          if (!taskId) return { success: false, output: '', error: 'taskId required' };
          const res = await this.get(`/task/${taskId}/fetch`);
          const data = res.data || res;
          const status = data.status || data.task_status || 'unknown';

          if (status === 'completed' || status === 'succeed') {
            const url = data.task_result?.videos?.[0]?.url
              || data.task_result?.images?.[0]?.url
              || data.output?.video_url
              || data.output?.image_url
              || data.resultUrl
              || 'URL not found';
            return { success: true, output: `COMPLETED!\nResult URL: ${url}\nYou can now publish this to social media using the social tool.` };
          }

          if (status === 'failed') {
            return { success: false, output: '', error: `Generation FAILED: ${data.error || data.task_result?.error || 'Unknown error'}` };
          }

          return { success: true, output: `Status: ${status}\nProgress: Still generating... Check again in 10-30 seconds.` };
        }

        case 'list_models': {
          return {
            success: true,
            output: `Available Models on Kie.ai:

VIDEO:
  Kling 2.1 (std/pro/master) — $0.125-$0.80/5s
  Veo 3.1 (fast/quality) — $0.40-$2.00/8s
  Runway Aleph — Scene reasoning, style transfer
  Wan 2.5 — Native audio + lip sync, affordable

IMAGE:
  GPT-4o Image — Best text rendering, accurate compositions
  Midjourney — Artistic, stylized images
  Flux Kontext — Fast, consistent characters
  Grok Imagine — Quick generation

MUSIC:
  Suno V4 — Full songs with vocals, any style

Tips: For UGC TikTok: Kling 2.1 + 4o Image. For cinematic: Veo 3.1 Quality. For cheap & fast: Veo 3.1 Fast or Kling std.`,
          };
        }

        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Available: video_kling, video_veo3, video_runway, video_wan, image_4o, image_midjourney, image_flux, image_grok, music_suno, status, list_models` };
      }
    } catch (err: any) {
      this.error('Kie tool error', { action, error: err.message });
      return { success: false, output: '', error: `Kie.ai error: ${err.message}` };
    }
  }

  private async post(endpoint: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${KIE_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kie API ${res.status}: ${text}`);
    }
    return res.json();
  }

  private async get(endpoint: string): Promise<any> {
    const res = await fetch(`${KIE_BASE_URL}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kie API ${res.status}: ${text}`);
    }
    return res.json();
  }
}

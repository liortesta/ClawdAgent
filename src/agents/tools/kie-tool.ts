import { BaseTool, ToolResult } from './base-tool.js';
import config from '../../config.js';

const KIE_BASE = 'https://api.kie.ai/api/v1';
const KIE_UPLOAD_BASE = 'https://kieai.redpandaai.co';

// ─── Convenience aliases → createTask model IDs ────────────
// Maps short action names to model ID resolvers for POST /jobs/createTask
// The resolver can be a string or a function that picks model ID based on input
type ModelResolver = string | ((i: Record<string, unknown>) => string);
interface Alias { model: ModelResolver; name: string }

const ALIASES: Record<string, Alias> = {
  // ─── VIDEO ──────────────────────────────────────────────────
  video_kling:        { model: (i) => i.imageUrl ? 'kling-2.6/image-to-video' : 'kling-2.6/text-to-video', name: 'Kling 2.6' },
  video_kling_turbo:  { model: (i) => i.imageUrl ? 'kling/v2-5-turbo-image-to-video-pro' : 'kling/v2-5-turbo-text-to-video-pro', name: 'Kling 2.5 Turbo' },
  video_kling_master: { model: (i) => i.imageUrl ? 'kling/v2-1-master-image-to-video' : 'kling/v2-1-master-text-to-video', name: 'Kling 2.1 Master' },
  video_kling_avatar: { model: (i) => i.model === 'pro' ? 'kling/ai-avatar-pro' : 'kling/ai-avatar-standard', name: 'Kling AI Avatar' },
  video_kling_motion: { model: 'kling-2.6/motion-control', name: 'Kling Motion Control' },
  video_wan:          { model: (i) => i.videoUrl ? 'wan/2-6-video-to-video' : (i.imageUrl ? 'wan/2-6-image-to-video' : 'wan/2-6-text-to-video'), name: 'Wan 2.6' },
  video_wan_animate:  { model: (i) => i.model === 'replace' ? 'wan/2-2-animate-replace' : 'wan/2-2-animate-move', name: 'Wan Animate' },
  video_wan_speech:   { model: 'wan/2-2-a14b-speech-to-video-turbo', name: 'Wan Speech-to-Video' },
  video_seedance:     { model: 'bytedance/seedance-1.5-pro', name: 'Seedance 1.5 Pro' },
  video_bytedance:    { model: (i) => i.imageUrl ? (i.model === 'fast' ? 'bytedance/v1-pro-fast-image-to-video' : 'bytedance/v1-pro-image-to-video') : 'bytedance/v1-pro-text-to-video', name: 'Bytedance V1 Pro' },
  video_hailuo:       { model: (i) => i.imageUrl ? 'hailuo/02-image-to-video-pro' : 'hailuo/02-text-to-video-pro', name: 'Hailuo Pro' },
  video_hailuo_std:   { model: (i) => i.imageUrl ? 'hailuo/02-image-to-video-standard' : 'hailuo/02-text-to-video-standard', name: 'Hailuo Standard' },
  video_sora:         { model: (i) => i.imageUrl ? 'sora-2-image-to-video' : 'sora-2-text-to-video', name: 'Sora 2' },
  video_sora_pro:     { model: (i) => i.imageUrl ? 'sora-2-pro-image-to-video' : 'sora-2-pro-text-to-video', name: 'Sora 2 Pro' },
  video_sora_chars:   { model: (i) => i.model === 'pro' ? 'sora-2-characters-pro' : 'sora-2-characters', name: 'Sora Characters' },
  video_sora_story:   { model: 'sora-2-pro-storyboard', name: 'Sora Storyboard' },
  video_grok:         { model: (i) => i.imageUrl ? 'grok-imagine/image-to-video' : 'grok-imagine/text-to-video', name: 'Grok Video' },
  video_infinitalk:   { model: 'infinitalk/from-audio', name: 'Infinitalk' },
  // ─── IMAGE ──────────────────────────────────────────────────
  image_gpt15:        { model: (i) => i.imageUrl ? 'gpt-image/1.5-image-to-image' : 'gpt-image/1.5-text-to-image', name: 'GPT Image 1.5' },
  image_midjourney:   { model: (i) => i.imageUrl ? 'midjourney/img2img' : 'midjourney/txt2img', name: 'Midjourney' },
  image_grok:         { model: (i) => i.imageUrl ? 'grok-imagine/image-to-image' : 'grok-imagine/text-to-image', name: 'Grok Imagine' },
  image_seedream:     { model: (i) => i.imageUrl ? 'seedream/4.5-edit' : 'seedream/4.5-text-to-image', name: 'Seedream 4.5' },
  image_seedream3:    { model: 'bytedance/seedream', name: 'Seedream 3.0' },
  image_imagen4:      { model: (i) => (i.model as string) || 'google/imagen4', name: 'Google Imagen4' },
  image_imagen4_fast: { model: 'google/imagen4-fast', name: 'Google Imagen4 Fast' },
  image_imagen4_ultra:{ model: 'google/imagen4-ultra', name: 'Google Imagen4 Ultra' },
  image_nano_banana:  { model: (i) => i.imageUrl ? 'google/nano-banana-edit' : 'google/nano-banana', name: 'Google Nano Banana' },
  image_nano_banana_pro: { model: 'nano-banana-pro', name: 'Nano Banana Pro' },
  image_flux2:        { model: (i) => i.imageUrl ? 'flux-2/pro-image-to-image' : 'flux-2/pro-text-to-image', name: 'Flux 2 Pro' },
  image_flux2_flex:   { model: (i) => i.imageUrl ? 'flux-2/flex-image-to-image' : 'flux-2/flex-text-to-image', name: 'Flux 2 Flex' },
  image_qwen:         { model: (i) => i.imageUrl ? (i.mode === 'edit' ? 'qwen/image-edit' : 'qwen/image-to-image') : 'qwen/text-to-image', name: 'Qwen' },
  image_ideogram:     { model: (i) => (i.model as string) || 'ideogram/character', name: 'Ideogram' },
  image_zimage:       { model: 'z-image/z-image', name: 'Z-Image' },
  // ─── ENHANCEMENT ────────────────────────────────────────────
  upscale_image:      { model: (i) => i.model === 'recraft' ? 'recraft/crisp-upscale' : 'topaz/image-upscale', name: 'Image Upscale' },
  upscale_video:      { model: 'topaz/video-upscale', name: 'Video Upscale' },
  upscale_grok:       { model: 'grok-imagine/upscale', name: 'Grok Upscale' },
  remove_bg:          { model: 'recraft/remove-background', name: 'Remove Background' },
  remove_watermark:   { model: 'sora-watermark-remover', name: 'Watermark Remover' },
  // ─── AUDIO ──────────────────────────────────────────────────
  audio_tts:          { model: 'elevenlabs/text-to-speech-turbo-2-5', name: 'ElevenLabs TTS' },
  audio_tts_multi:    { model: 'elevenlabs/text-to-speech-multilingual-v2', name: 'ElevenLabs TTS Multilingual' },
  audio_dialogue:     { model: 'elevenlabs/text-to-dialogue-v3', name: 'ElevenLabs Dialogue' },
  audio_sfx:          { model: 'elevenlabs/sound-effect-v2', name: 'ElevenLabs SFX' },
  audio_stt:          { model: 'elevenlabs/speech-to-text', name: 'ElevenLabs STT' },
  audio_isolate:      { model: 'elevenlabs/audio-isolation', name: 'Audio Isolation' },
};

// Poll endpoints for special (non-createTask) models
const SPECIAL_POLL: Record<string, string> = {
  video_veo3:   '/jobs/recordInfo?taskId={id}',
  video_runway: '/runway/record-detail?taskId={id}',
  video_luma:   '/modify/record-info?taskId={id}',
  image_4o:     '/gpt4o-image/record-info?taskId={id}',
  image_flux:   '/jobs/recordInfo?taskId={id}',
  music_suno:   '/jobs/recordInfo?taskId={id}',
};

// Root-level params (not nested inside input) for createTask
const ROOT_PARAMS = new Set(['model', 'callBackUrl', 'progressCallBackUrl', 'action', 'taskId', 'sourceAction', 'videoUrl']);

export class KieTool extends BaseTool {
  name = 'kie';
  description = 'AI Content Generation via Kie.ai — 60+ models for video, image, music, audio, upscale, and more';

  private apiKey: string;

  constructor() {
    super();
    this.apiKey = (config as any).KIE_AI_API_KEY || '';
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    if (!this.apiKey) return { success: false, output: '', error: 'KIE_AI_API_KEY not configured' };

    const action = input.action as string;

    try {
      // ─── Utility actions ─────────────────────────────────────
      if (action === 'status')       return await this.checkStatus(input.taskId as string, input.sourceAction as string | undefined);
      if (action === 'credits')      return await this.getCredits();
      if (action === 'download_url') return await this.getDownloadUrl(input.url as string);
      if (action === 'file_upload')  return await this.uploadFile(input);
      if (action === 'list_models')  return this.listModels();

      // ─── Special endpoint models (NOT createTask) ────────────
      if (action === 'video_veo3')   return await this.handleVeo3(input);
      if (action === 'video_runway') return await this.handleRunway(input);
      if (action === 'video_luma')   return await this.handleLuma(input);
      if (action === 'music_suno')   return await this.handleSuno(input);
      if (action === 'image_4o')     return await this.handleGpt4o(input);
      if (action === 'image_flux')   return await this.handleFluxKontext(input);

      // ─── Generic createTask via alias ────────────────────────
      if (ALIASES[action]) {
        return await this.handleCreateTask(action, input);
      }

      // ─── Direct model ID (power-user: action="generate", model="bytedance/seedance-1.5-pro") ─
      if (action === 'generate') {
        if (!input.model) return { success: false, output: '', error: 'model parameter required for generate action' };
        return await this.handleCreateTask('generate', input);
      }

      // ─── Unknown action ──────────────────────────────────────
      const available = [...Object.keys(ALIASES), 'video_veo3', 'video_runway', 'video_luma', 'music_suno', 'image_4o', 'image_flux', 'generate', 'status', 'credits', 'download_url', 'file_upload', 'list_models'];
      return { success: false, output: '', error: `Unknown action: ${action}. Available: ${available.join(', ')}` };

    } catch (err: any) {
      this.error('Kie tool error', { action, error: err.message });
      return { success: false, output: '', error: `Kie.ai error: ${err.message}` };
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  GENERIC createTask HANDLER
  // ═══════════════════════════════════════════════════════════

  private async handleCreateTask(action: string, input: Record<string, unknown>): Promise<ToolResult> {
    const alias = ALIASES[action];
    let modelId: string;
    let displayName: string;

    if (alias) {
      modelId = typeof alias.model === 'function' ? alias.model(input) : alias.model;
      displayName = alias.name;
    } else {
      // Direct generate action
      modelId = input.model as string;
      displayName = modelId;
    }

    // Build input object — everything except root-level params
    const inputObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input)) {
      if (!ROOT_PARAMS.has(key) && val !== undefined) {
        inputObj[key] = val;
      }
    }

    // Normalize camelCase → snake_case for Kie.ai API compatibility
    if (inputObj.imageUrl && !inputObj.image_url) {
      inputObj.image_url = inputObj.imageUrl;
      delete inputObj.imageUrl;
    }
    if (inputObj.audioUrl && !inputObj.audio_url) {
      inputObj.audio_url = inputObj.audioUrl;
      delete inputObj.audioUrl;
    }
    if (inputObj.imageUrls && !inputObj.input_urls) {
      inputObj.input_urls = inputObj.imageUrls;
      delete inputObj.imageUrls;
    }
    if (inputObj.aspectRatio && !inputObj.aspect_ratio) {
      inputObj.aspect_ratio = inputObj.aspectRatio;
      delete inputObj.aspectRatio;
    }
    if (inputObj.languageCode && !inputObj.language_code) {
      inputObj.language_code = inputObj.languageCode;
      delete inputObj.languageCode;
    }
    if (inputObj.outputFormat && !inputObj.output_format) {
      inputObj.output_format = inputObj.outputFormat;
      delete inputObj.outputFormat;
    }
    if (inputObj.imageInput && !inputObj.image_input) {
      inputObj.image_input = inputObj.imageInput;
      delete inputObj.imageInput;
    }

    const body: Record<string, unknown> = {
      model: modelId,
      input: inputObj,
    };
    if (input.callBackUrl) body.callBackUrl = input.callBackUrl;
    if (input.progressCallBackUrl) body.progressCallBackUrl = input.progressCallBackUrl;

    const res = await this.post('/jobs/createTask', body);
    const result = this.taskCreated(displayName, action, res);
    if (!result.success) {
      this.error('createTask failed', { action, modelId, response: JSON.stringify(res).slice(0, 500) });
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════
  //  SPECIAL ENDPOINT HANDLERS (dedicated APIs, not createTask)
  // ═══════════════════════════════════════════════════════════

  private async handleVeo3(input: Record<string, unknown>): Promise<ToolResult> {
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      model: input.model || 'veo3_fast',
      aspect_ratio: input.aspectRatio || input.aspect_ratio || '16:9',
      enableTranslation: true,
    };
    const imageUrls = input.imageUrls as string[] | undefined;
    if (imageUrls?.length) {
      body.imageUrls = imageUrls;
      body.generationType = imageUrls.length === 1 ? 'IMAGE_2_VIDEO' : 'FIRST_AND_LAST_FRAMES_2_VIDEO';
    }
    if (input.callBackUrl) body.callBackUrl = input.callBackUrl;
    const res = await this.post('/veo/generate', body);
    return this.taskCreated(`Veo 3.1 (${body.model})`, 'video_veo3', res);
  }

  private async handleRunway(input: Record<string, unknown>): Promise<ToolResult> {
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      duration: input.duration || 5,
      quality: input.resolution === '1080p' ? '1080p' : '720p',
    };
    if (input.imageUrl) {
      body.imageUrl = input.imageUrl;
    } else {
      body.aspectRatio = input.aspectRatio || '16:9';
    }
    if (input.callBackUrl) body.callBackUrl = input.callBackUrl;
    const res = await this.post('/runway/generate', body);
    return this.taskCreated('Runway', 'video_runway', res);
  }

  private async handleLuma(input: Record<string, unknown>): Promise<ToolResult> {
    if (!input.imageUrl && !input.videoUrl) return { success: false, output: '', error: 'videoUrl or imageUrl required for Luma Modify' };
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      videoUrl: input.videoUrl || input.imageUrl,
    };
    if (input.callBackUrl) body.callBackUrl = input.callBackUrl;
    const res = await this.post('/modify/generate', body);
    return this.taskCreated('Luma Modify', 'video_luma', res);
  }

  private async handleSuno(input: Record<string, unknown>): Promise<ToolResult> {
    const isCustom = !!(input.style || input.title);
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      model: input.model || 'V4',
      customMode: isCustom,
    };
    if (isCustom) {
      if (input.style) body.style = input.style;
      if (input.title) body.title = input.title;
    }
    if (input.callBackUrl) body.callBackUrl = input.callBackUrl;
    const res = await this.post('/generate', body);
    return this.taskCreated('Suno', 'music_suno', res);
  }

  private async handleGpt4o(input: Record<string, unknown>): Promise<ToolResult> {
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      size: input.size || '1:1',
    };
    if (input.imageUrl) body.filesUrl = [input.imageUrl];
    if (input.callBackUrl) body.callBackUrl = input.callBackUrl;
    const res = await this.post('/gpt4o-image/generate', body);
    return this.taskCreated('GPT-4o Image', 'image_4o', res);
  }

  private async handleFluxKontext(input: Record<string, unknown>): Promise<ToolResult> {
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      model: input.model || 'flux-kontext-pro',
      aspectRatio: input.aspectRatio || '16:9',
      outputFormat: 'png',
      enableTranslation: true,
    };
    if (input.imageUrl) body.inputImage = input.imageUrl;
    if (input.callBackUrl) body.callBackUrl = input.callBackUrl;
    const res = await this.post('/flux/kontext/generate', body);
    return this.taskCreated('Flux Kontext', 'image_flux', res);
  }

  // ═══════════════════════════════════════════════════════════
  //  STATUS POLLING
  // ═══════════════════════════════════════════════════════════

  private async checkStatus(taskId: string, sourceAction?: string): Promise<ToolResult> {
    if (!taskId) return { success: false, output: '', error: 'taskId required' };

    // Use model-specific poll endpoint if available, else default
    const pollTemplate = (sourceAction && SPECIAL_POLL[sourceAction]) || '/jobs/recordInfo?taskId={id}';
    const pollPath = pollTemplate.replace('{id}', taskId);

    // Auto-poll: retry up to 8 times (every 5s = ~40s max wait) until done
    const MAX_POLLS = 8;
    const POLL_INTERVAL = 5000;

    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      let data: any;
      try {
        const res = await this.get(pollPath);
        data = res.data || res;
      } catch (err: any) {
        // If model-specific endpoint fails, fall back to unified polling
        if (pollPath !== `/jobs/recordInfo?taskId=${taskId}`) {
          try {
            const fallback = await this.get(`/jobs/recordInfo?taskId=${taskId}`);
            data = fallback.data || fallback;
          } catch { throw err; }
        } else {
          throw err;
        }
      }

      const state = (data.state || data.status || '').toLowerCase();

      if (state === 'success' || state === 'completed' || state === 'succeed') {
        const resultUrl = this.extractResultUrl(data);
        const allUrls = this.extractAllResultUrls(data);
        const urlList = allUrls.length > 1 ? `\nAll URLs:\n${allUrls.map((u, i) => `  ${i + 1}. ${u}`).join('\n')}` : '';
        return {
          success: true,
          output: `COMPLETED!\nResult URL: ${resultUrl || 'URL not found'}${urlList}\n${resultUrl ? 'You can now publish this to social media using the social tool.' : `Raw: ${JSON.stringify(data).slice(0, 500)}`}`,
        };
      }

      if (state === 'fail' || state === 'failed' || state === 'create_task_failed' || state === 'generate_failed') {
        return { success: false, output: '', error: `Generation FAILED: ${data.failMsg || data.errorMessage || data.error || 'Unknown error'}` };
      }

      // Still processing — wait and poll again (unless last attempt)
      if (attempt < MAX_POLLS - 1) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      } else {
        const progress = data.progress ? ` (${data.progress}%)` : '';
        return { success: true, output: `Status: ${state || 'generating'}${progress}\nStill processing after ${MAX_POLLS * POLL_INTERVAL / 1000}s. Check again in 30 seconds.` };
      }
    }

    return { success: true, output: 'Status: still generating. Check again in 30 seconds.' };
  }

  // ═══════════════════════════════════════════════════════════
  //  UTILITY ACTIONS
  // ═══════════════════════════════════════════════════════════

  private async getCredits(): Promise<ToolResult> {
    const res = await this.get('/chat/credit');
    const credits = res.data ?? res;
    return { success: true, output: `Kie.ai credit balance: ${credits}` };
  }

  private async getDownloadUrl(url: string): Promise<ToolResult> {
    if (!url) return { success: false, output: '', error: 'url required' };
    const res = await this.post('/common/download-url', { url });
    const downloadUrl = res.data ?? res;
    return { success: true, output: `Download URL (valid 20 min): ${downloadUrl}` };
  }

  private async uploadFile(input: Record<string, unknown>): Promise<ToolResult> {
    const method = input.method as string || 'url';
    const uploadPath = (input.uploadPath as string) || '';
    const fileName = input.fileName as string | undefined;

    if (method === 'url') {
      if (!input.fileUrl) return { success: false, output: '', error: 'fileUrl required for url upload' };
      const body: Record<string, unknown> = { fileUrl: input.fileUrl, uploadPath };
      if (fileName) body.fileName = fileName;
      const res = await this.postUpload('/api/file-url-upload', body);
      return { success: true, output: `File uploaded!\nURL: ${res.data?.fileUrl || JSON.stringify(res.data).slice(0, 300)}` };
    }

    if (method === 'base64') {
      if (!input.base64Data) return { success: false, output: '', error: 'base64Data required for base64 upload' };
      const body: Record<string, unknown> = { base64Data: input.base64Data, uploadPath };
      if (fileName) body.fileName = fileName;
      const res = await this.postUpload('/api/file-base64-upload', body);
      return { success: true, output: `File uploaded!\nURL: ${res.data?.fileUrl || JSON.stringify(res.data).slice(0, 300)}` };
    }

    return { success: false, output: '', error: 'method must be "url" or "base64"' };
  }

  // ═══════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════

  private taskCreated(modelName: string, action: string, res: any): ToolResult {
    const tid = res.data?.taskId || res.data?.task_id || res.taskId || res.task_id;
    if (!tid) {
      return { success: false, output: '', error: `No taskId returned. Response: ${JSON.stringify(res).slice(0, 500)}` };
    }
    return {
      success: true,
      output: `${modelName} task created!\nTask ID: ${tid}\nStatus: generating...\nUse kie({ action: "status", taskId: "${tid}", sourceAction: "${action}" }) to check progress.`,
    };
  }

  private extractResultUrl(data: any): string {
    if (data.resultJson) {
      try {
        const parsed = JSON.parse(data.resultJson);
        if (parsed.resultUrls?.[0]) return parsed.resultUrls[0];
        if (parsed.resultUrl) return parsed.resultUrl;
      } catch { /* not JSON */ }
    }
    if (data.response?.resultUrls?.[0]) return data.response.resultUrls[0];
    return data.task_result?.videos?.[0]?.url
      || data.task_result?.images?.[0]?.url
      || data.output?.video_url
      || data.output?.image_url
      || data.resultUrl
      || '';
  }

  private extractAllResultUrls(data: any): string[] {
    if (data.resultJson) {
      try {
        const parsed = JSON.parse(data.resultJson);
        if (parsed.resultUrls?.length) return parsed.resultUrls;
      } catch { /* not JSON */ }
    }
    if (data.response?.resultUrls?.length) return data.response.resultUrls;
    const single = this.extractResultUrl(data);
    return single ? [single] : [];
  }

  private listModels(): ToolResult {
    const lines: string[] = ['Available Models on Kie.ai (60+ models):\n'];

    lines.push('VIDEO GENERATION:');
    lines.push('  video_kling — Kling 2.6. Best all-rounder. Text/image to video. 5s/10s. 16:9/9:16/1:1.');
    lines.push('  video_kling_turbo — Kling 2.5 Turbo Pro. Faster generation.');
    lines.push('  video_kling_master — Kling 2.1 Master. High quality.');
    lines.push('  video_kling_avatar — Kling AI Avatar (standard/pro). Talking head from image.');
    lines.push('  video_kling_motion — Kling 2.6 Motion Control. Camera path control.');
    lines.push('  video_veo3 — Google Veo 3.1 (veo3_fast/veo3). Cinematic quality.');
    lines.push('  video_runway — Runway. 5s/10s. 720p/1080p.');
    lines.push('  video_wan — Wan 2.6. Text/image/video to video. 5s/10s/15s. 720p/1080p.');
    lines.push('  video_wan_animate — Wan Animate (move/replace). Object animation.');
    lines.push('  video_wan_speech — Wan Speech-to-Video. Audio-driven talking head.');
    lines.push('  video_seedance — Bytedance Seedance 1.5 Pro. 4s/8s/12s. Up to 1080p. Optional audio.');
    lines.push('  video_bytedance — Bytedance V1 Pro. Text/image to video. Fast option available.');
    lines.push('  video_hailuo — Hailuo Pro. Text/image to video. High quality.');
    lines.push('  video_hailuo_std — Hailuo Standard. Cheaper option.');
    lines.push('  video_sora — Sora 2. OpenAI video. Text/image to video. Progress tracking.');
    lines.push('  video_sora_pro — Sora 2 Pro. Higher quality.');
    lines.push('  video_sora_chars — Sora Characters. Consistent character generation.');
    lines.push('  video_sora_story — Sora Storyboard. Multi-scene storytelling.');
    lines.push('  video_grok — Grok Video. Text/image to video. 6s/10s.');
    lines.push('  video_luma — Luma Modify. Modify existing videos with prompts.');
    lines.push('  video_infinitalk — Infinitalk. Image + audio → talking head video.');
    lines.push('');

    lines.push('IMAGE GENERATION:');
    lines.push('  image_4o — GPT-4o Image (legacy). Best text rendering. 1:1/3:2/2:3.');
    lines.push('  image_gpt15 — GPT Image 1.5. Newer, supports image-to-image editing.');
    lines.push('  image_midjourney — Midjourney. Artistic, stylized. txt2img & img2img.');
    lines.push('  image_flux — Flux Kontext Pro/Max. Fast, consistent characters.');
    lines.push('  image_flux2 — Flux 2 Pro. Text/image to image. 1K/2K resolution.');
    lines.push('  image_flux2_flex — Flux 2 Flex. Flexible variant.');
    lines.push('  image_grok — Grok Imagine. Text/image generation. Fast.');
    lines.push('  image_seedream — Seedream 4.5. Bytedance. Text/image editing.');
    lines.push('  image_seedream3 — Seedream 3.0. Bytedance. Text to image.');
    lines.push('  image_imagen4 — Google Imagen4. High quality. Variants: fast/ultra.');
    lines.push('  image_imagen4_fast — Imagen4 Fast. Quick generation.');
    lines.push('  image_imagen4_ultra — Imagen4 Ultra. Best quality.');
    lines.push('  image_nano_banana — Google Nano Banana. Text/image editing.');
    lines.push('  image_nano_banana_pro — Nano Banana Pro. Best image gen. 4K, up to 8 ref images. 20K char prompt.');
    lines.push('  image_qwen — Qwen. Text/image generation & editing.');
    lines.push('  image_ideogram — Ideogram. Character consistency.');
    lines.push('  image_zimage — Z-Image. Fast generation.');
    lines.push('');

    lines.push('ENHANCEMENT:');
    lines.push('  upscale_image — Image Upscale (Topaz or Recraft). 2x/4x/8x.');
    lines.push('  upscale_video — Video Upscale (Topaz). 2x/4x.');
    lines.push('  upscale_grok — Grok Upscale. Enhance grok-generated images.');
    lines.push('  remove_bg — Remove Background (Recraft). Clean cutouts.');
    lines.push('  remove_watermark — Watermark Remover (Sora). Remove watermarks from video.');
    lines.push('');

    lines.push('MUSIC:');
    lines.push('  music_suno — Suno V4/V4.5/V5. Full songs with vocals. Custom or auto.');
    lines.push('');

    lines.push('AUDIO:');
    lines.push('  audio_tts — ElevenLabs TTS Turbo. Fast text-to-speech. 140+ voices.');
    lines.push('  audio_tts_multi — ElevenLabs TTS Multilingual. Multi-language support.');
    lines.push('  audio_dialogue — ElevenLabs Dialogue v3. Multi-speaker dialogue generation.');
    lines.push('  audio_sfx — ElevenLabs Sound Effects. 0.5-22 second effects.');
    lines.push('  audio_stt — ElevenLabs Speech-to-Text. Transcription with diarization.');
    lines.push('  audio_isolate — Audio Isolation. Extract voice from noisy audio.');
    lines.push('');

    lines.push('UTILITY:');
    lines.push('  credits — Check Kie.ai credit balance.');
    lines.push('  download_url — Get 20-min download link for generated files.');
    lines.push('  file_upload — Upload files to Kie.ai (method: "url" or "base64").');
    lines.push('  generate — Direct model access: kie({ action: "generate", model: "model/id", prompt: "..." })');
    lines.push('');

    lines.push('TIPS:');
    lines.push('  UGC TikTok: image_4o (face) → video_kling (animate) → social publish_all');
    lines.push('  Cinematic: video_veo3 (model: "veo3") or video_sora_pro');
    lines.push('  Budget: video_veo3 (model: "veo3_fast") or video_hailuo_std');
    lines.push('  Talking head: video_kling_avatar or video_infinitalk');
    lines.push('  Music video: music_suno + video_seedance');

    return { success: true, output: lines.join('\n') };
  }

  // ═══════════════════════════════════════════════════════════
  //  HTTP
  // ═══════════════════════════════════════════════════════════

  private async post(endpoint: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${KIE_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kie API ${res.status}: ${text}`);
    }
    return res.json();
  }

  private async get(endpoint: string): Promise<any> {
    const res = await fetch(`${KIE_BASE}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kie API ${res.status}: ${text}`);
    }
    return res.json();
  }

  private async postUpload(endpoint: string, body: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${KIE_UPLOAD_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kie Upload ${res.status}: ${text}`);
    }
    return res.json();
  }
}

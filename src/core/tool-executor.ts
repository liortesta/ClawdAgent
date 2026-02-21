import { BashTool } from '../agents/tools/bash-tool.js';
import { FileTool } from '../agents/tools/file-tool.js';
import { SearchTool } from '../agents/tools/search-tool.js';
import { GithubTool } from '../agents/tools/github-tool.js';
import { TaskTool } from '../agents/tools/task-tool.js';
import { DbTool } from '../agents/tools/db-tool.js';
import { BrowserTool } from '../agents/tools/browser-tool.js';
import { KieTool } from '../agents/tools/kie-tool.js';
import { SocialTool } from '../agents/tools/social-tool.js';
import { OpenClawTool } from '../agents/tools/openclaw-tool.js';
import { CronTool } from '../agents/tools/cron-tool.js';
import { MemoryTool } from '../agents/tools/memory-tool.js';
import { AutoTool } from '../agents/tools/auto-tool.js';
import { EmailTool } from '../agents/tools/email-tool.js';
import { WorkflowTool } from '../agents/tools/workflow-tool.js';
import { AnalyticsTool } from '../agents/tools/analytics-tool.js';
import { ClaudeCodeTool } from '../agents/tools/claude-code-tool.js';
import { DeviceTool } from '../agents/tools/device-tool.js';
import { ElevenLabsTool } from '../agents/tools/elevenlabs-tool.js';
import { FirecrawlTool } from '../agents/tools/firecrawl-tool.js';
import { RapidApiTool } from '../agents/tools/rapidapi-tool.js';
import { ApifyTool } from '../agents/tools/apify-tool.js';
import { SSHTool } from '../agents/tools/ssh-tool.js';
import { TradingTool } from '../agents/tools/trading-tool.js';
import { RAGTool } from '../agents/tools/rag-tool.js';
import { WhatsAppTool } from '../agents/tools/whatsapp-tool.js';
import { BaseTool, ToolResult } from '../agents/tools/base-tool.js';
import { hasPermission } from '../security/roles.js';
import { audit } from '../security/audit-log.js';
import { onToolExecuted, checkCommandSafety, isBridgeReady } from './intelligence-bridge.js';
import { getToolRegistry } from './tool-registry.js';
import { isPanicActive } from './kill-switch.js';
import { getApprovalGate } from './approval-gate.js';
import logger from '../utils/logger.js';

// Tools that require human approval before execution (irreversible external actions)
const APPROVAL_REQUIRED_TOOLS: Record<string, { riskScore: number; riskCategory: string; timeoutMs: number }> = {
  trading: { riskScore: 0.9, riskCategory: 'financial_transaction', timeoutMs: 60_000 },
  social: { riskScore: 0.5, riskCategory: 'outgoing_communication', timeoutMs: 120_000 },
};
import type { PluginLoader } from './plugin-loader.js';
import type { ToolCreator } from './tool-creator.js';

// Tracking context — set by engine.ts before each message processing cycle
let currentAgentId = 'system';
let currentIntent = 'unknown';

/** Set execution context for intelligence tracking */
export function setExecutionContext(agentId: string, intent: string): void {
  currentAgentId = agentId;
  currentIntent = intent;
}

// Singleton tool instances
const toolInstances: Map<string, BaseTool> = new Map();
let initialized = false;
let pluginLoaderRef: PluginLoader | null = null;
let toolCreatorRef: ToolCreator | null = null;

/** Bridge plugin tools into the tool executor */
export function setPluginLoader(loader: PluginLoader): void {
  pluginLoaderRef = loader;
  logger.info('Plugin loader bridged into tool executor');
}

/** Bridge dynamic tool creator into the tool executor */
export function setToolCreator(creator: ToolCreator): void {
  toolCreatorRef = creator;
  logger.info('Tool creator bridged into tool executor');
}

export function initTools(): void {
  if (initialized) return;
  // Register all built-in tools (kept for backward compatibility — registry handles config overrides)
  toolInstances.set('bash', new BashTool());
  toolInstances.set('file', new FileTool());
  toolInstances.set('search', new SearchTool());
  toolInstances.set('github', new GithubTool());
  toolInstances.set('task', new TaskTool());
  toolInstances.set('db', new DbTool());
  toolInstances.set('browser', new BrowserTool());
  toolInstances.set('kie', new KieTool());
  toolInstances.set('social', new SocialTool());
  toolInstances.set('openclaw', new OpenClawTool());
  toolInstances.set('cron', new CronTool());
  toolInstances.set('memory', new MemoryTool());
  toolInstances.set('auto', new AutoTool());
  toolInstances.set('email', new EmailTool());
  toolInstances.set('workflow', new WorkflowTool());
  toolInstances.set('analytics', new AnalyticsTool());
  toolInstances.set('claude-code', new ClaudeCodeTool());
  toolInstances.set('device', new DeviceTool());
  toolInstances.set('elevenlabs', new ElevenLabsTool());
  toolInstances.set('firecrawl', new FirecrawlTool());
  toolInstances.set('rapidapi', new RapidApiTool());
  toolInstances.set('apify', new ApifyTool());
  toolInstances.set('ssh', new SSHTool());
  toolInstances.set('trading', new TradingTool());
  toolInstances.set('rag', new RAGTool());
  toolInstances.set('whatsapp', new WhatsAppTool());

  // Apply config-driven overrides (TOOLS_DISABLED env var)
  const registry = getToolRegistry();
  const disabledList = process.env.TOOLS_DISABLED?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
  for (const name of disabledList) {
    toolInstances.delete(name);
    registry.setEnabled(name, false);
    logger.info('Tool disabled via config', { name });
  }

  initialized = true;
  logger.info('Tool executor initialized', { tools: Array.from(toolInstances.keys()), disabled: disabledList });
}

/** Get list of all registered tools and their status */
export function getToolStatus(): Array<{ name: string; enabled: boolean }> {
  const registry = getToolRegistry();
  return registry.listAll();
}

/**
 * Get Anthropic-format tool definitions for the AI.
 * Only returns tools that the agent is allowed to use.
 */
export function getToolDefinitions(allowedTools: string[]): any[] {
  const definitions: any[] = [];

  if (allowedTools.includes('bash') || allowedTools.includes('ssh') || allowedTools.includes('docker')) {
    definitions.push({
      name: 'bash',
      description: 'Execute a bash/shell command on the server. Use for: checking server status (uptime, df, free), running scripts, installing packages, docker commands, SSH, file operations, git, etc. Returns real output.',
      input_schema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string' as const, description: 'The bash command to execute' },
        },
        required: ['command'],
      },
    });
  }

  if (allowedTools.includes('file')) {
    definitions.push({
      name: 'file',
      description: 'Read, write, or check files on the LOCAL machine only. WARNING: This tool does NOT work on the remote server. For remote files, use the bash tool with "cat <path>" to read or "echo content > path" to write.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['read', 'write', 'stat'], description: 'File operation' },
          path: { type: 'string' as const, description: 'Absolute file path' },
          content: { type: 'string' as const, description: 'Content to write (for write action)' },
        },
        required: ['action', 'path'],
      },
    });
  }

  if (allowedTools.includes('search') || allowedTools.includes('scrape')) {
    definitions.push({
      name: 'search',
      description: 'Search the web using Brave Search API, or scrape a URL for content.',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string' as const, description: 'Search query' },
          action: { type: 'string' as const, enum: ['search', 'scrape'], description: 'Search web or scrape a specific URL' },
          url: { type: 'string' as const, description: 'URL to scrape (for scrape action)' },
        },
        required: ['query'],
      },
    });
  }

  if (allowedTools.includes('github')) {
    definitions.push({
      name: 'github',
      description: 'Interact with GitHub: repos, issues, PRs, file content.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['list-repos', 'get-repo', 'get-file', 'list-issues', 'create-issue', 'close-issue', 'list-prs', 'create-pr', 'merge-pr'], description: 'GitHub action' },
          owner: { type: 'string' as const, description: 'Repo owner' },
          repo: { type: 'string' as const, description: 'Repo name' },
          title: { type: 'string' as const, description: 'Issue/PR title' },
          body: { type: 'string' as const, description: 'Issue/PR body' },
          path: { type: 'string' as const, description: 'File path (for get-file)' },
          head: { type: 'string' as const, description: 'Head branch (for create-pr)' },
          base: { type: 'string' as const, description: 'Base branch (for create-pr)' },
          issueNumber: { type: 'number' as const, description: 'Issue number' },
          prNumber: { type: 'number' as const, description: 'PR number' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('task') || allowedTools.includes('reminder')) {
    definitions.push({
      name: 'task',
      description: 'Create, list, complete, and manage tasks for the user.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['create', 'list', 'complete', 'overdue'], description: 'Task action' },
          userId: { type: 'string' as const, description: 'User ID' },
          title: { type: 'string' as const, description: 'Task title' },
          description: { type: 'string' as const, description: 'Task description' },
          priority: { type: 'string' as const, description: 'Priority (p0-p3)' },
          taskId: { type: 'string' as const, description: 'Task ID (for complete)' },
          status: { type: 'string' as const, description: 'Filter by status (for list)' },
        },
        required: ['action', 'userId'],
      },
    });
  }

  if (allowedTools.includes('browser')) {
    definitions.push({
      name: 'browser',
      description: 'Web browser automation (Playwright). Use for signing up for websites, filling forms, scraping data, taking screenshots, interacting with web UIs. Actions: navigate(url), click(selector), type(selector,text), fill_form(fields), screenshot(), extract(selector), get_links(), scroll(direction), wait(selector), evaluate(js), close().',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['navigate', 'click', 'type', 'fill_form', 'screenshot', 'extract', 'get_links', 'scroll', 'wait', 'evaluate', 'close'], description: 'Browser action' },
          url: { type: 'string' as const, description: 'URL (for navigate)' },
          selector: { type: 'string' as const, description: 'CSS selector (for click, type, extract, wait)' },
          text: { type: 'string' as const, description: 'Text to type (for type action)' },
          fields: { type: 'object' as const, description: 'Map of selector -> value (for fill_form)' },
          js: { type: 'string' as const, description: 'JavaScript to evaluate (for evaluate action)' },
          direction: { type: 'string' as const, enum: ['up', 'down'], description: 'Scroll direction' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('kie')) {
    definitions.push({
      name: 'kie',
      description: 'AI Content Generation via Kie.ai — 60+ models. VIDEO: video_kling, video_kling_turbo, video_kling_avatar, video_veo3, video_runway, video_wan, video_seedance, video_bytedance, video_hailuo, video_sora, video_sora_pro, video_sora_chars, video_grok, video_luma, video_infinitalk. IMAGE: image_4o, image_gpt15, image_midjourney, image_flux, image_flux2, image_grok, image_seedream, image_imagen4, image_qwen, image_ideogram, image_zimage. ENHANCE: upscale_image, upscale_video, remove_bg, remove_watermark. MUSIC: music_suno. AUDIO: audio_tts, audio_dialogue, audio_sfx, audio_stt, audio_isolate. UTILITY: status, credits, download_url, file_upload, generate, list_models. All async — returns taskId, poll with status.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, description: 'Action name (see description for full list). Use list_models for details.' },
          prompt: { type: 'string' as const, description: 'Creative prompt for generation' },
          text: { type: 'string' as const, description: 'Text input (for TTS, SFX, dialogue)' },
          imageUrl: { type: 'string' as const, description: 'Input image URL (for image-to-video, img2img, Luma Modify)' },
          videoUrl: { type: 'string' as const, description: 'Input video URL (for video-to-video, Luma Modify)' },
          imageUrls: { type: 'array' as const, items: { type: 'string' as const }, description: 'Multiple image URLs (for Veo3 transitions)' },
          model: { type: 'string' as const, description: 'Model variant or direct model ID for generate action' },
          duration: { type: 'number' as const, description: 'Duration in seconds' },
          aspectRatio: { type: 'string' as const, description: 'Aspect ratio: 16:9, 9:16, 1:1, etc.' },
          aspect_ratio: { type: 'string' as const, description: 'Aspect ratio (snake_case variant for createTask models)' },
          size: { type: 'string' as const, description: 'Image size for GPT-4o: 1:1, 3:2, 2:3' },
          resolution: { type: 'string' as const, description: 'Video resolution: 720p, 1080p' },
          style: { type: 'string' as const, description: 'Music style (Suno custom mode)' },
          title: { type: 'string' as const, description: 'Song title (Suno custom mode)' },
          voice: { type: 'string' as const, description: 'TTS voice name (default: Rachel)' },
          dialogue: { type: 'array' as const, description: 'Dialogue items for audio_dialogue [{text, voice}]' },
          image_url: { type: 'string' as const, description: 'Image URL (createTask format)' },
          image_urls: { type: 'string' as const, description: 'Image URLs (createTask format)' },
          audio_url: { type: 'string' as const, description: 'Audio URL (for STT, Infinitalk)' },
          video_urls: { type: 'array' as const, items: { type: 'string' as const }, description: 'Video URLs (for Wan video-to-video)' },
          upscale_factor: { type: 'number' as const, description: 'Upscale factor: 2, 4, or 8' },
          image: { type: 'string' as const, description: 'Image URL for remove_bg / upscale_image (Recraft format)' },
          taskId: { type: 'string' as const, description: 'Task ID (for status check)' },
          sourceAction: { type: 'string' as const, description: 'Original action (for correct status polling)' },
          url: { type: 'string' as const, description: 'URL for download_url action' },
          fileUrl: { type: 'string' as const, description: 'Remote file URL for file_upload' },
          method: { type: 'string' as const, description: 'Upload method: url or base64' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('social')) {
    definitions.push({
      name: 'social',
      description: 'Publish content to social media via Blotato. Platforms: twitter, instagram, facebook, linkedin, tiktok, youtube, threads, bluesky, pinterest. Actions: publish(platform, text, mediaUrls), publish_all(text, mediaUrls, platforms), publish_thread(platform, posts[]), upload_media(url), check_post(postSubmissionId), schedule(platform, text, scheduledAt).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['publish', 'publish_all', 'publish_thread', 'upload_media', 'check_post', 'schedule'], description: 'Social media action' },
          platform: { type: 'string' as const, description: 'Target platform (twitter, instagram, facebook, linkedin, tiktok, youtube, threads, bluesky, pinterest)' },
          platforms: { type: 'array' as const, items: { type: 'string' as const }, description: 'Multiple platforms (for publish_all)' },
          text: { type: 'string' as const, description: 'Post text/caption' },
          mediaUrls: { type: 'array' as const, items: { type: 'string' as const }, description: 'Media URLs to attach (images/videos)' },
          posts: { type: 'array' as const, items: { type: 'object' as const }, description: 'Thread posts array [{text, mediaUrls}]' },
          postSubmissionId: { type: 'string' as const, description: 'Post ID (for check_post)' },
          url: { type: 'string' as const, description: 'Media URL (for upload_media)' },
          scheduledAt: { type: 'string' as const, description: 'ISO datetime for scheduled posts' },
          options: { type: 'object' as const, description: 'Platform-specific options (mediaType, isAiGenerated, title, privacy, etc.)' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('openclaw')) {
    definitions.push({
      name: 'openclaw',
      description: 'Bridge to OpenClaw gateway on the server. Send messages via WhatsApp/Facebook, run OpenClaw agents, manage cron jobs, list sessions, check health. Use for anything that needs OpenClaw\'s messaging channels or scheduled automation.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['health', 'status', 'send', 'agent', 'agent_wait', 'sessions_list', 'sessions_preview', 'cron_list', 'cron_status', 'cron_add', 'cron_remove', 'cron_run', 'cron_runs', 'chat_send', 'chat_history', 'channels_status', 'models_list', 'agents_list', 'config_get', 'browser_request', 'raw'], description: 'OpenClaw action' },
          to: { type: 'string' as const, description: 'Recipient (phone number or chat ID) for send/agent' },
          message: { type: 'string' as const, description: 'Message text for send/agent/chat_send' },
          channel: { type: 'string' as const, description: 'Channel: whatsapp, facebook, etc.' },
          mediaUrl: { type: 'string' as const, description: 'Media URL to attach (for send)' },
          mediaUrls: { type: 'array' as const, items: { type: 'string' as const }, description: 'Multiple media URLs' },
          agentId: { type: 'string' as const, description: 'Agent ID (for agent action)' },
          sessionKey: { type: 'string' as const, description: 'Session key for context' },
          runId: { type: 'string' as const, description: 'Run ID (for agent_wait)' },
          thinking: { type: 'string' as const, description: 'Thinking level: low, medium, high (for agent)' },
          deliver: { type: 'boolean' as const, description: 'Whether to deliver agent response to recipient (for agent)' },
          cronExpression: { type: 'string' as const, description: 'Cron expression (for cron_add)' },
          cronId: { type: 'string' as const, description: 'Cron job ID (for cron_remove/cron_run)' },
          cronLabel: { type: 'string' as const, description: 'Label for cron job' },
          method: { type: 'string' as const, description: 'Raw gateway method name (for raw action)' },
          params: { type: 'object' as const, description: 'Raw params object (for raw action or advanced use)' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('cron') || allowedTools.includes('scheduler')) {
    definitions.push({
      name: 'cron',
      description: 'Manage scheduled/recurring tasks (cron jobs). Create, list, remove, enable, or disable recurring automated tasks. Supports natural language schedules (e.g. "every morning", "every 5 min", "כל בוקר") and cron expressions.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['list', 'add', 'remove', 'enable', 'disable'], description: 'Cron action' },
          userId: { type: 'string' as const, description: 'User ID' },
          name: { type: 'string' as const, description: 'Task name (for add)' },
          schedule: { type: 'string' as const, description: 'Schedule: natural language or cron expression (for add)' },
          message: { type: 'string' as const, description: 'Message to send when task runs (for add)' },
          taskAction: { type: 'string' as const, description: 'Action type: send_message, news_summary (for add)' },
          taskId: { type: 'string' as const, description: 'Task ID (for remove/enable/disable)' },
          platform: { type: 'string' as const, description: 'Platform for notifications: telegram, discord, web' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('memory')) {
    definitions.push({
      name: 'memory',
      description: 'Persistent memory — remember, recall, forget facts about users. Actions: remember(userId, key, value, category?), recall(userId, query?, category?), forget(userId, key), forget_all(userId), stats(userId).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['remember', 'recall', 'forget', 'forget_all', 'stats'], description: 'Memory action' },
          userId: { type: 'string' as const, description: 'User ID' },
          key: { type: 'string' as const, description: 'Fact key (for remember/forget)' },
          value: { type: 'string' as const, description: 'Fact value (for remember)' },
          category: { type: 'string' as const, description: 'Category: personal, project, preference, technology, goal, contact' },
          query: { type: 'string' as const, description: 'Search query (for recall)' },
        },
        required: ['action', 'userId'],
      },
    });
  }

  if (allowedTools.includes('auto')) {
    definitions.push({
      name: 'auto',
      description: 'Autonomous multi-step task execution. AI plans steps then executes them using available tools. Actions: start(goal), resume(taskId), stop(taskId), list, status(taskId).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['start', 'resume', 'stop', 'list', 'status'], description: 'Autonomous task action' },
          goal: { type: 'string' as const, description: 'Goal description (for start)' },
          taskId: { type: 'string' as const, description: 'Task ID (for resume/stop/status)' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('email')) {
    definitions.push({
      name: 'email',
      description: 'Email — Gmail integration (read, send, reply, search) with SMTP fallback for sending. Actions: inbox(maxResults?, unreadOnly?, search?), read(messageId), send(to, subject, body), reply(messageId, body), search(query, maxResults?), mark(messageId, read), unread_count(). Gmail search: "from:john", "subject:invoice", "is:unread", "has:attachment". If Gmail is not configured, send falls back to SMTP.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['inbox', 'read', 'send', 'reply', 'search', 'mark', 'unread_count'], description: 'Email action' },
          to: { type: 'string' as const, description: 'Recipient email (for send)' },
          subject: { type: 'string' as const, description: 'Email subject (for send)' },
          body: { type: 'string' as const, description: 'Email body (for send/reply)' },
          messageId: { type: 'string' as const, description: 'Email ID (for read/reply/mark)' },
          query: { type: 'string' as const, description: 'Search query (for search)' },
          search: { type: 'string' as const, description: 'Search query (for inbox)' },
          maxResults: { type: 'number' as const, description: 'Max results (default 10)' },
          unreadOnly: { type: 'boolean' as const, description: 'Only unread (for inbox)' },
          read: { type: 'boolean' as const, description: 'Mark as read (true) or unread (false)' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('workflow')) {
    definitions.push({
      name: 'workflow',
      description: 'Automation workflows — chain multiple tools together. Actions: create(name, description, trigger?, triggerConfig?), run(workflowId), list(userId?), toggle(workflowId), delete(workflowId). Triggers: manual, cron, webhook, event.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['create', 'run', 'list', 'toggle', 'delete'], description: 'Workflow action' },
          name: { type: 'string' as const, description: 'Workflow name (for create)' },
          description: { type: 'string' as const, description: 'Natural language description (for create)' },
          trigger: { type: 'string' as const, description: 'Trigger type: manual, cron, webhook, event' },
          triggerConfig: { type: 'string' as const, description: 'Cron expression or event name' },
          workflowId: { type: 'string' as const, description: 'Workflow ID (for run/toggle/delete)' },
          userId: { type: 'string' as const, description: 'User ID (for list)' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('analytics')) {
    definitions.push({
      name: 'analytics',
      description: 'Usage analytics, cost reporting, API key health check, Claude Code savings. Actions: daily (daily activity report), cost (cost breakdown by model), keys (check all API keys), budget (budget status), savings (Claude Code savings vs API costs).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['daily', 'cost', 'keys', 'budget', 'savings'], description: 'Analytics action' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('claude-code')) {
    definitions.push({
      name: 'claude-code',
      description: 'Run tasks via Claude Code CLI (free via Max subscription). Actions: chat (ask Claude a question), agent (run complex agentic task with file access), status (check CLI status).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['chat', 'agent', 'status'], description: 'Claude Code action' },
          message: { type: 'string' as const, description: 'Message for chat action' },
          system: { type: 'string' as const, description: 'System prompt (for chat)' },
          task: { type: 'string' as const, description: 'Task description (for agent action)' },
          workingDir: { type: 'string' as const, description: 'Working directory (for agent action)' },
          maxTokens: { type: 'number' as const, description: 'Max response tokens' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('device')) {
    definitions.push({
      name: 'device',
      description: 'Control Android devices — ADB, Appium, app recipes. INFO: list_devices, device_info. TOUCH: tap(x,y), long_press, swipe, double_tap. TEXT: type(text), key(keycode). SCREEN: screenshot, screen_xml. APPS: open_app, close_app, list_apps, install_app, current_app. NAV: back, home, recent. CLIPBOARD: get_clipboard, set_clipboard. ADB: adb(command), shell(command). APPIUM: appium_start, appium_find, appium_click, appium_send_keys, appium_stop. RECIPES: recipe(app, recipe, params), list_recipes. CLI: agent_device(command).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, description: 'Device action (see description for full list)' },
          x: { type: 'number' as const, description: 'X coordinate (for tap, long_press, double_tap)' },
          y: { type: 'number' as const, description: 'Y coordinate (for tap, long_press, double_tap)' },
          startX: { type: 'number' as const, description: 'Start X (for swipe)' },
          startY: { type: 'number' as const, description: 'Start Y (for swipe)' },
          endX: { type: 'number' as const, description: 'End X (for swipe)' },
          endY: { type: 'number' as const, description: 'End Y (for swipe)' },
          duration: { type: 'number' as const, description: 'Duration in ms (for long_press, swipe)' },
          text: { type: 'string' as const, description: 'Text to type or set clipboard' },
          keycode: { type: 'string' as const, description: 'Key code (e.g. ENTER, BACK, HOME)' },
          packageName: { type: 'string' as const, description: 'App package name (e.g. com.whatsapp)' },
          activityName: { type: 'string' as const, description: 'App activity name (for appium_start)' },
          apkPath: { type: 'string' as const, description: 'APK file path (for install_app)' },
          command: { type: 'string' as const, description: 'ADB/shell command or agent-device CLI command' },
          args: { type: 'string' as const, description: 'CLI arguments (for agent_device)' },
          deviceId: { type: 'string' as const, description: 'Target device ID (optional, for multi-device)' },
          strategy: { type: 'string' as const, description: 'Appium find strategy: id, xpath, accessibility id, class, uiautomator' },
          selector: { type: 'string' as const, description: 'Appium element selector' },
          elementId: { type: 'string' as const, description: 'Appium element ID (from appium_find)' },
          serverUrl: { type: 'string' as const, description: 'Appium server URL (default: http://localhost:4723)' },
          noReset: { type: 'boolean' as const, description: 'Keep app data between sessions (for appium_start)' },
          app: { type: 'string' as const, description: 'App name for recipe (whatsapp, tiktok, instagram)' },
          recipe: { type: 'string' as const, description: 'Recipe name (send_message, upload_video, post_photo, etc.)' },
          params: { type: 'object' as const, description: 'Recipe parameters (contact, message, videoPath, etc.)' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('db')) {
    definitions.push({
      name: 'db',
      description: 'Query the knowledge database: search facts, learn new things, list tasks/servers.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['search-knowledge', 'get-knowledge-category', 'learn', 'list-tasks', 'list-servers'], description: 'DB action' },
          userId: { type: 'string' as const, description: 'User ID' },
          query: { type: 'string' as const, description: 'Search query' },
          key: { type: 'string' as const, description: 'Fact key (for learn)' },
          value: { type: 'string' as const, description: 'Fact value (for learn)' },
          category: { type: 'string' as const, description: 'Knowledge category' },
        },
        required: ['action', 'userId'],
      },
    });
  }

  if (allowedTools.includes('elevenlabs')) {
    definitions.push({
      name: 'elevenlabs',
      description: 'ElevenLabs audio platform — TTS (140+ voices, Hebrew!), voice cloning, podcasts, dubbing, sound effects, speech-to-text, audio isolation. Actions: tts(text, voice?, model?, language?), voices(), clone_voice(name, files[], description?), podcast(script[{speaker,voice,text}], title?), dub(source_url, target_lang), sfx(text, duration?), stt(audio_url, language?), isolate(audio_url).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['tts', 'voices', 'clone_voice', 'podcast', 'dub', 'sfx', 'stt', 'isolate'], description: 'ElevenLabs action' },
          text: { type: 'string' as const, description: 'Text for TTS or SFX description' },
          voice: { type: 'string' as const, description: 'Voice name (Rachel, Adam, Bella, Antoni, Elli, Josh, Sam) or voice_id' },
          model: { type: 'string' as const, description: 'Model: eleven_multilingual_v2 (Hebrew!), eleven_turbo_v2' },
          language: { type: 'string' as const, description: 'Language code: he, en, es, etc.' },
          name: { type: 'string' as const, description: 'Voice name for cloning' },
          files: { type: 'array' as const, items: { type: 'string' as const }, description: 'Audio file URLs for voice cloning (30s min)' },
          description: { type: 'string' as const, description: 'Voice description' },
          script: { type: 'array' as const, items: { type: 'object' as const }, description: 'Podcast script segments [{speaker, voice, text}]' },
          title: { type: 'string' as const, description: 'Podcast title' },
          source_url: { type: 'string' as const, description: 'Source audio/video URL for dubbing' },
          target_lang: { type: 'string' as const, description: 'Target language for dubbing (he, en, es)' },
          duration: { type: 'number' as const, description: 'Duration in seconds (for SFX)' },
          audio_url: { type: 'string' as const, description: 'Audio URL (for STT, isolate)' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('firecrawl')) {
    definitions.push({
      name: 'firecrawl',
      description: 'Smart web scraping via Firecrawl — scrape any page to clean markdown (AI-ready!), crawl entire sites, search Google + scrape results, extract structured data with AI, map site URLs. Handles JS rendering, popups, cookie banners. Actions: scrape(url), crawl(url, max_pages?), search(query, limit?, scrape_results?), extract(url, schema, prompt?), map(url).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['scrape', 'crawl', 'search', 'extract', 'map'], description: 'Firecrawl action' },
          url: { type: 'string' as const, description: 'URL to scrape/crawl/extract/map' },
          formats: { type: 'array' as const, items: { type: 'string' as const }, description: 'Output formats: markdown, html, links, screenshot (default: [markdown])' },
          only_main_content: { type: 'boolean' as const, description: 'Only main content, no nav/footer (default: true)' },
          wait_for: { type: 'number' as const, description: 'Wait ms for JS rendering' },
          max_pages: { type: 'number' as const, description: 'Max pages to crawl (default: 10)' },
          query: { type: 'string' as const, description: 'Search query (for search action)' },
          limit: { type: 'number' as const, description: 'Number of search results (default: 5)' },
          scrape_results: { type: 'boolean' as const, description: 'Scrape each search result page (default: false)' },
          schema: { type: 'object' as const, description: 'JSON schema for data extraction' },
          prompt: { type: 'string' as const, description: 'AI prompt for extraction guidance' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('rapidapi')) {
    definitions.push({
      name: 'rapidapi',
      description: 'Search and call 40,000+ APIs via RapidAPI. Find any API you need (social media scrapers, weather, translation, finance, AI). Actions: search(query) — find APIs, call(host, endpoint, method?, params?, body?) — call any API, info(api_name) — get API details, popular(category?) — list free APIs by category (social, data, finance, weather, translation, ai).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['search', 'call', 'info', 'popular'], description: 'RapidAPI action' },
          query: { type: 'string' as const, description: 'Search query (for search)' },
          api_name: { type: 'string' as const, description: 'API name (for info)' },
          host: { type: 'string' as const, description: 'API host (e.g. instagram-scraper-api2.p.rapidapi.com)' },
          endpoint: { type: 'string' as const, description: 'API endpoint path (e.g. /user/info?username=x)' },
          method: { type: 'string' as const, description: 'HTTP method: GET, POST, PUT, DELETE (default: GET)' },
          params: { type: 'object' as const, description: 'Query parameters object' },
          body: { type: 'object' as const, description: 'Request body (for POST/PUT)' },
          category: { type: 'string' as const, description: 'Category filter: social, data, finance, weather, translation, ai' },
          sort_by: { type: 'string' as const, description: 'Sort: popularity, rating, newest' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('apify')) {
    definitions.push({
      name: 'apify',
      description: 'Run ready-made scrapers and automation actors via Apify. Scrape Facebook, Instagram, TikTok, Twitter, YouTube, LinkedIn, Amazon, Google Maps, any website. Actions: search(query) — find actors, run(actor_id, input, wait?, timeout?) — run an actor, results(run_id, limit?) — get results, info(actor_id) — actor details, popular(category?) — list popular actors (social-media, e-commerce, data).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['search', 'run', 'results', 'info', 'popular'], description: 'Apify action' },
          query: { type: 'string' as const, description: 'Search query (for search)' },
          actor_id: { type: 'string' as const, description: 'Actor ID (e.g. apify/facebook-posts-scraper)' },
          input: { type: 'object' as const, description: 'Actor input configuration' },
          wait: { type: 'boolean' as const, description: 'Wait for results (default: true)' },
          timeout: { type: 'number' as const, description: 'Timeout seconds (default: 120)' },
          run_id: { type: 'string' as const, description: 'Run ID (for results)' },
          format: { type: 'string' as const, description: 'Output format: json, csv (default: json)' },
          limit: { type: 'number' as const, description: 'Max results to return (default: 50)' },
          category: { type: 'string' as const, description: 'Category: social-media, e-commerce, data' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('ssh')) {
    definitions.push({
      name: 'ssh',
      description: 'Multi-server SSH management. Connect to servers, execute commands, scan/discover capabilities, health monitoring, file transfer, cross-server workflows. Actions: add_server(id, host, user, keyPath, name?, port?, workDir?, tags?), remove_server(id), list_servers(), connect(serverId), disconnect(serverId), switch(serverId), active(), status(), exec(serverId?, command), exec_all(command), scan(serverId), scan_all(), upload(serverId, localPath, remotePath), download(serverId, remotePath, localPath), health(serverId), health_all(), workflow_run(steps[], variables?).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['add_server', 'remove_server', 'list_servers', 'connect', 'disconnect', 'switch', 'active', 'status', 'exec', 'exec_all', 'scan', 'scan_all', 'upload', 'download', 'health', 'health_all', 'workflow_run'], description: 'SSH action' },
          serverId: { type: 'string' as const, description: 'Server ID (e.g. "vps1", "dev")' },
          id: { type: 'string' as const, description: 'Server ID for add/remove' },
          host: { type: 'string' as const, description: 'Server host (user@host:port or just IP)' },
          user: { type: 'string' as const, description: 'SSH user (e.g. "root")' },
          keyPath: { type: 'string' as const, description: 'Path to SSH private key' },
          name: { type: 'string' as const, description: 'Display name for server' },
          port: { type: 'number' as const, description: 'SSH port (default: 22)' },
          workDir: { type: 'string' as const, description: 'Default working directory on server' },
          tags: { type: 'string' as const, description: 'Comma-separated tags (e.g. "production,nodejs")' },
          command: { type: 'string' as const, description: 'Command to execute via SSH' },
          localPath: { type: 'string' as const, description: 'Local file path (for upload/download)' },
          remotePath: { type: 'string' as const, description: 'Remote file path (for upload/download)' },
          steps: { type: 'array' as const, items: { type: 'object' as const }, description: 'Workflow steps [{server, name, command, saveOutput?, onError}]' },
          variables: { type: 'object' as const, description: 'Template variables for workflow ({{key}} replacement)' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('rag') || allowedTools.includes('knowledge')) {
    definitions.push({
      name: 'rag',
      description: 'Knowledge base (RAG) — ingest documents/URLs, query for relevant context, manage knowledge. Actions: query(question, topK?), ingest_text(text, source?), ingest_url(url), list(), delete(source), stats().',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['query', 'ingest_text', 'ingest_url', 'list', 'delete', 'stats'], description: 'RAG action' },
          userId: { type: 'string' as const, description: 'User ID' },
          question: { type: 'string' as const, description: 'Query question (for query)' },
          text: { type: 'string' as const, description: 'Text content to ingest (for ingest_text)' },
          source: { type: 'string' as const, description: 'Source name (for ingest_text/delete)' },
          url: { type: 'string' as const, description: 'URL to ingest (for ingest_url)' },
          topK: { type: 'number' as const, description: 'Number of results (default 5)' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('trading')) {
    definitions.push({
      name: 'trading',
      description: 'Crypto trading — analyze markets, execute trades, manage portfolio, risk management. Paper trading by default. Actions: get_price(symbol), get_prices(symbols), get_candles(symbol, timeframe, limit?), get_orderbook(symbol), get_portfolio(), get_balance(), place_order(symbol, side, type, amount, price?, stopLoss?, takeProfit?, strategy?), close_position(tradeId), get_orders(), analyze(symbol, timeframe?), get_signals(pairs?), scan_market(pairs?), get_strategies(), get_pnl(), get_stats(), get_trades(status?), get_risk(), set_risk(config), list_exchanges(), test_exchange(exchange?).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, description: 'Trading action (see description for full list)' },
          symbol: { type: 'string' as const, description: 'Trading pair (e.g. BTC/USDT)' },
          symbols: { type: 'array' as const, items: { type: 'string' as const }, description: 'Multiple trading pairs' },
          pairs: { type: 'array' as const, items: { type: 'string' as const }, description: 'Trading pairs for scanning' },
          timeframe: { type: 'string' as const, description: 'Candle timeframe: 1m, 5m, 15m, 1h, 4h, 1d' },
          limit: { type: 'number' as const, description: 'Number of candles to fetch' },
          side: { type: 'string' as const, enum: ['buy', 'sell'], description: 'Trade side' },
          type: { type: 'string' as const, enum: ['market', 'limit'], description: 'Order type' },
          amount: { type: 'number' as const, description: 'Trade amount' },
          price: { type: 'number' as const, description: 'Limit price' },
          stopLoss: { type: 'number' as const, description: 'Stop loss price' },
          takeProfit: { type: 'number' as const, description: 'Take profit price' },
          strategy: { type: 'string' as const, description: 'Strategy name' },
          tradeId: { type: 'string' as const, description: 'Trade ID (for close_position)' },
          status: { type: 'string' as const, description: 'Trade status filter: open, closed, all' },
          exchange: { type: 'string' as const, description: 'Exchange name (binance, okx)' },
          config: { type: 'object' as const, description: 'Risk config object' },
        },
        required: ['action'],
      },
    });
  }

  if (allowedTools.includes('whatsapp')) {
    definitions.push({
      name: 'whatsapp',
      description: 'WhatsApp connection management — get QR code to connect, check connection status. Actions: get_qr (returns QR code image as data URL for scanning), get_status (check if WhatsApp is connected/waiting/disconnected).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['get_qr', 'get_status'], description: 'WhatsApp action' },
        },
        required: ['action'],
      },
    });
  }

  // Append tools from plugins (if bridged)
  if (pluginLoaderRef) {
    for (const pt of pluginLoaderRef.getAllPluginTools()) {
      definitions.push({
        name: pt.name,
        description: pt.description,
        input_schema: {
          type: 'object' as const,
          properties: Object.fromEntries(
            Object.entries(pt.parameters).map(([k, v]) => [k, { type: v.type, description: v.description }])
          ),
          required: Object.entries(pt.parameters).filter(([, v]) => v.required).map(([k]) => k),
        },
      });
    }
  }

  // ── Dynamic tools from ToolCreator ──
  if (toolCreatorRef) {
    definitions.push({
      name: 'create_tool',
      description: 'Create, list, or remove dynamic tools at runtime. Actions: create (provide description), list (no params), remove (provide tool_name).',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['create', 'list', 'remove'], description: 'Action to perform' },
          description: { type: 'string' as const, description: 'Description of the tool to create (for create action)' },
          tool_name: { type: 'string' as const, description: 'Name of the tool to remove (for remove action)' },
        },
        required: ['action'],
      },
    });
    // Append existing dynamic tool definitions
    definitions.push(...toolCreatorRef.getToolDefinitions());
  }

  return definitions;
}

// ── Concurrency Limiter (ChatGPT recommendation) ──
// Prevents resource exhaustion from too many parallel tool executions
// Bounded queue prevents DoS via queue flooding (ChatGPT round-2 feedback)
const MAX_CONCURRENT_TOOLS = 5;
const MAX_QUEUE_LENGTH = 20;
let activeTasks = 0;
const waitQueue: Array<() => void> = [];

async function acquireConcurrencySlot(): Promise<void> {
  if (activeTasks < MAX_CONCURRENT_TOOLS) {
    activeTasks++;
    return;
  }
  // Reject if queue is full — prevents unbounded memory growth
  if (waitQueue.length >= MAX_QUEUE_LENGTH) {
    throw new Error(`Tool execution rejected: concurrency queue full (${MAX_QUEUE_LENGTH} waiting). Try again later.`);
  }
  // Wait for a slot to open
  return new Promise<void>((resolve) => {
    waitQueue.push(() => { activeTasks++; resolve(); });
  });
}

function releaseConcurrencySlot(): void {
  activeTasks--;
  if (waitQueue.length > 0 && activeTasks < MAX_CONCURRENT_TOOLS) {
    const next = waitQueue.shift()!;
    next();
  }
}

// Per-tool timeout limits (ms) — prevents a stuck tool from blocking everything
const TOOL_TIMEOUTS: Record<string, number> = {
  'bash': 180000,         // 3min — SSH commands and complex ops can be slow
  'claude-code': 300000,  // 5min — Claude Code CLI can take time for agentic tasks
  'browser': 120000,      // 2min — page loads + rendering + JS execution
  'search': 30000,        // 30s — web search
  'github': 30000,        // 30s — API calls
  'email': 30000,         // 30s — Gmail API
  'kie': 300000,          // 5min — video/image generation can take a while
  'social': 30000,        // 30s — social media API
  'openclaw': 60000,      // 1min — bridge call (agent mode can be slow)
  'auto': 600000,         // 10min — multi-step autonomous
  'device': 60000,        // 1min — ADB/Appium commands
  'elevenlabs': 120000,   // 2min — TTS/podcast/audio generation
  'firecrawl': 120000,    // 2min — crawling can be slow
  'rapidapi': 30000,      // 30s — API calls
  'apify': 300000,        // 5min — actor runs can take time
  'ssh': 300000,          // 5min — scans and workflows can take time
  'trading': 60000,        // 1min — exchange API calls
};
const DEFAULT_TOOL_TIMEOUT = 30000; // 30s default

/**
 * Execute a tool call from the AI — with per-tool timeout.
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  // ── PANIC MODE CHECK — blocks ALL tool execution when kill switch is active ──
  if (isPanicActive()) {
    logger.warn('Tool blocked by PANIC MODE', { toolName });
    return { success: false, output: '', error: 'PANIC MODE ACTIVE — all tools disabled. Deactivate panic mode to resume.' };
  }

  if (!initialized) initTools();

  // ── Handle create_tool meta-tool ──
  if (toolName === 'create_tool' && toolCreatorRef) {
    const action = input.action as string;
    if (action === 'create') {
      const result = await toolCreatorRef.createTool(input.description as string);
      return { success: result.success, output: result.success ? `Tool "${result.name}" created successfully` : `Failed: ${result.error}` };
    } else if (action === 'list') {
      const tools = toolCreatorRef.listTools();
      return { success: true, output: tools.length > 0 ? tools.map(t => `- ${t.name}: ${t.description} (used ${t.useCount}x)`).join('\n') : 'No dynamic tools created yet' };
    } else if (action === 'remove') {
      const removed = toolCreatorRef.removeTool(input.tool_name as string);
      return { success: removed, output: removed ? `Tool "${input.tool_name}" removed` : `Tool "${input.tool_name}" not found` };
    }
    return { success: false, output: '', error: `Unknown create_tool action: ${action}` };
  }

  // ── Handle dynamic tool execution (dynamic_* prefix) ──
  if (toolName.startsWith('dynamic_') && toolCreatorRef) {
    const realName = toolName.slice(8); // Remove 'dynamic_' prefix
    try {
      const result = await toolCreatorRef.executeTool(realName, input as Record<string, unknown>);
      logger.info('Dynamic tool executed', { toolName: realName, outputLength: result.length });
      return { success: true, output: result };
    } catch (err: any) {
      return { success: false, output: '', error: err.message };
    }
  }

  const tool = toolInstances.get(toolName);
  if (!tool) {
    // Try plugin loader as fallback before giving up
    if (pluginLoaderRef) {
      try {
        const pluginResult = await pluginLoaderRef.executeTool(toolName, input);
        if (pluginResult) {
          logger.info('Tool executed via plugin', { toolName, success: pluginResult.success });
          return pluginResult;
        }
      } catch (err: any) {
        logger.warn('Plugin tool execution failed', { toolName, error: err.message });
      }
    }

    // Try dynamic tool creator (non-prefixed name)
    if (toolCreatorRef && toolCreatorRef.getTool(toolName)) {
      try {
        const result = await toolCreatorRef.executeTool(toolName, input as Record<string, unknown>);
        return { success: true, output: result };
      } catch (err: any) {
        return { success: false, output: '', error: err.message };
      }
    }

    logger.warn('Tool not found', { toolName });
    return { success: false, output: '', error: `Tool "${toolName}" not found` };
  }

  // Enforce role-based permissions before execution
  const userRole = (input._userRole as string) ?? 'admin'; // Default admin for system/internal calls
  const userId = (input._userId as string) ?? 'system';
  if (!hasPermission(userRole, toolName)) {
    logger.warn('Tool access denied by role', { toolName, userRole, userId });
    await audit(userId, 'tool.access_denied', { tool: toolName, role: userRole });
    return { success: false, output: '', error: `Access denied: role '${userRole}' cannot use tool '${toolName}'` };
  }

  // ── Approval Gate: require human approval for high-risk tools ──
  const approvalConfig = APPROVAL_REQUIRED_TOOLS[toolName];
  if (approvalConfig) {
    const gate = getApprovalGate();
    const inputSummary = JSON.stringify(input).slice(0, 200);
    const approved = await gate.requestApproval({
      agentId: currentAgentId,
      action: `${toolName}:execute`,
      description: `Tool "${toolName}" called by ${currentAgentId}: ${inputSummary}`,
      riskCategory: approvalConfig.riskCategory,
      riskScore: approvalConfig.riskScore,
      timeoutMs: approvalConfig.timeoutMs,
    });
    if (!approved) {
      logger.info('Tool blocked by approval gate', { toolName, agent: currentAgentId });
      return { success: false, output: '', error: `Tool "${toolName}" requires human approval. Action was not approved.` };
    }
  }

  // ── Safety Gate: check dangerous commands before execution ──
  if ((toolName === 'bash' || toolName === 'ssh') && isBridgeReady()) {
    const command = String(input.command ?? '');
    if (command) {
      const safetyCheck = checkCommandSafety(command, {
        agentId: currentAgentId,
        serverId: String(input.serverId ?? ''),
      });
      if (!safetyCheck.approved) {
        logger.warn('Command blocked by safety gate', {
          toolName, command: command.slice(0, 100),
          risk: safetyCheck.riskCategory, score: safetyCheck.riskScore,
          reason: safetyCheck.reason,
        });
        return {
          success: false, output: '',
          error: `Command blocked (${safetyCheck.riskCategory}, score ${safetyCheck.riskScore.toFixed(2)}): ${safetyCheck.reason}`,
        };
      }
    }
  }

  logger.info('Executing tool', { toolName, input: JSON.stringify(input).slice(0, 300) });
  const start = Date.now();
  const timeout = TOOL_TIMEOUTS[toolName] ?? DEFAULT_TOOL_TIMEOUT;

  // ── Concurrency Gate — wait for available slot ──
  await acquireConcurrencySlot();

  try {
    const result = await Promise.race([
      tool.execute(input),
      new Promise<ToolResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool "${toolName}" timed out after ${timeout / 1000}s`)), timeout)
      ),
    ]);
    const duration = Date.now() - start;
    logger.info('Tool executed', { toolName, success: result.success, duration, outputLength: result.output.length });

    // ── Intelligence Hook: feed tool execution data to all subsystems ──
    if (isBridgeReady()) {
      onToolExecuted({
        toolId: toolName,
        agentId: currentAgentId,
        success: result.success,
        latency: duration,
        cost: 0, // Tool-level cost estimated downstream
        risk: (toolName === 'bash' || toolName === 'ssh') ? 'medium' : 'low',
        intent: currentIntent,
        workflowType: currentIntent,
      });
    }

    return result;
  } catch (err: any) {
    const duration = Date.now() - start;
    logger.error('Tool execution failed', { toolName, error: err.message, duration });

    // ── Intelligence Hook: record failure ──
    if (isBridgeReady()) {
      onToolExecuted({
        toolId: toolName,
        agentId: currentAgentId,
        success: false,
        latency: duration,
        cost: 0,
        risk: 'medium',
        intent: currentIntent,
        workflowType: currentIntent,
      });
    }

    return { success: false, output: '', error: err.message };
  } finally {
    releaseConcurrencySlot();
  }
}

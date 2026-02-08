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
import { BaseTool, ToolResult } from '../agents/tools/base-tool.js';
import logger from '../utils/logger.js';

// Singleton tool instances
const toolInstances: Map<string, BaseTool> = new Map();
let initialized = false;

export function initTools(): void {
  if (initialized) return;
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
  initialized = true;
  logger.info('Tool executor initialized', { tools: Array.from(toolInstances.keys()) });
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
      description: 'AI Content Generation via Kie.ai. Generate videos (Kling, Veo3, Runway, Wan), images (4o, Midjourney, Flux, Grok), and music (Suno). Actions: video_kling, video_veo3, video_runway, video_wan, image_4o, image_midjourney, image_flux, image_grok, music_suno, status(taskId), list_models.',
      input_schema: {
        type: 'object' as const,
        properties: {
          action: { type: 'string' as const, enum: ['video_kling', 'video_veo3', 'video_runway', 'video_wan', 'image_4o', 'image_midjourney', 'image_flux', 'image_grok', 'music_suno', 'status', 'list_models'], description: 'Generation action' },
          prompt: { type: 'string' as const, description: 'Creative prompt for generation' },
          imageUrl: { type: 'string' as const, description: 'Input image URL (for image-to-video or image-to-image)' },
          imageUrls: { type: 'array' as const, items: { type: 'string' as const }, description: 'Multiple image URLs (for Veo3 transitions)' },
          model: { type: 'string' as const, description: 'Model variant (e.g. kling2.1, kling2.1_pro, veo3_fast, veo3)' },
          duration: { type: 'number' as const, description: 'Video duration in seconds (5 or 10)' },
          aspectRatio: { type: 'string' as const, description: 'Aspect ratio: 16:9, 9:16, 1:1' },
          size: { type: 'string' as const, description: 'Image size: 1:1, 3:2, 2:3' },
          nVariants: { type: 'number' as const, description: 'Number of image variants (1-4)' },
          style: { type: 'string' as const, description: 'Music style (for Suno)' },
          resolution: { type: 'string' as const, description: 'Video resolution: 720p, 1080p' },
          taskId: { type: 'string' as const, description: 'Task ID (for status check)' },
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

  return definitions;
}

/**
 * Execute a tool call from the AI.
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  if (!initialized) initTools();

  const tool = toolInstances.get(toolName);
  if (!tool) {
    logger.warn('Tool not found', { toolName });
    return { success: false, output: '', error: `Tool "${toolName}" not found` };
  }

  logger.info('Executing tool', { toolName, input: JSON.stringify(input).slice(0, 300) });
  const start = Date.now();

  try {
    const result = await tool.execute(input);
    const duration = Date.now() - start;
    logger.info('Tool executed', { toolName, success: result.success, duration, outputLength: result.output.length });
    return result;
  } catch (err: any) {
    logger.error('Tool execution failed', { toolName, error: err.message });
    return { success: false, output: '', error: err.message };
  }
}

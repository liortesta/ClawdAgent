import logger from '../utils/logger.js';
import type { BaseTool } from '../agents/tools/base-tool.js';

/**
 * Config-driven Tool Registry.
 * Maps tool names to their module paths and allows enabling/disabling
 * tools via configuration without modifying source code.
 */

interface ToolRegistration {
  name: string;
  modulePath: string;
  className: string;
  enabled: boolean;
  requiresConfig?: string[];  // env vars that must be set
}

/** Default tool manifest — maps all built-in tools */
const TOOL_MANIFEST: ToolRegistration[] = [
  { name: 'bash', modulePath: '../agents/tools/bash-tool.js', className: 'BashTool', enabled: true },
  { name: 'file', modulePath: '../agents/tools/file-tool.js', className: 'FileTool', enabled: true },
  { name: 'search', modulePath: '../agents/tools/search-tool.js', className: 'SearchTool', enabled: true, requiresConfig: ['BRAVE_API_KEY'] },
  { name: 'github', modulePath: '../agents/tools/github-tool.js', className: 'GithubTool', enabled: true, requiresConfig: ['GITHUB_TOKEN'] },
  { name: 'task', modulePath: '../agents/tools/task-tool.js', className: 'TaskTool', enabled: true },
  { name: 'db', modulePath: '../agents/tools/db-tool.js', className: 'DbTool', enabled: true },
  { name: 'browser', modulePath: '../agents/tools/browser-tool.js', className: 'BrowserTool', enabled: true },
  { name: 'kie', modulePath: '../agents/tools/kie-tool.js', className: 'KieTool', enabled: true, requiresConfig: ['KIE_AI_API_KEY'] },
  { name: 'social', modulePath: '../agents/tools/social-tool.js', className: 'SocialTool', enabled: true, requiresConfig: ['BLOTATO_API_KEY'] },
  { name: 'openclaw', modulePath: '../agents/tools/openclaw-tool.js', className: 'OpenClawTool', enabled: true, requiresConfig: ['OPENCLAW_GATEWAY_TOKEN'] },
  { name: 'cron', modulePath: '../agents/tools/cron-tool.js', className: 'CronTool', enabled: true },
  { name: 'memory', modulePath: '../agents/tools/memory-tool.js', className: 'MemoryTool', enabled: true },
  { name: 'auto', modulePath: '../agents/tools/auto-tool.js', className: 'AutoTool', enabled: true },
  { name: 'email', modulePath: '../agents/tools/email-tool.js', className: 'EmailTool', enabled: true },
  { name: 'workflow', modulePath: '../agents/tools/workflow-tool.js', className: 'WorkflowTool', enabled: true },
  { name: 'analytics', modulePath: '../agents/tools/analytics-tool.js', className: 'AnalyticsTool', enabled: true },
  { name: 'claude-code', modulePath: '../agents/tools/claude-code-tool.js', className: 'ClaudeCodeTool', enabled: true },
  { name: 'device', modulePath: '../agents/tools/device-tool.js', className: 'DeviceTool', enabled: true },
  { name: 'elevenlabs', modulePath: '../agents/tools/elevenlabs-tool.js', className: 'ElevenLabsTool', enabled: true, requiresConfig: ['ELEVENLABS_API_KEY'] },
  { name: 'firecrawl', modulePath: '../agents/tools/firecrawl-tool.js', className: 'FirecrawlTool', enabled: true, requiresConfig: ['FIRECRAWL_API_KEY'] },
  { name: 'rapidapi', modulePath: '../agents/tools/rapidapi-tool.js', className: 'RapidApiTool', enabled: true, requiresConfig: ['RAPIDAPI_KEY'] },
  { name: 'apify', modulePath: '../agents/tools/apify-tool.js', className: 'ApifyTool', enabled: true, requiresConfig: ['APIFY_API_TOKEN'] },
  { name: 'ssh', modulePath: '../agents/tools/ssh-tool.js', className: 'SSHTool', enabled: true },
  { name: 'trading', modulePath: '../agents/tools/trading-tool.js', className: 'TradingTool', enabled: true },
  { name: 'rag', modulePath: '../agents/tools/rag-tool.js', className: 'RAGTool', enabled: true },
  { name: 'whatsapp', modulePath: '../agents/tools/whatsapp-tool.js', className: 'WhatsAppTool', enabled: true },
  { name: 'tikvid', modulePath: '../agents/tools/tikvid-tool.js', className: 'TikVidTool', enabled: true },
];

class ToolRegistry {
  private manifest: ToolRegistration[] = [...TOOL_MANIFEST];
  private instances = new Map<string, BaseTool>();
  private loaded = false;

  /** Register an additional tool (e.g., from plugin or config file) */
  register(reg: ToolRegistration): void {
    const existing = this.manifest.findIndex(t => t.name === reg.name);
    if (existing >= 0) {
      this.manifest[existing] = reg;
    } else {
      this.manifest.push(reg);
    }
    logger.debug('Tool registered', { name: reg.name, enabled: reg.enabled });
  }

  /** Enable or disable a tool by name */
  setEnabled(name: string, enabled: boolean): void {
    const reg = this.manifest.find(t => t.name === name);
    if (reg) {
      reg.enabled = enabled;
      if (!enabled) this.instances.delete(name);
    }
  }

  /** Load all enabled tools (called once during init) */
  async loadAll(): Promise<Map<string, BaseTool>> {
    if (this.loaded) return this.instances;

    // Parse TOOLS_ENABLED / TOOLS_DISABLED env vars for overrides
    const enabledOverride = process.env.TOOLS_ENABLED?.split(',').map(s => s.trim()).filter(Boolean);
    const disabledList = process.env.TOOLS_DISABLED?.split(',').map(s => s.trim()).filter(Boolean) ?? [];

    for (const reg of this.manifest) {
      // Apply env overrides
      if (enabledOverride && !enabledOverride.includes(reg.name)) {
        reg.enabled = false;
      }
      if (disabledList.includes(reg.name)) {
        reg.enabled = false;
      }

      // Check required config
      if (reg.enabled && reg.requiresConfig?.length) {
        const missing = reg.requiresConfig.filter(k => !process.env[k]);
        if (missing.length > 0) {
          // Tool remains registered but won't fail — it will report the missing config on use
          logger.debug('Tool missing optional config', { name: reg.name, missing });
        }
      }

      if (!reg.enabled) continue;

      try {
        const mod = await import(reg.modulePath);
        const ToolClass = mod[reg.className];
        if (ToolClass) {
          this.instances.set(reg.name, new ToolClass());
        }
      } catch (err: any) {
        logger.warn('Failed to load tool', { name: reg.name, error: err.message });
      }
    }

    this.loaded = true;
    logger.info('Tool registry loaded', {
      total: this.manifest.length,
      enabled: this.instances.size,
      disabled: this.manifest.filter(t => !t.enabled).map(t => t.name),
    });

    return this.instances;
  }

  /** Get a loaded tool instance */
  get(name: string): BaseTool | undefined {
    return this.instances.get(name);
  }

  /** Check if a tool is registered and enabled */
  isEnabled(name: string): boolean {
    return this.instances.has(name);
  }

  /** List all registered tools with their status */
  listAll(): Array<{ name: string; enabled: boolean; loaded: boolean; requiresConfig?: string[] }> {
    return this.manifest.map(reg => ({
      name: reg.name,
      enabled: reg.enabled,
      loaded: this.instances.has(reg.name),
      requiresConfig: reg.requiresConfig,
    }));
  }

  /** Get all loaded tool instances */
  getAllInstances(): Map<string, BaseTool> {
    return this.instances;
  }
}

/** Singleton registry */
let registry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registry) registry = new ToolRegistry();
  return registry;
}

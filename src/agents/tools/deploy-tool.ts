import { existsSync, readdirSync, statSync, mkdirSync, cpSync } from 'fs';
import { join, resolve } from 'path';
import { BaseTool, ToolResult } from './base-tool.js';

const PROJECT_ROOT = '/home/clickdrop-clawdagent/htdocs/clawdagent.clickdrop.online';
const BASE_URL = 'https://clawdagent.clickdrop.online';

/** Deployment targets — each maps to an nginx location block */
const DEPLOY_TARGETS: Record<string, string> = {
  games: join(PROJECT_ROOT, 'games'),
  projects: join(PROJECT_ROOT, 'projects'),
  apps: join(PROJECT_ROOT, 'apps'),
};

export class DeployTool extends BaseTool {
  name = 'deploy';
  description = `Deploy a built app/game to a web-accessible URL. Actions:
  - list: List all deployed apps and their URLs
  - publish: Deploy files from a source directory. Params: source (path), target (games|projects|apps), name (app name)
  - info: Show available deploy targets and their URLs`;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = (input.action as string) ?? 'info';

    switch (action) {
      case 'info':
        return this.info();
      case 'list':
        return this.list();
      case 'publish':
        return this.publish(input);
      default:
        return { success: false, output: '', error: `Unknown action: ${action}. Use: info, list, publish` };
    }
  }

  private info(): ToolResult {
    const targets = Object.entries(DEPLOY_TARGETS).map(([name, path]) => {
      const exists = existsSync(path);
      return `- ${name}: ${path} → ${BASE_URL}/${name}/ (${exists ? 'ready' : 'will be created'})`;
    });

    return {
      success: true,
      output: `Available deploy targets:\n${targets.join('\n')}\n\nTo deploy: use action "publish" with source (path to built files), target (games|projects|apps), and name (app-name).`,
    };
  }

  private list(): ToolResult {
    const apps: string[] = [];

    for (const [target, basePath] of Object.entries(DEPLOY_TARGETS)) {
      if (!existsSync(basePath)) continue;
      try {
        const items = readdirSync(basePath).filter(f => {
          try { return statSync(join(basePath, f)).isDirectory(); } catch { return false; }
        });
        for (const item of items) {
          apps.push(`[${target}] ${item} → ${BASE_URL}/${target}/${item}/`);
        }
      } catch { /* ignore */ }
    }

    return {
      success: true,
      output: apps.length > 0
        ? `Deployed apps (${apps.length}):\n${apps.join('\n')}`
        : 'No deployed apps found.',
    };
  }

  private publish(input: Record<string, unknown>): ToolResult {
    const source = input.source as string;
    const target = input.target as string;
    const name = input.name as string;

    if (!source || !target || !name) {
      return { success: false, output: '', error: 'Required: source (path), target (games|projects|apps), name (app-name)' };
    }

    if (!DEPLOY_TARGETS[target]) {
      return { success: false, output: '', error: `Invalid target "${target}". Use: ${Object.keys(DEPLOY_TARGETS).join(', ')}` };
    }

    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeName) {
      return { success: false, output: '', error: 'Invalid app name — use alphanumeric, hyphens, underscores only' };
    }

    const sourcePath = resolve(source);
    if (!existsSync(sourcePath)) {
      return { success: false, output: '', error: `Source not found: ${source}` };
    }

    const destPath = join(DEPLOY_TARGETS[target], safeName);

    try {
      mkdirSync(destPath, { recursive: true });
      cpSync(sourcePath, destPath, { recursive: true });

      const url = `${BASE_URL}/${target}/${safeName}/`;
      this.log('App deployed', { name: safeName, target, url });

      return {
        success: true,
        output: `Deployed "${safeName}" to ${target}!\nURL: ${url}\nPath: ${destPath}`,
      };
    } catch (err: any) {
      return { success: false, output: '', error: `Deploy failed: ${err.message}` };
    }
  }
}

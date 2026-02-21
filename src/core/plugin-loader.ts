import { promises as fs } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import logger from '../utils/logger.js';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  main: string;           // Entry point relative to plugin dir
  tools?: PluginToolDef[];
  behaviors?: string[];    // Behavior IDs this plugin provides
  requires?: string[];     // Required plugins
  config?: Record<string, { type: string; default?: unknown; description: string }>;
}

export interface PluginToolDef {
  name: string;
  description: string;
  parameters: Record<string, { type: string; required?: boolean; description: string }>;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  directory: string;
  instance: PluginInstance | null;
  loaded: boolean;
  error?: string;
}

export interface PluginInstance {
  init?: () => Promise<void>;
  shutdown?: () => Promise<void>;
  executeTool?: (toolName: string, input: Record<string, unknown>) => Promise<{ success: boolean; output: string; error?: string }>;
  getSystemPromptFragment?: () => string;
}

export class PluginLoader {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private pluginDir: string;
  private initialized = false;

  constructor(pluginDir?: string) {
    this.pluginDir = pluginDir ?? path.resolve('plugins');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.pluginDir, { recursive: true });
    await this.discoverPlugins();
    await this.loadAllPlugins();
    this.initialized = true;
    logger.info(`Plugin loader initialized: ${this.plugins.size} plugins`, {
      loaded: this.getLoadedCount(),
      failed: this.getFailedCount(),
    });
  }

  private async discoverPlugins(): Promise<void> {
    try {
      const entries = await fs.readdir(this.pluginDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const manifestPath = path.join(this.pluginDir, entry.name, 'manifest.json');
        try {
          const content = await fs.readFile(manifestPath, 'utf-8');
          const manifest: PluginManifest = JSON.parse(content);

          this.plugins.set(manifest.name, {
            manifest,
            directory: path.join(this.pluginDir, entry.name),
            instance: null,
            loaded: false,
          });
        } catch (err: any) {
          if (err.code !== 'ENOENT') {
            logger.warn(`Invalid plugin manifest: ${entry.name}`, { error: err.message });
          }
        }
      }
    } catch (err: any) {
      logger.debug('Plugin directory scan failed', { error: err.message });
    }
  }

  private async loadAllPlugins(): Promise<void> {
    // Sort by dependencies
    const sorted = this.topologicalSort();

    for (const name of sorted) {
      await this.loadPlugin(name);
    }
  }

  private async loadPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin || plugin.loaded) return;

    // Check required dependencies
    if (plugin.manifest.requires) {
      for (const req of plugin.manifest.requires) {
        const dep = this.plugins.get(req);
        if (!dep?.loaded) {
          plugin.error = `Missing dependency: ${req}`;
          logger.warn(`Plugin ${name} missing dependency: ${req}`);
          return;
        }
      }
    }

    try {
      const mainPath = path.join(plugin.directory, plugin.manifest.main);
      const module = await import(pathToFileURL(mainPath).href);

      const instance: PluginInstance = module.default ?? module;

      if (instance.init) {
        await instance.init();
      }

      plugin.instance = instance;
      plugin.loaded = true;
      logger.info(`Plugin loaded: ${name} v${plugin.manifest.version}`);
    } catch (err: any) {
      plugin.error = err.message;
      logger.warn(`Failed to load plugin: ${name}`, { error: err.message });
    }
  }

  private topologicalSort(): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) return; // Circular dependency

      visiting.add(name);
      const plugin = this.plugins.get(name);
      if (plugin?.manifest.requires) {
        for (const dep of plugin.manifest.requires) {
          visit(dep);
        }
      }
      visiting.delete(name);
      visited.add(name);
      sorted.push(name);
    };

    for (const name of this.plugins.keys()) {
      visit(name);
    }

    return sorted;
  }

  /** Execute a tool provided by a plugin */
  async executeTool(toolName: string, input: Record<string, unknown>): Promise<{ success: boolean; output: string; error?: string } | null> {
    for (const plugin of this.plugins.values()) {
      if (!plugin.loaded || !plugin.instance?.executeTool) continue;

      const hasTool = plugin.manifest.tools?.some(t => t.name === toolName);
      if (hasTool) {
        return plugin.instance.executeTool(toolName, input);
      }
    }
    return null;
  }

  /** Get all tool definitions from loaded plugins */
  getAllPluginTools(): PluginToolDef[] {
    const tools: PluginToolDef[] = [];
    for (const plugin of this.plugins.values()) {
      if (!plugin.loaded || !plugin.manifest.tools) continue;
      tools.push(...plugin.manifest.tools);
    }
    return tools;
  }

  /** Get system prompt fragments from all loaded plugins */
  getSystemPromptFragments(): string[] {
    const fragments: string[] = [];
    for (const plugin of this.plugins.values()) {
      if (!plugin.loaded || !plugin.instance?.getSystemPromptFragment) continue;
      const fragment = plugin.instance.getSystemPromptFragment();
      if (fragment) fragments.push(fragment);
    }
    return fragments;
  }

  /** Get plugin by name */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /** Get all plugins */
  getAllPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /** Unload a plugin */
  async unloadPlugin(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin?.loaded) return false;

    try {
      if (plugin.instance?.shutdown) {
        await plugin.instance.shutdown();
      }
      plugin.instance = null;
      plugin.loaded = false;
      logger.info(`Plugin unloaded: ${name}`);
      return true;
    } catch (err: any) {
      logger.warn(`Plugin unload failed: ${name}`, { error: err.message });
      return false;
    }
  }

  /** Reload all plugins */
  async reload(): Promise<void> {
    // Shutdown all
    for (const name of this.plugins.keys()) {
      await this.unloadPlugin(name);
    }
    this.plugins.clear();

    // Rediscover and reload
    await this.discoverPlugins();
    await this.loadAllPlugins();
    logger.info(`Plugins reloaded: ${this.getLoadedCount()} loaded`);
  }

  async shutdown(): Promise<void> {
    for (const [, plugin] of this.plugins) {
      if (plugin.loaded && plugin.instance?.shutdown) {
        try {
          await plugin.instance.shutdown();
        } catch { /* ignore */ }
      }
    }
  }

  getPluginCount(): number { return this.plugins.size; }
  getLoadedCount(): number { return Array.from(this.plugins.values()).filter(p => p.loaded).length; }
  getFailedCount(): number { return Array.from(this.plugins.values()).filter(p => p.error).length; }
  isReady(): boolean { return this.initialized; }
}

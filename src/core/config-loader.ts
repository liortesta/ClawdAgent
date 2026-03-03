import { promises as fs } from 'fs';
import path from 'path';
import YAML from 'yaml';
import logger from '../utils/logger.js';

export interface YAMLConfig {
  agent: {
    name: string;
    version: string;
    language: string;
    timezone: string;
    personality: string;
  };
  models: {
    default: string;
    economy: string;
    reasoning: string;
    vision: string;
    prefer_free: boolean;
    daily_budget_usd: number;
  };
  features: {
    heartbeat: boolean;
    auto_upgrade: boolean;
    self_repair: boolean;
    self_improve: boolean;
    proactive_thinker: boolean;
    rag: boolean;
    voice: boolean;
    vision: boolean;
    desktop: boolean;
  };
  security: {
    rate_limit_max: number;
    rate_limit_window_ms: number;
    require_admin: boolean;
    sandbox_bash: boolean;
    encrypt_secrets: boolean;
    rotate_keys: boolean;
    rotate_interval_hours: number;
  };
  interfaces: {
    telegram: boolean;
    discord: boolean;
    whatsapp: boolean;
    web: boolean;
  };
  plugins: {
    enabled: boolean;
    directory: string;
    auto_load: boolean;
  };
  mcp: {
    enabled: boolean;
    config_path: string;
  };
  [key: string]: unknown;
}

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  model: string;
  temperature: number;
  max_tokens: number;
  tools: string[];
  behaviors: string[];
  priority: number;
}

export interface ModelRouterConfig {
  complexity_rules: Array<{
    complexity: string;
    preferred_tier: string;
    fallback_tier: string;
    budget_threshold: number;
  }>;
  model_overrides: Record<string, string>;
  cost_limits: {
    max_per_request: number;
    daily_budget: number;
    monthly_budget: number;
  };
}

const CONFIG_DIR = path.resolve('config');
const MAIN_CONFIG = path.join(CONFIG_DIR, 'clawdagent.yaml');
const AGENTS_DIR = path.join(CONFIG_DIR, 'agents');
const MODELS_DIR = path.join(CONFIG_DIR, 'models');

let cachedMainConfig: YAMLConfig | null = null;
let cachedAgentConfigs: Map<string, AgentConfig> = new Map();
let cachedModelRouter: ModelRouterConfig | null = null;
let lastLoadTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

async function readYAML<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return YAML.parse(content) as T;
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      logger.warn(`Failed to parse YAML: ${filePath}`, { error: err.message });
    }
    return null;
  }
}

async function writeYAML<T>(filePath: string, data: T): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, YAML.stringify(data, { indent: 2 }), 'utf-8');
}

export async function loadMainConfig(): Promise<YAMLConfig> {
  const now = Date.now();
  if (cachedMainConfig && now - lastLoadTime < CACHE_TTL_MS) {
    return cachedMainConfig;
  }

  const config = await readYAML<YAMLConfig>(MAIN_CONFIG);
  if (config) {
    cachedMainConfig = config;
    lastLoadTime = now;
    return config;
  }

  // Return defaults if no config file
  return getDefaultConfig();
}

export async function loadAgentConfigs(): Promise<Map<string, AgentConfig>> {
  if (cachedAgentConfigs.size > 0 && Date.now() - lastLoadTime < CACHE_TTL_MS) {
    return cachedAgentConfigs;
  }

  const configs = new Map<string, AgentConfig>();
  try {
    const files = await fs.readdir(AGENTS_DIR);
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      const config = await readYAML<AgentConfig>(path.join(AGENTS_DIR, file));
      if (config?.id) {
        configs.set(config.id, config);
      }
    }
  } catch { /* agents dir may not exist */ }

  cachedAgentConfigs = configs;
  return configs;
}

export async function loadModelRouterConfig(): Promise<ModelRouterConfig> {
  if (cachedModelRouter && Date.now() - lastLoadTime < CACHE_TTL_MS) {
    return cachedModelRouter;
  }

  const config = await readYAML<ModelRouterConfig>(path.join(MODELS_DIR, 'router.yaml'));
  if (config) {
    cachedModelRouter = config;
    return config;
  }

  return getDefaultModelRouterConfig();
}

export async function saveMainConfig(config: YAMLConfig): Promise<void> {
  await writeYAML(MAIN_CONFIG, config);
  cachedMainConfig = config;
  lastLoadTime = Date.now();
  logger.info('Main config saved');
}

export async function saveAgentConfig(config: AgentConfig): Promise<void> {
  await writeYAML(path.join(AGENTS_DIR, `${config.id}.yaml`), config);
  cachedAgentConfigs.set(config.id, config);
  logger.info(`Agent config saved: ${config.id}`);
}

export function invalidateCache(): void {
  cachedMainConfig = null;
  cachedAgentConfigs.clear();
  cachedModelRouter = null;
  lastLoadTime = 0;
}

export async function initConfigFiles(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.mkdir(AGENTS_DIR, { recursive: true });
  await fs.mkdir(MODELS_DIR, { recursive: true });

  // Create default config if not exists
  try {
    await fs.access(MAIN_CONFIG);
  } catch {
    await saveMainConfig(getDefaultConfig());
    logger.info('Created default clawdagent.yaml');
  }

  // Create default model router config
  const routerPath = path.join(MODELS_DIR, 'router.yaml');
  try {
    await fs.access(routerPath);
  } catch {
    await writeYAML(routerPath, getDefaultModelRouterConfig());
    logger.info('Created default models/router.yaml');
  }
}

function getDefaultConfig(): YAMLConfig {
  return {
    agent: {
      name: 'ClawdAgent',
      version: '5.0.0',
      language: 'auto',
      timezone: 'Asia/Jerusalem',
      personality: 'professional',
    },
    models: {
      default: 'stepfun/step-3.5-flash:free',
      economy: 'nvidia/nemotron-nano-9b-v2:free',
      reasoning: 'deepseek/deepseek-r1-0528:free',
      vision: 'google/gemini-2.5-flash-preview-05-20',
      prefer_free: true,
      daily_budget_usd: 2,
    },
    features: {
      heartbeat: true,
      auto_upgrade: true,
      self_repair: true,
      self_improve: true,
      proactive_thinker: true,
      rag: true,
      voice: false,
      vision: true,
      desktop: false,
    },
    security: {
      rate_limit_max: 30,
      rate_limit_window_ms: 60000,
      require_admin: true,
      sandbox_bash: true,
      encrypt_secrets: true,
      rotate_keys: false,
      rotate_interval_hours: 72,
    },
    interfaces: {
      telegram: true,
      discord: false,
      whatsapp: false,
      web: true,
    },
    plugins: {
      enabled: true,
      directory: './plugins',
      auto_load: true,
    },
    mcp: {
      enabled: true,
      config_path: './config/mcp/servers.yaml',
    },
  };
}

function getDefaultModelRouterConfig(): ModelRouterConfig {
  return {
    complexity_rules: [
      { complexity: 'trivial', preferred_tier: 'free', fallback_tier: 'cheap', budget_threshold: 0 },
      { complexity: 'simple', preferred_tier: 'free', fallback_tier: 'cheap', budget_threshold: 0.10 },
      { complexity: 'medium', preferred_tier: 'cheap', fallback_tier: 'free', budget_threshold: 0.50 },
      { complexity: 'complex', preferred_tier: 'mid', fallback_tier: 'cheap', budget_threshold: 1.00 },
      { complexity: 'critical', preferred_tier: 'ultra', fallback_tier: 'mid', budget_threshold: 5.00 },
    ],
    model_overrides: {},
    cost_limits: {
      max_per_request: 0.50,
      daily_budget: 2,
      monthly_budget: 50,
    },
  };
}

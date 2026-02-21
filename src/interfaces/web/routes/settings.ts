import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import logger from '../../../utils/logger.js';

const SETTINGS_FILE = join(process.cwd(), 'data', 'settings.json');

interface AppSettings {
  providers: {
    anthropic: { apiKey: string; enabled: boolean };
    openrouter: { apiKey: string; enabled: boolean };
    openai: { apiKey: string; enabled: boolean };
  };
  services: {
    github: { token: string; enabled: boolean };
    brave: { apiKey: string; enabled: boolean };
    telegram: { botToken: string; enabled: boolean };
    discord: { botToken: string; enabled: boolean };
  };
  exchanges: {
    binance: { apiKey: string; apiSecret: string; enabled: boolean };
    binance_secret: { apiSecret: string; enabled: boolean };
    okx: { apiKey: string; apiSecret: string; passphrase: string; enabled: boolean };
    okx_secret: { apiSecret: string; enabled: boolean };
    okx_passphrase: { passphrase: string; enabled: boolean };
  };
  budget: {
    dailyLimit: number;
    monthlyLimit: number;
    preferFree: boolean;
  };
  providerMode: 'free' | 'cheap' | 'balanced' | 'max';
  language: 'auto' | 'he' | 'en';
}

function getDefaultSettings(): AppSettings {
  return {
    providers: {
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY ?? '', enabled: !!process.env.ANTHROPIC_API_KEY },
      openrouter: { apiKey: process.env.OPENROUTER_API_KEY ?? '', enabled: !!process.env.OPENROUTER_API_KEY },
      openai: { apiKey: process.env.OPENAI_API_KEY ?? '', enabled: !!process.env.OPENAI_API_KEY },
    },
    services: {
      github: { token: process.env.GITHUB_TOKEN ?? '', enabled: !!process.env.GITHUB_TOKEN },
      brave: { apiKey: process.env.BRAVE_API_KEY ?? '', enabled: !!process.env.BRAVE_API_KEY },
      telegram: { botToken: process.env.TELEGRAM_BOT_TOKEN ?? '', enabled: !!process.env.TELEGRAM_BOT_TOKEN },
      discord: { botToken: process.env.DISCORD_BOT_TOKEN ?? '', enabled: !!process.env.DISCORD_BOT_TOKEN },
    },
    exchanges: {
      binance: { apiKey: process.env.BINANCE_API_KEY ?? '', apiSecret: '', enabled: !!process.env.BINANCE_API_KEY },
      binance_secret: { apiSecret: process.env.BINANCE_API_SECRET ?? '', enabled: !!process.env.BINANCE_API_SECRET },
      okx: { apiKey: process.env.OKX_API_KEY ?? '', apiSecret: '', passphrase: '', enabled: !!process.env.OKX_API_KEY },
      okx_secret: { apiSecret: process.env.OKX_API_SECRET ?? '', enabled: !!process.env.OKX_API_SECRET },
      okx_passphrase: { passphrase: process.env.OKX_PASSPHRASE ?? '', enabled: !!process.env.OKX_PASSPHRASE },
    },
    budget: {
      dailyLimit: parseFloat(process.env.DAILY_BUDGET_LIMIT ?? '5'),
      monthlyLimit: parseFloat(process.env.MONTHLY_BUDGET_LIMIT ?? '100'),
      preferFree: process.env.PREFER_FREE_MODELS === 'true',
    },
    providerMode: (process.env.PROVIDER_MODE as AppSettings['providerMode']) ?? 'balanced',
    language: 'auto',
  };
}

function loadSettings(): AppSettings {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const raw = readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...getDefaultSettings(), ...JSON.parse(raw) };
    }
  } catch (err) {
    logger.warn('Failed to load settings file, using defaults', { error: err });
  }
  return getDefaultSettings();
}

function saveSettings(settings: AppSettings): void {
  const dir = dirname(SETTINGS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

/** Mask an API key for display: show first 4 and last 4 chars */
function maskKey(key: string): string {
  if (!key || key.length < 12) return key ? '••••••••' : '';
  return `${key.slice(0, 4)}${'•'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
}

/** Return settings with masked keys for the frontend */
function maskSettings(settings: AppSettings) {
  return {
    providers: {
      anthropic: { ...settings.providers.anthropic, apiKey: maskKey(settings.providers.anthropic.apiKey) },
      openrouter: { ...settings.providers.openrouter, apiKey: maskKey(settings.providers.openrouter.apiKey) },
      openai: { ...settings.providers.openai, apiKey: maskKey(settings.providers.openai.apiKey) },
    },
    services: {
      github: { ...settings.services.github, token: maskKey(settings.services.github.token) },
      brave: { ...settings.services.brave, apiKey: maskKey(settings.services.brave.apiKey) },
      telegram: { ...settings.services.telegram, botToken: maskKey(settings.services.telegram.botToken) },
      discord: { ...settings.services.discord, botToken: maskKey(settings.services.discord.botToken) },
    },
    exchanges: {
      binance: { ...settings.exchanges.binance, apiKey: maskKey(settings.exchanges.binance.apiKey) },
      binance_secret: { ...settings.exchanges.binance_secret, apiSecret: maskKey(settings.exchanges.binance_secret.apiSecret) },
      okx: { ...settings.exchanges.okx, apiKey: maskKey(settings.exchanges.okx.apiKey) },
      okx_secret: { ...settings.exchanges.okx_secret, apiSecret: maskKey(settings.exchanges.okx_secret.apiSecret) },
      okx_passphrase: { ...settings.exchanges.okx_passphrase, passphrase: maskKey(settings.exchanges.okx_passphrase.passphrase) },
    },
    budget: settings.budget,
    providerMode: settings.providerMode,
    language: settings.language,
  };
}

export function setupSettingsRoutes(): Router {
  const router = Router();

  // GET /api/settings — return masked settings
  router.get('/', (_req: Request, res: Response) => {
    const settings = loadSettings();
    res.json(maskSettings(settings));
  });

  // PUT /api/settings — update settings
  router.put('/', (req: Request, res: Response) => {
    const current = loadSettings();
    const updates = req.body;

    // Merge providers (only update if the key is not masked)
    if (updates.providers) {
      for (const [provider, data] of Object.entries(updates.providers) as [string, any][]) {
        if (current.providers[provider as keyof typeof current.providers]) {
          const target = current.providers[provider as keyof typeof current.providers] as any;
          if (data.apiKey && !data.apiKey.includes('••')) {
            target.apiKey = data.apiKey;
          }
          if (typeof data.enabled === 'boolean') target.enabled = data.enabled;
        }
      }
    }

    // Merge services
    if (updates.services) {
      for (const [service, data] of Object.entries(updates.services) as [string, any][]) {
        if (current.services[service as keyof typeof current.services]) {
          const target = current.services[service as keyof typeof current.services] as any;
          const keyField = 'apiKey' in target ? 'apiKey' : 'token' in target ? 'token' : 'botToken';
          if (data[keyField] && !data[keyField].includes('••')) {
            target[keyField] = data[keyField];
          }
          if (typeof data.enabled === 'boolean') target.enabled = data.enabled;
        }
      }
    }

    // Merge exchanges
    if (updates.exchanges) {
      if (!current.exchanges) (current as any).exchanges = getDefaultSettings().exchanges;
      for (const [ex, data] of Object.entries(updates.exchanges) as [string, any][]) {
        const target = (current.exchanges as any)[ex];
        if (!target) continue;
        for (const [k, v] of Object.entries(data)) {
          if (typeof v === 'string' && v && !v.includes('••')) (target as any)[k] = v;
          if (typeof v === 'boolean') (target as any)[k] = v;
        }
      }
    }

    // Merge budget
    if (updates.budget) {
      if (typeof updates.budget.dailyLimit === 'number') current.budget.dailyLimit = updates.budget.dailyLimit;
      if (typeof updates.budget.monthlyLimit === 'number') current.budget.monthlyLimit = updates.budget.monthlyLimit;
      if (typeof updates.budget.preferFree === 'boolean') current.budget.preferFree = updates.budget.preferFree;
    }

    if (updates.providerMode) current.providerMode = updates.providerMode;
    if (updates.language) current.language = updates.language;

    saveSettings(current);
    logger.info('Settings updated via dashboard');
    res.json({ success: true, settings: maskSettings(current) });
  });

  // POST /api/settings/test-key — test an API key
  router.post('/test-key', async (req: Request, res: Response) => {
    const { provider, key } = req.body;
    if (!provider || !key) {
      res.status(400).json({ error: 'Missing provider or key' });
      return;
    }

    try {
      let valid = false;
      let message = '';

      switch (provider) {
        case 'anthropic': {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'test' }],
            }),
          });
          valid = resp.ok;
          message = valid ? 'Anthropic API key is valid' : `Invalid: ${resp.status}`;
          break;
        }
        case 'openrouter': {
          const resp = await fetch('https://openrouter.ai/api/v1/auth/key', {
            headers: { Authorization: `Bearer ${key}` },
          });
          valid = resp.ok;
          message = valid ? 'OpenRouter API key is valid' : `Invalid: ${resp.status}`;
          break;
        }
        case 'openai': {
          const resp = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${key}` },
          });
          valid = resp.ok;
          message = valid ? 'OpenAI API key is valid' : `Invalid: ${resp.status}`;
          break;
        }
        case 'github': {
          const resp = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${key}` },
          });
          valid = resp.ok;
          message = valid ? 'GitHub token is valid' : `Invalid: ${resp.status}`;
          break;
        }
        case 'brave': {
          const resp = await fetch('https://api.search.brave.com/res/v1/web/search?q=test&count=1', {
            headers: { 'X-Subscription-Token': key },
          });
          valid = resp.ok;
          message = valid ? 'Brave API key is valid' : `Invalid: ${resp.status}`;
          break;
        }
        default:
          res.status(400).json({ error: `Unknown provider: ${provider}` });
          return;
      }

      res.json({ valid, message, provider });
    } catch (err: any) {
      res.json({ valid: false, message: `Connection error: ${err.message}`, provider });
    }
  });

  return router;
}

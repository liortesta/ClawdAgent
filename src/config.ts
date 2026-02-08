import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  AI_MODEL: z.string().default('claude-sonnet-4-20250514'),
  AI_MAX_TOKENS: z.coerce.number().default(4096),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_IDS: z.string().optional().transform(v => v?.split(',').map(Number) ?? []),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_ADMIN_IDS: z.string().optional().transform(v => v?.split(',') ?? []),
  WHATSAPP_ENABLED: z.string().default('false').transform(v => v === 'true'),
  WHATSAPP_SESSION_PATH: z.string().default('./data/whatsapp-session'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  BRAVE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OLLAMA_URL: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_DEFAULT_MODEL: z.string().default('stepfun/step-3.5-flash:free'),
  OPENROUTER_REASONING_MODEL: z.string().default('deepseek/deepseek-r1-0528:free'),
  OPENROUTER_ECONOMY_MODEL: z.string().default('nvidia/nemotron-nano-9b-v2:free'),
  HEARTBEAT_ENABLED: z.string().default('true').transform(v => v === 'true'),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().default(60000),
  UPGRADE_SOURCES: z.string().optional().transform(v => v?.split(',').filter(Boolean) ?? []),
  MCP_SERVERS: z.string().optional().transform(v => v?.split(',').filter(Boolean) ?? []),
  TTS_VOICE: z.string().default('nova'),
  DESKTOP_ENABLED: z.string().default('false').transform(v => v === 'true'),
  DESKTOP_MAX_ACTIONS_PER_MINUTE: z.coerce.number().default(60),
  DESKTOP_REQUIRE_CONFIRMATION: z.string().default('true').transform(v => v === 'true'),
  PROJECTS_DIR: z.string().default('./data/projects'),
  CRON_TIMEZONE: z.string().default('Asia/Jerusalem'),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  DEFAULT_SSH_SERVER: z.string().optional(),  // e.g. "root@37.60.225.76" — all bash commands auto-SSH to this server
  DEFAULT_SSH_KEY_PATH: z.string().optional(),  // e.g. "C:/Users/lior/.ssh/clawdagent_key" — SSH private key for auto-SSH
  SSH_ENABLED: z.string().default('false').transform(v => v === 'true'),
  JWT_SECRET: z.string().min(32).default('change-this-to-a-real-secret-at-least-32-chars'),
  ENCRYPTION_KEY: z.string().min(32).default('change-this-to-a-real-key-at-least-32-chars'),
  RATE_LIMIT_MAX: z.coerce.number().default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  // Model router — smart cost optimization
  PREFER_FREE_MODELS: z.string().default('true').transform(v => v === 'true'),
  DAILY_BUDGET_USD: z.coerce.number().default(2),
  MODEL_OVERRIDE: z.string().optional(),
  // Twilio (phone/SMS)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  // Kie.ai (AI content generation)
  KIE_AI_API_KEY: z.string().optional(),
  // Blotato (social media publishing)
  BLOTATO_API_KEY: z.string().optional(),
  BLOTATO_ACCOUNT_TWITTER: z.string().optional(),
  BLOTATO_ACCOUNT_INSTAGRAM: z.string().optional(),
  BLOTATO_ACCOUNT_FACEBOOK: z.string().optional(),
  BLOTATO_ACCOUNT_LINKEDIN: z.string().optional(),
  BLOTATO_ACCOUNT_TIKTOK: z.string().optional(),
  BLOTATO_ACCOUNT_YOUTUBE: z.string().optional(),
  BLOTATO_ACCOUNT_THREADS: z.string().optional(),
  BLOTATO_ACCOUNT_BLUESKY: z.string().optional(),
  BLOTATO_ACCOUNT_PINTEREST: z.string().optional(),
  // OpenClaw bridge
  OPENCLAW_GATEWAY_TOKEN: z.string().optional(),
  OPENCLAW_GATEWAY_PORT: z.coerce.number().default(18789),
});

export type Config = z.infer<typeof configSchema>;

let config: Config;

try {
  config = configSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Configuration error:');
    error.issues.forEach(issue => {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export default Object.freeze(config);

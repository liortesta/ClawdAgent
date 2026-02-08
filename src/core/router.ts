import { AIClient } from './ai-client.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import { extractJSON } from '../utils/helpers.js';

export enum Intent {
  SERVER_STATUS = 'server_status',
  SERVER_DEPLOY = 'server_deploy',
  SERVER_FIX = 'server_fix',
  SERVER_MONITOR = 'server_monitor',
  CODE_WRITE = 'code_write',
  CODE_FIX = 'code_fix',
  CODE_REVIEW = 'code_review',
  GITHUB_PR = 'github_pr',
  GITHUB_ISSUE = 'github_issue',
  WEB_SEARCH = 'web_search',
  QUESTION_ANSWER = 'question_answer',
  TASK_CREATE = 'task_create',
  TASK_LIST = 'task_list',
  TASK_UPDATE = 'task_update',
  REMINDER_SET = 'reminder_set',
  GENERAL_CHAT = 'general_chat',
  HELP = 'help',
  SETTINGS = 'settings',
  DESKTOP_CONTROL = 'desktop_control',
  DESKTOP_SCREENSHOT = 'desktop_screenshot',
  BUILD_PROJECT = 'build_project',
  SCHEDULE = 'schedule',
  EMAIL = 'email',
  DOCUMENT = 'document',
  CALENDAR = 'calendar',
  USAGE = 'usage',
  WEB_ACTION = 'web_action',
  PHONE = 'phone',
  CONTENT_CREATE = 'content_create',
  SOCIAL_PUBLISH = 'social_publish',
  ORCHESTRATE = 'orchestrate',
}

export interface RoutingResult {
  intent: Intent;
  confidence: number;
  agentId: string;
  extractedParams: Record<string, string>;
}

const ROUTING_PROMPT = `You are an intent classifier for an AI assistant called ClawdAgent.
Classify the user's message into EXACTLY ONE intent.

Available intents:
- server_status: Check server health, uptime, metrics
- server_deploy: Deploy code, restart services
- server_fix: Fix server issues, debug errors
- server_monitor: Set up monitoring, alerts
- code_write: Write new code, create files, implement features
- code_fix: Fix bugs, resolve errors
- code_review: Review existing code
- github_pr: Create, review, or merge pull requests
- github_issue: Create or manage GitHub issues
- web_search: Search the web for information
- question_answer: Answer a knowledge question (no search needed)
- task_create: Create a new task or todo item
- task_list: Show existing tasks
- task_update: Update, complete, or delete a task
- reminder_set: Set a reminder for a specific time
- general_chat: Casual conversation, greeting, or off-topic
- help: User asking for help with the bot itself
- settings: User wants to change bot settings
- desktop_control: Control the computer — click, type, open apps, interact with the screen
- desktop_screenshot: Take a screenshot or describe what's on screen
- build_project: Build, scaffold, create, or deploy a new app/project/website
- schedule: Schedule recurring tasks, set up automations, cron jobs, periodic alerts (every day, every morning, כל בוקר)
- email: Send email, check inbox, compose, שלח מייל, בדוק מיילים
- document: Upload, analyze file, PDF, מסמך, העלה קובץ, ask about uploaded document
- calendar: Calendar, schedule meeting, מה יש לי היום, פגישה, יומן, events
- usage: Check costs, usage stats, how much did it cost, כמה עלה, budget
- web_action: Sign up for a website, fill a form, scrape a page, open a URL, navigate web, תירשם, הירשם לאתר, פתח אתר, מלא טופס
- phone: Send SMS, make a phone call, text message, שלח SMS, תתקשר, הודעה, טלפון
- content_create: Generate AI content — video, image, music, UGC, create content, צור וידאו, תיצור תמונה, generate video, make content, AI art, AI video
- social_publish: Publish to social media — פרסם, תפרסם, publish to, post on, share to, cross-post, schedule post, תזמן פוסט, רשתות חברתיות, tiktok, instagram, youtube
- orchestrate: Coordinate between ClawdAgent and OpenClaw, manage OpenClaw, Facebook via OpenClaw, WhatsApp via OpenClaw, check OpenClaw status, sync data between systems, content pipeline (create + publish everywhere), affiliate management — openclaw, תשלח ל-openclaw, מה קורה ב-openclaw, תפעיל את openclaw, פייסבוק, whatsapp, ווטסאפ, affiliate, תנהל, תתאם, סינרגיה, תפרסם בכל מקום, צור ופרסם

Hebrew examples:
- "מה מצב השרת" → server_status
- "תתקן את השרת" → server_fix
- "תחפש באינטרנט" → web_search
- "תזכיר לי בעוד 5 דקות" → reminder_set
- "מה אתה יכול לעשות" → help
- "תשדרג את עצמך" → general_chat
- "תקרא את הקובץ" → server_status (use server-manager for file operations)
- "מה חדש" → general_chat
- "תירשם לאתר X" → web_action
- "שלח SMS ל-..." → phone
- "תתקשר ל-..." → phone
- "תיצור וידאו" → content_create
- "תפרסם בכל הרשתות" → social_publish
- "צור תמונה של..." → content_create
- "מה קורה ב-OpenClaw?" → orchestrate
- "תשלח ב-פייסבוק..." → orchestrate
- "תפרסם בכל מקום" → orchestrate
- "מה המצב של שני המערכות?" → orchestrate
- "תתאם בין ClawdAgent ל-OpenClaw" → orchestrate

Respond ONLY with valid JSON (no markdown, no text before/after):
{"intent":"<intent_name>","confidence":<0.0-1.0>,"agent":"<best_agent>","params":{"key":"value"}}

Agent options: server-manager, code-assistant, researcher, task-planner, general, desktop-controller, project-builder, web-agent, content-creator, orchestrator`;

export class IntentRouter {
  private ai: AIClient;

  constructor(ai: AIClient) {
    this.ai = ai;
  }

  async classify(message: string, conversationContext?: string): Promise<RoutingResult> {
    const contextNote = conversationContext ? `\n\nRecent conversation context:\n${conversationContext}` : '';

    try {
      const response = await this.ai.chat({
        systemPrompt: ROUTING_PROMPT + contextNote,
        messages: [{ role: 'user', content: message }],
        maxTokens: 200,
        temperature: 0.1,
        model: config.OPENROUTER_API_KEY
          ? config.OPENROUTER_ECONOMY_MODEL
          : 'claude-haiku-4-5-20251001',
        provider: config.OPENROUTER_API_KEY ? 'openrouter' : 'anthropic',
      });

      const parsed = extractJSON(response.content);
      return {
        intent: parsed.intent as Intent,
        confidence: parsed.confidence,
        agentId: parsed.agent,
        extractedParams: parsed.params ?? {},
      };
    } catch (error: any) {
      logger.warn('Intent classification failed, defaulting to general_chat', { error: error?.message ?? String(error) });
      return { intent: Intent.GENERAL_CHAT, confidence: 0.5, agentId: 'general', extractedParams: {} };
    }
  }
}

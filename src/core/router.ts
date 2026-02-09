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
  REMEMBER = 'remember',
  AUTONOMOUS_TASK = 'autonomous_task',
  SELF_DIAGNOSE = 'self_diagnose',
  WORKFLOW = 'workflow',
  ANALYTICS = 'analytics',
  DEVICE_CONTROL = 'device_control',
  DEVICE_CONFIG = 'device_config',
  UGC_CREATE = 'ugc_create',
  PODCAST_CREATE = 'podcast_create',
  SITE_ANALYZE = 'site_analyze',
  SERVER_MANAGE = 'server_manage',
  SERVER_HEALTH = 'server_health',
  SERVER_SCAN = 'server_scan',
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
- remember: Save or recall facts/preferences — remember that, תזכור ש, מה אתה זוכר, תשכח את, what do you know about me, save this
- autonomous_task: Run a complex multi-step goal autonomously — תעשה באופן אוטונומי, run autonomously, execute goal, auto-run, תריץ לבד, do this yourself
- self_diagnose: Check system health, self-repair, diagnose issues — תבדוק את עצמך, מה המצב שלך, self check, diagnose, תתקן את עצמך
- workflow: Create or manage automated workflows/chains — תהליך, workflow, automation, שרשרת, כל בוקר תעשה X, automate this
- analytics: Usage stats, cost reports, API key status — סטטיסטיקות, analytics, כמה עולה, cost, דו"ח, כמה עלה, budget, תבדוק API keys
- device_control: Control Android phone/tablet — tap, swipe, type, open app, screenshot, ADB command, Appium, send WhatsApp from phone, post TikTok from phone — תשלוט בטלפון, תלחץ על, תפתח אפליקציה, צילום מסך טלפון, תשלח ווטסאפ מהטלפון
- device_config: Configure device connection, list devices, device info — חבר טלפון, הגדרות מכשיר, מה המכשירים
- ugc_create: Create UGC (User Generated Content) — product showcase, AI influencer, brand content, UGC video, תוכן UGC, צור UGC, תיצור UGC, מוצר, שיווק, brand video, product video
- podcast_create: Create podcast, audio show, multi-speaker conversation — פודקאסט, תיצור פודקאסט, podcast, audio show, שיחה, דיון, דיבייט, ראיון, interview
- site_analyze: Analyze a website, build a clone, compare sites, tech stack analysis — תנתח אתר, נתח אתר, analyze site, analyze website, site analysis, תבנה אתר דומה, clone site, מה הטכנולוגיה של, tech stack
- server_manage: Manage SSH servers — add, remove, connect, list servers, switch between servers, execute on specific server, upload/download files — תתחבר לשרת, חבר שרת, שרתים, servers, תוסיף שרת, add server, switch server, תעלה קובץ לשרת, /servers
- server_health: Check server health, monitor servers, CPU/RAM/disk usage — בריאות שרת, health check, server health, מצב השרתים, how are my servers, תבדוק את כל השרתים, /health
- server_scan: Scan/discover what's on a server — capabilities, tools, projects, databases — תסרוק שרת, scan server, מה יש בשרת, what's on the server, discover, תגלה מה רץ, /server scan

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
- "תזכור שאני אוהב פייתון" → remember
- "מה אתה יודע עליי" → remember
- "תעשה את זה לבד" → autonomous_task
- "תבדוק את עצמך" → self_diagnose
- "כמה עלה לי היום" → analytics
- "תבדוק API keys" → analytics
- "תיצור תהליך אוטומטי" → workflow
- "תלחץ על הטלפון" → device_control
- "תשלח ווטסאפ מהטלפון" → device_control
- "מה המכשירים המחוברים" → device_config
- "צור UGC למוצר הזה" → ugc_create
- "תעשה סרטון UGC לקרם פנים" → ugc_create
- "תיצור פודקאסט על AI" → podcast_create
- "תעשה ראיון בין שני אנשים על טכנולוגיה" → podcast_create
- "תנתח את האתר הזה" → site_analyze
- "מה הטכנולוגיה של wix.com" → site_analyze
- "תבנה לי אתר דומה ל..." → site_analyze
- "תתחבר לשרת root@10.0.0.5" → server_manage
- "הראה את כל השרתים" → server_manage
- "מה הבריאות של השרתים" → server_health
- "תסרוק את השרת" → server_scan
- "מה יש על השרת" → server_scan

Respond ONLY with valid JSON (no markdown, no text before/after):
{"intent":"<intent_name>","confidence":<0.0-1.0>,"agent":"<best_agent>","params":{"key":"value"}}

Agent options: server-manager, code-assistant, researcher, task-planner, general, desktop-controller, project-builder, web-agent, content-creator, orchestrator, device-controller

For ugc_create and podcast_create → use content-creator agent.
For site_analyze → use orchestrator agent.
For server_manage, server_health, server_scan → use server-manager agent.`;

export class IntentRouter {
  private ai: AIClient;

  constructor(ai: AIClient) {
    this.ai = ai;
  }

  async classify(message: string, conversationContext?: string): Promise<RoutingResult> {
    const contextNote = conversationContext ? `\n\nRecent conversation context:\n${conversationContext}` : '';

    // Always try keyword fallback FIRST — it's instant and reliable for Hebrew
    const keywordResult = this.keywordClassify(message);

    try {
      // Classification needs FAST JSON responses (< 5s).
      // CLI is too slow (120s timeout) and returns prose instead of JSON.
      // OpenRouter free models (Llama) return 429 rate limits consistently.
      // Always use Anthropic Haiku — fast, cheap ($0.25/M), reliable JSON output.
      const response = await this.ai.chat({
        systemPrompt: ROUTING_PROMPT + contextNote,
        messages: [{ role: 'user', content: message }],
        maxTokens: 200,
        temperature: 0.1,
        model: 'claude-haiku-4-5-20251001',
        provider: 'anthropic' as const,
      });

      const parsed = extractJSON(response.content);
      if (parsed && parsed.intent) {
        return {
          intent: parsed.intent as Intent,
          confidence: parsed.confidence,
          agentId: parsed.agent,
          extractedParams: parsed.params ?? {},
        };
      }
      // AI returned something but no valid intent — use keyword result
      throw new Error('No valid intent in AI response');
    } catch (error: any) {
      logger.warn('AI classification failed, trying keyword fallback', { error: error?.message ?? String(error) });
      if (keywordResult) {
        logger.info('Keyword fallback matched', { intent: keywordResult.intent, agent: keywordResult.agentId });
        return keywordResult;
      }
      return { intent: Intent.GENERAL_CHAT, confidence: 0.5, agentId: 'general', extractedParams: {} };
    }
  }

  /**
   * Keyword-based intent classifier — used as fallback when AI classification fails.
   * Catches the most common Hebrew + English patterns.
   */
  private keywordClassify(message: string): RoutingResult | null {
    const m = message.toLowerCase();

    // UGC Factory — product showcase, AI influencer, brand content
    if (/UGC|ugc|תוכן.*מוצר|product.*video|brand.*content|AI.*influencer|מוצר.*וידאו|שיווק.*מוצר|product.*showcase/i.test(message)) {
      return { intent: Intent.UGC_CREATE, confidence: 0.9, agentId: 'content-creator', extractedParams: {} };
    }

    // Podcast creation
    if (/פודקאסט|podcast|audio.*show|ראיון.*בין|interview.*between|דיון.*על|debate.*about|דיבייט|multi.*speaker|שיחה.*בין/i.test(message)) {
      return { intent: Intent.PODCAST_CREATE, confidence: 0.9, agentId: 'content-creator', extractedParams: {} };
    }

    // Site analysis / clone
    if (/תנתח.*אתר|נתח.*אתר|analyze.*site|analyze.*website|site.*analysis|clone.*site|tech.*stack|טכנולוגי.*של.*אתר|תבנה.*אתר.*דומה/i.test(message)) {
      return { intent: Intent.SITE_ANALYZE, confidence: 0.9, agentId: 'orchestrator', extractedParams: {} };
    }

    // Content creation (images, videos, music)
    if (/תיצור|צור.*תמונ|תעשה.*תמונ|generate.*image|create.*image|make.*image|תיצור.*וידאו|צור.*וידאו|generate.*video|create.*video|make.*video|תעשה.*וידאו|צור.*שיר|generate.*music|AI art|וידאו|סרטון|תמונה|שיר|מוזיקה/i.test(message)) {
      return { intent: Intent.CONTENT_CREATE, confidence: 0.85, agentId: 'content-creator', extractedParams: {} };
    }

    // Social media publish — catch any mention of platforms, publishing, blotato, social
    if (/תפרסם|פרסם|פרסום|publish|post.*to|share.*to|cross.?post|תזמן.*פוסט|schedule.*post|blotato|בלוטאטו|רשתות.*חברת|social.*media|instagram|tiktok|facebook|youtube|טיק.?טוק|אינסטגרם|פייסבוק|יוטיוב|reels|רילס|רשתות/i.test(message)) {
      return { intent: Intent.SOCIAL_PUBLISH, confidence: 0.85, agentId: 'content-creator', extractedParams: {} };
    }

    // Workflow / automation
    if (/אוטומציה|automation|workflow|תהליך|כל.*יום|every.*day|cron|קרון|תזמן|schedule|פעם.*ביום|once.*day/i.test(message)) {
      return { intent: Intent.WORKFLOW, confidence: 0.8, agentId: 'content-creator', extractedParams: {} };
    }

    // Server health check
    if (/בריאות.*שרת|health.*server|server.*health|מצב.*השרתים|how.*are.*servers|\/health/i.test(message)) {
      return { intent: Intent.SERVER_HEALTH, confidence: 0.9, agentId: 'server-manager', extractedParams: {} };
    }

    // Server scan / discovery
    if (/תסרוק.*שרת|scan.*server|מה.*יש.*בשרת|what.*on.*server|discover|תגלה.*מה.*רץ|\/server.*scan/i.test(message)) {
      return { intent: Intent.SERVER_SCAN, confidence: 0.9, agentId: 'server-manager', extractedParams: {} };
    }

    // Server management (connect, add, list, switch, upload, download)
    if (/תתחבר.*לשרת|connect.*server|add.*server|תוסיף.*שרת|list.*server|השרתים|\/servers|switch.*server|החלף.*שרת|תעלה.*קובץ.*לשרת|upload.*server|download.*server/i.test(message)) {
      return { intent: Intent.SERVER_MANAGE, confidence: 0.9, agentId: 'server-manager', extractedParams: {} };
    }

    // General server operations (status, deploy, docker, ssh)
    if (/שרת|server|deploy|docker|ssh|uptime|מצב.*שרת|תתקן.*שרת/i.test(message)) {
      return { intent: Intent.SERVER_STATUS, confidence: 0.7, agentId: 'server-manager', extractedParams: {} };
    }

    // Web search
    if (/חפש|תחפש|search|חיפוש|google|find.*info/i.test(message)) {
      return { intent: Intent.WEB_SEARCH, confidence: 0.8, agentId: 'researcher', extractedParams: {} };
    }

    // Tasks
    if (/משימ|task|todo|תוסיף.*משימ|create.*task/i.test(message)) {
      return { intent: Intent.TASK_CREATE, confidence: 0.8, agentId: 'task-planner', extractedParams: {} };
    }

    // Reminder
    if (/תזכיר|remind|תזכורת|בעוד.*דקות|in.*minutes/i.test(message)) {
      return { intent: Intent.REMINDER_SET, confidence: 0.85, agentId: 'task-planner', extractedParams: {} };
    }

    // Memory
    if (/תזכור.*ש|remember.*that|מה.*זוכר|what.*know.*about.*me|תשכח/i.test(message)) {
      return { intent: Intent.REMEMBER, confidence: 0.85, agentId: 'general', extractedParams: {} };
    }

    // Analytics / costs
    if (/כמה.*על|cost|budget|סטטיסטיק|analytics|API.*key/i.test(message)) {
      return { intent: Intent.ANALYTICS, confidence: 0.8, agentId: 'general', extractedParams: {} };
    }

    // Help
    if (/מה.*יכול|what.*can.*you|עזרה|help/i.test(message)) {
      return { intent: Intent.HELP, confidence: 0.8, agentId: 'general', extractedParams: {} };
    }

    // Device control
    if (/טלפון|phone.*tap|phone.*swipe|adb|appium|תלחץ.*טלפון|תשלוט.*מכשיר/i.test(message)) {
      return { intent: Intent.DEVICE_CONTROL, confidence: 0.8, agentId: 'device-controller', extractedParams: {} };
    }

    // Orchestrate / OpenClaw
    if (/openclaw|אופנקלאו|תתאם|coordinate|סינרגיה/i.test(message)) {
      return { intent: Intent.ORCHESTRATE, confidence: 0.8, agentId: 'orchestrator', extractedParams: {} };
    }

    // Code
    if (/תכתוב.*קוד|write.*code|fix.*bug|תתקן.*באג|code.*review|PR|pull.*request/i.test(message)) {
      return { intent: Intent.CODE_WRITE, confidence: 0.7, agentId: 'code-assistant', extractedParams: {} };
    }

    // Email
    if (/מייל|email|שלח.*מייל|inbox|send.*email/i.test(message)) {
      return { intent: Intent.EMAIL, confidence: 0.8, agentId: 'general', extractedParams: {} };
    }

    // Web action
    if (/תירשם|sign.*up|fill.*form|scrape|מלא.*טופס|פתח.*אתר/i.test(message)) {
      return { intent: Intent.WEB_ACTION, confidence: 0.8, agentId: 'web-agent', extractedParams: {} };
    }

    return null; // No keyword match — will default to general_chat
  }
}

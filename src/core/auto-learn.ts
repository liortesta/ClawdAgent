import { AIClient } from './ai-client.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import { extractJSON } from '../utils/helpers.js';

export interface LearnedFact {
  key: string;
  value: string;
  category: 'preference' | 'project' | 'personal' | 'technical' | 'server' | 'schedule' | 'contact' | 'goal';
  confidence: number;
}

const EXTRACTION_PROMPT = `Extract facts about the user from this conversation exchange.
Return a JSON array of facts. Only include things you are CONFIDENT about (confidence >= 0.7).

Categories:
- preference: language, style, tool preferences, communication style
- project: project names, repos, technologies used, architectures
- personal: name, timezone, work schedule, language spoken
- technical: programming skills, languages known, experience level
- server: server names, IPs, configurations, services
- schedule: working hours, meeting times, deadlines, routines
- contact: emails, usernames, team members
- goal: short/long term goals, plans, aspirations

Return ONLY valid JSON array: [{"key": "...", "value": "...", "category": "...", "confidence": 0.0-1.0}]
Return empty array [] if no new facts found.
Do NOT extract trivial facts. Only extract MEANINGFUL, REUSABLE information.`;

export class AutoLearn {
  private ai: AIClient;

  constructor(ai: AIClient) {
    this.ai = ai;
  }

  async extractFacts(userMessage: string, agentResponse: string): Promise<LearnedFact[]> {
    try {
      const response = await this.ai.chat({
        model: config.OPENROUTER_API_KEY
          ? config.OPENROUTER_ECONOMY_MODEL
          : 'claude-haiku-4-5-20251001',
        provider: config.OPENROUTER_API_KEY ? 'openrouter' : 'anthropic',
        systemPrompt: EXTRACTION_PROMPT,
        messages: [{ role: 'user', content: `User said: "${userMessage}"\nAssistant replied: "${agentResponse}"` }],
        maxTokens: 500,
        temperature: 0.1,
      });

      const facts = extractJSON<LearnedFact[]>(response.content);
      const filtered = facts.filter(f => f.confidence >= 0.7 && f.key && f.value);

      if (filtered.length > 0) {
        logger.info('Auto-learn extracted facts', { count: filtered.length, facts: filtered.map(f => f.key) });
      }

      return filtered;
    } catch (err: any) {
      logger.debug('Auto-learn extraction failed', { error: err.message });
      return [];
    }
  }

  async extractFromHistory(messages: Array<{ role: string; content: string }>): Promise<LearnedFact[]> {
    if (messages.length < 4) return []; // Need enough context

    const lastMessages = messages.slice(-10);
    try {
      const response = await this.ai.chat({
        model: config.OPENROUTER_API_KEY
          ? config.OPENROUTER_ECONOMY_MODEL
          : 'claude-haiku-4-5-20251001',
        provider: config.OPENROUTER_API_KEY ? 'openrouter' : 'anthropic',
        systemPrompt: EXTRACTION_PROMPT,
        messages: [{ role: 'user', content: lastMessages.map(m => `${m.role}: ${m.content}`).join('\n') }],
        maxTokens: 800,
        temperature: 0.1,
      });

      const facts = extractJSON<LearnedFact[]>(response.content);
      return facts.filter(f => f.confidence >= 0.7 && f.key && f.value);
    } catch {
      return [];
    }
  }
}

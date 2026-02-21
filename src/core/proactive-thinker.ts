import config from '../config.js';
import logger from '../utils/logger.js';

/**
 * Proactive Thinker — ClawdAgent doesn't just react, it THINKS.
 * Runs periodically (e.g. every hour via heartbeat) to check status,
 * spot problems, and find opportunities.
 */
export class ProactiveThinker {
  private aiChat: (system: string, message: string) => Promise<string>;
  private getSystemStatus: () => Promise<string>;
  private getMemoryContext: () => Promise<string>;

  constructor(params: {
    aiChat: (system: string, message: string) => Promise<string>;
    getSystemStatus: () => Promise<string>;
    getMemoryContext: () => Promise<string>;
  }) {
    this.aiChat = params.aiChat;
    this.getSystemStatus = params.getSystemStatus;
    this.getMemoryContext = params.getMemoryContext;
  }

  /**
   * Main thinking cycle.
   * Returns array of thoughts with optional messages to send to owner.
   */
  async think(): Promise<Array<{
    type: 'warning' | 'opportunity' | 'suggestion' | 'maintenance';
    priority: number;
    message?: string;
  }>> {
    try {
      const status = await this.getSystemStatus();
      const memoryContext = await this.getMemoryContext();

      const thought = await this.aiChat(
        `You are the proactive brain of ClawdAgent. Think about:
1. Is anything broken or about to break?
2. Are there opportunities the owner should know about?
3. What maintenance should be done?

Current time: ${new Date().toISOString()}
Local time: ${new Date().toLocaleString('en-US', { timeZone: config.CRON_TIMEZONE })}

Respond ONLY with JSON:
{
  "thoughts": [
    {
      "type": "warning|opportunity|suggestion|maintenance",
      "priority": 1-10,
      "message": "Hebrew message to send (only for priority >= 7, null otherwise)"
    }
  ]
}

Rules:
- Max 3 thoughts
- Only include message for priority >= 7
- Think in HEBREW for messages
- Be concise`,

        `SYSTEM:\n${status}\n\nMEMORY:\n${memoryContext}`,
      );

      const cleaned = thought.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const thoughts = parsed.thoughts || [];

      logger.info('Proactive thinking completed', { thoughts: thoughts.length });
      return thoughts;
    } catch (err: any) {
      logger.debug('Proactive thinking failed', { error: err.message });
      return [];
    }
  }
}

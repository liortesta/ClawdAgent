import Anthropic from '@anthropic-ai/sdk';
import { DesktopController, DesktopAction } from './controller.js';
import { screenshotToPng, resizeForAI, pngToBase64 } from './image-utils.js';
import { checkDesktopSafety, DesktopRateLimiter } from './safety.js';
import config from '../../config.js';
import logger from '../../utils/logger.js';

interface VisionDecision {
  reasoning: string;
  action: DesktopAction | null;
  done: boolean;
  summary?: string;
}

const VISION_SYSTEM_PROMPT = `You are an AI that can see and control a computer screen.
You will receive a screenshot and a user's goal. Decide the next action to take.

Available actions:
- click: { type: "click", x: number, y: number }
- doubleClick: { type: "doubleClick", x: number, y: number }
- rightClick: { type: "rightClick", x: number, y: number }
- type: { type: "type", text: "string" }
- keyPress: { type: "keyPress", keys: ["key1", "key2"] }
- hotkey: { type: "hotkey", keys: ["ctrl", "c"] }
- scroll: { type: "scroll", direction: "up"|"down", amount: 3 }
- openApp: { type: "openApp", appName: "notepad" }

Respond with JSON only:
{
  "reasoning": "what I see and why I'm taking this action",
  "action": { ... } or null if done,
  "done": true/false,
  "summary": "what was accomplished (only when done=true)"
}

Important rules:
- Be precise with click coordinates based on what you see in the screenshot
- If the task is complete, set done=true and action=null
- If you can't proceed, set done=true with a summary explaining why
- Never type passwords or sensitive information
- Maximum 20 actions per task`;

export class AIDesktopVision {
  private desktop: DesktopController;
  private rateLimiter: DesktopRateLimiter;
  private maxSteps = 20;

  constructor(_ai: unknown, desktop: DesktopController) { // _ai reserved for future use
    this.desktop = desktop;
    this.rateLimiter = new DesktopRateLimiter();
  }

  /**
   * Execute a desktop task using AI vision loop:
   * screenshot → AI decides → execute action → repeat until done
   */
  async executeTask(goal: string, userId: string): Promise<{ success: boolean; summary: string; steps: number }> {
    logger.info('AI Desktop Vision: starting task', { goal, userId });

    let steps = 0;
    const actionLog: string[] = [];

    while (steps < this.maxSteps) {
      steps++;

      // Rate limit check
      if (!this.rateLimiter.check()) {
        return { success: false, summary: 'Rate limit exceeded. Too many actions per minute.', steps };
      }

      // 1. Take screenshot
      const screenshot = await this.desktop.takeScreenshot();
      if (!screenshot) {
        return { success: false, summary: 'Failed to take screenshot', steps };
      }

      // 2. Convert to PNG and resize for AI
      const png = await screenshotToPng(screenshot.buffer, screenshot.width, screenshot.height);
      const resized = await resizeForAI(png);
      const base64 = pngToBase64(resized);

      // 3. Ask AI what to do
      const decision = await this.getAIDecision(goal, base64, actionLog);

      if (decision.done) {
        const summary = decision.summary ?? 'Task completed';
        logger.info('AI Desktop Vision: task done', { goal, steps, summary });
        return { success: true, summary, steps };
      }

      if (!decision.action) {
        return { success: false, summary: 'AI returned no action and not done', steps };
      }

      // 4. Safety check
      const safetyResult = checkDesktopSafety(decision.action);
      if (!safetyResult.allowed) {
        logger.warn('AI Desktop Vision: action blocked by safety', { reason: safetyResult.reason });
        actionLog.push(`BLOCKED: ${decision.action.type} — ${safetyResult.reason}`);
        continue;
      }

      // 5. Execute the action
      logger.info('AI Desktop Vision: executing action', { step: steps, action: decision.action.type, reasoning: decision.reasoning });
      const result = await this.desktop.executeAction(decision.action);

      if (result.success) {
        actionLog.push(`Step ${steps}: ${decision.action.type} — ${decision.reasoning}`);
      } else {
        actionLog.push(`Step ${steps}: FAILED ${decision.action.type} — ${result.error}`);
      }

      // Small delay between actions for stability
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return { success: false, summary: `Reached maximum steps (${this.maxSteps}) without completing task`, steps };
  }

  private async getAIDecision(goal: string, screenshotBase64: string, actionLog: string[]): Promise<VisionDecision> {
    const historyContext = actionLog.length > 0
      ? `\n\nPrevious actions:\n${actionLog.slice(-5).join('\n')}`
      : '';

    try {
      // Call Anthropic SDK directly for multimodal (image) support
      const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

      const response = await anthropic.messages.create({
        model: config.AI_MODEL,
        max_tokens: 500,
        temperature: 0.1,
        system: VISION_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 },
            },
            {
              type: 'text',
              text: `Goal: ${goal}${historyContext}\n\nLook at the screenshot above and decide the next action.`,
            },
          ],
        }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      const content = textBlock && textBlock.type === 'text' ? textBlock.text : '';

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('AI Desktop Vision: no JSON in response', { content: content.slice(0, 200) });
        return { reasoning: 'Failed to parse response', action: null, done: true, summary: 'AI response was not valid JSON' };
      }

      return JSON.parse(jsonMatch[0]) as VisionDecision;
    } catch (err: any) {
      logger.error('AI Desktop Vision: decision failed', { error: err.message });
      return { reasoning: err.message, action: null, done: true, summary: `AI error: ${err.message}` };
    }
  }
}

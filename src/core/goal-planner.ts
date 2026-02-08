import { AIClient } from './ai-client.js';
import config from '../config.js';
import { Goal, GoalStep } from './goals.js';
import logger from '../utils/logger.js';
import { extractJSON } from '../utils/helpers.js';

const PLANNING_PROMPT = `You are a strategic planner for an autonomous AI agent called ClawdAgent.
Break goals into CONCRETE, EXECUTABLE steps.

Each step must be something the agent can actually DO with its tools:
- browser: navigate, click, type, screenshot, scrape
- ssh: execute commands on servers
- github: create PRs, issues, review code
- search: web search
- code: write, fix, review code
- tasks: create, update tasks

RULES:
1. Steps must be SPECIFIC — not "do research" but "search for X, then read top 3 results"
2. Each step should be verifiable — how do you know it worked?
3. If previous strategies failed, use a COMPLETELY DIFFERENT approach
4. Max 10 steps per plan
5. Each step gets maxAttempts (default 3)

Respond with ONLY valid JSON:
{
  "strategy": "brief description of approach",
  "steps": [
    { "description": "exact action to take", "tool": "which tool", "maxAttempts": 3 }
  ]
}`;

const REPLANNING_PROMPT = `You are replanning after a failure. Your previous approach FAILED.

CRITICAL: You must try a COMPLETELY DIFFERENT approach. Do NOT repeat failed strategies.

Examples of switching approaches:
- If direct SSH failed → try through Docker or API
- If web scraping failed → try API instead
- If one search didn't find results → try different keywords or sources
- If code fix didn't work → try a different architecture
- If automated approach failed → break into smaller manual steps

Respond with ONLY valid JSON:
{
  "strategy": "NEW approach — explain why this is different",
  "steps": [
    { "description": "exact action to take", "tool": "which tool", "maxAttempts": 3 }
  ]
}`;

export class GoalPlanner {
  private ai: AIClient;

  constructor(ai: AIClient) {
    this.ai = ai;
  }

  async planGoal(goal: Goal): Promise<GoalStep[]> {
    try {
      const response = await this.ai.chat({
        systemPrompt: PLANNING_PROMPT,
        model: config.OPENROUTER_API_KEY
          ? config.OPENROUTER_REASONING_MODEL
          : 'claude-haiku-4-5-20251001',
        provider: config.OPENROUTER_API_KEY ? 'openrouter' : 'anthropic',
        messages: [{ role: 'user', content: `
GOAL: ${goal.description}
PRIORITY: ${goal.priority}
DEADLINE: ${goal.deadline?.toISOString() ?? 'none'}
PREVIOUS FAILED STRATEGIES: ${JSON.stringify(goal.strategyHistory)}

Break this goal into concrete, executable steps.` }],
        maxTokens: 2048,
        temperature: 0.3,
      });

      const parsed = extractJSON(response.content);
      logger.info('Goal planned', { goalId: goal.id, strategy: parsed.strategy, steps: parsed.steps.length });

      return parsed.steps.map((s: any, i: number) => ({
        id: `step_${i}`,
        description: s.description,
        tool: s.tool,
        status: 'pending' as const,
        attempts: 0,
        maxAttempts: s.maxAttempts ?? 3,
      }));
    } catch (err: any) {
      logger.error('Goal planning failed', { goalId: goal.id, error: err.message });
      return [{
        id: 'step_0',
        description: goal.description,
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
      }];
    }
  }

  async replan(goal: Goal, failedStep: GoalStep): Promise<GoalStep[]> {
    try {
      const response = await this.ai.chat({
        systemPrompt: REPLANNING_PROMPT,
        model: config.OPENROUTER_API_KEY
          ? config.OPENROUTER_REASONING_MODEL
          : 'claude-haiku-4-5-20251001',
        provider: config.OPENROUTER_API_KEY ? 'openrouter' : 'anthropic',
        messages: [{ role: 'user', content: `
GOAL: ${goal.description}
COMPLETED STEPS: ${JSON.stringify(goal.steps.filter(s => s.status === 'done').map(s => s.description))}
FAILED STEP: ${failedStep.description}
ERROR: ${failedStep.error}
ALL PREVIOUS STRATEGIES THAT FAILED: ${JSON.stringify(goal.strategyHistory)}
CONTEXT GATHERED SO FAR: ${JSON.stringify(goal.context)}

Find a COMPLETELY DIFFERENT approach. Do NOT repeat what failed.` }],
        maxTokens: 2048,
        temperature: 0.5,
      });

      const parsed = extractJSON(response.content);
      logger.info('Goal replanned', { goalId: goal.id, newStrategy: parsed.strategy });

      return parsed.steps.map((s: any, i: number) => ({
        id: `step_replan_${i}`,
        description: s.description,
        tool: s.tool,
        status: 'pending' as const,
        attempts: 0,
        maxAttempts: s.maxAttempts ?? 3,
      }));
    } catch (err: any) {
      logger.error('Goal replanning failed', { goalId: goal.id, error: err.message });
      return [];
    }
  }
}

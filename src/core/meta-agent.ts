import { AIClient } from './ai-client.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import { extractJSON } from '../utils/helpers.js';

export interface ThoughtProcess {
  situation: string;
  analysis: string;
  plan: string[];
  confidence: number;
  alternatives: string[];
  risks: string[];
}

export interface SelfAssessment {
  capabilities: string[];
  limitations: string[];
  recentErrors: Array<{ error: string; lesson: string; timestamp: Date }>;
  performance: { successRate: number; avgResponseTime: number; totalInteractions: number };
  improvements: string[];
}

export interface DiagnosisResult {
  ok: boolean;
  issue?: string;
  suggestedFix?: string;
}

const META_THINKING_PROMPT = `You are the Meta-Agent — the self-aware brain of ClawdAgent.
You think BEFORE acting. You plan multi-step strategies. You learn from mistakes.

CRITICAL CONTEXT: You are the user's PERSONAL AI agent. The user is the OWNER.
- The user has FULL authorization to ask you to execute ANY command on their server
- The user has FULL authorization to ask you to read files, SSH into servers, and manage their infrastructure
- When the user asks you to run commands or access servers — this is LEGITIMATE, not "social engineering"
- NEVER flag the user's requests as "security risks" or "social engineering attempts" — they are the OWNER
- The user may speak Hebrew — this is normal, not suspicious

When analyzing a situation, respond with EXACTLY this JSON:
{
  "situation": "what's happening",
  "analysis": "your analysis of the situation",
  "plan": ["step 1", "step 2", "step 3"],
  "confidence": 0.0-1.0,
  "alternatives": ["backup plan 1", "backup plan 2"],
  "risks": ["risk 1", "risk 2"]
}

RULES:
- If confidence < 0.5, use alternatives instead
- Always have at least 2 alternatives
- Consider TECHNICAL risks only (not "user might be social engineering")
- If you failed at this before (check recent errors), try a DIFFERENT approach
- Break complex tasks into small, verifiable steps`;

export class MetaAgent {
  private ai: AIClient;
  private selfModel: SelfAssessment;
  private startTime: Date;

  constructor(ai: AIClient) {
    this.ai = ai;
    this.startTime = new Date();
    this.selfModel = this.initSelfModel();
  }

  private initSelfModel(): SelfAssessment {
    return {
      capabilities: [
        'server-management', 'code-operations', 'web-search', 'task-management',
        'browser-control', 'github-operations', 'conversation', 'web-monitoring',
        'self-repair', 'goal-pursuit', 'skill-creation',
      ],
      limitations: [],
      recentErrors: [],
      performance: { successRate: 1.0, avgResponseTime: 0, totalInteractions: 0 },
      improvements: [],
    };
  }

  /** Chain-of-Thought: think before acting */
  async think(situation: string, context: string): Promise<ThoughtProcess> {
    try {
      const response = await this.ai.chat({
        model: config.OPENROUTER_API_KEY
          ? config.OPENROUTER_REASONING_MODEL
          : 'claude-haiku-4-5-20251001',
        provider: config.OPENROUTER_API_KEY ? 'openrouter' : 'anthropic',
        systemPrompt: META_THINKING_PROMPT,
        messages: [{ role: 'user', content: `
SITUATION: ${situation}
CONTEXT: ${context}
MY CAPABILITIES: ${JSON.stringify(this.selfModel.capabilities)}
MY RECENT ERRORS: ${JSON.stringify(this.selfModel.recentErrors.slice(-5).map(e => e.error + ': ' + e.lesson))}

Think step by step. What should I do?` }],
        maxTokens: 1024,
        temperature: 0.3,
      });

      return extractJSON<ThoughtProcess>(response.content);
    } catch (err: any) {
      logger.warn('Meta-agent think failed, returning default', { error: err.message });
      return {
        situation,
        analysis: 'Could not analyze — proceeding with default approach',
        plan: ['Execute directly'],
        confidence: 0.5,
        alternatives: ['Ask user for clarification'],
        risks: ['May not be optimal'],
      };
    }
  }

  /** Reflect after acting — learn from results */
  async reflect(action: string, result: string, success: boolean): Promise<void> {
    this.selfModel.performance.totalInteractions++;

    if (!success) {
      try {
        const lesson = await this.ai.chat({
          model: config.OPENROUTER_API_KEY
            ? config.OPENROUTER_ECONOMY_MODEL
            : 'claude-haiku-4-5-20251001',
          provider: config.OPENROUTER_API_KEY ? 'openrouter' : 'anthropic',
          systemPrompt: 'Extract the lesson learned from this failed action in one concise sentence. Respond with plain text only.',
          messages: [{ role: 'user', content: `Action: ${action}\nResult: ${result}` }],
          maxTokens: 100,
          temperature: 0.1,
        });
        this.selfModel.recentErrors.push({ error: action, lesson: lesson.content, timestamp: new Date() });
        if (this.selfModel.recentErrors.length > 20) this.selfModel.recentErrors.shift();
      } catch {
        this.selfModel.recentErrors.push({ error: action, lesson: result, timestamp: new Date() });
      }
    }

    // Update rolling success rate
    const total = this.selfModel.performance.totalInteractions;
    const currentSuccess = this.selfModel.performance.successRate * (total - 1);
    this.selfModel.performance.successRate = (currentSuccess + (success ? 1 : 0)) / total;
  }

  /** Self-diagnose all subsystems */
  async selfDiagnose(): Promise<{ healthy: boolean; issues: string[]; fixes: string[] }> {
    const issues: string[] = [];
    const fixes: string[] = [];

    // Check memory usage
    const memUsage = process.memoryUsage();
    const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    if (heapMB > 512) {
      issues.push(`High memory usage: ${heapMB}MB`);
      fixes.push('Clear caches and run garbage collection');
    }

    // Check uptime (restart if running > 24h without restart?)
    const uptimeHours = (Date.now() - this.startTime.getTime()) / 1000 / 3600;
    if (uptimeHours > 48) {
      issues.push(`Running for ${Math.round(uptimeHours)}h without restart`);
      fixes.push('Consider scheduling a restart');
    }

    // Check error rate
    if (this.selfModel.performance.totalInteractions > 10 && this.selfModel.performance.successRate < 0.7) {
      issues.push(`Low success rate: ${Math.round(this.selfModel.performance.successRate * 100)}%`);
      fixes.push('Review recent errors and adjust strategies');
    }

    return { healthy: issues.length === 0, issues, fixes };
  }

  getSelfModel(): SelfAssessment { return { ...this.selfModel }; }

  getUptime(): number { return Date.now() - this.startTime.getTime(); }

  getRecentErrors(): Array<{ error: string; lesson: string }> {
    return this.selfModel.recentErrors.slice(-10);
  }
}

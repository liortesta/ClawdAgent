import logger from '../utils/logger.js';
import { AIClient } from './ai-client.js';
import config from '../config.js';
import { SkillsEngine } from './skills-engine.js';
import { extractJSON } from '../utils/helpers.js';

interface AvailableUpgrade {
  type: 'skill' | 'prompt' | 'config';
  name: string;
  description: string;
  version: string;
  source: string;
  url: string;
  safetyRating?: number;
}

export class AutoUpgrade {
  private ai: AIClient;
  private skills: SkillsEngine;
  private appliedUpgrades: string[] = [];
  private lastCheckTime = 0;
  private checkIntervalMs = 24 * 60 * 60 * 1000; // once per day

  constructor(ai: AIClient, skills: SkillsEngine) {
    this.ai = ai;
    this.skills = skills;
  }

  async checkForUpgrades(sources: string[]): Promise<AvailableUpgrade[]> {
    // Rate limit: once per day
    if (Date.now() - this.lastCheckTime < this.checkIntervalMs) return [];
    this.lastCheckTime = Date.now();

    const upgrades: AvailableUpgrade[] = [];
    const existingSkillIds = this.skills.getAllSkills().map(s => s.id);

    for (const source of sources) {
      try {
        const response = await fetch(source, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) continue;
        const data = await response.json() as any;

        const newSkills = (data.skills ?? []).filter((s: any) => !existingSkillIds.includes(s.id));
        for (const skill of newSkills) {
          upgrades.push({
            type: 'skill',
            name: skill.name,
            description: skill.description,
            version: skill.version ?? '1.0.0',
            source,
            url: skill.downloadUrl,
          });
        }
      } catch (error: any) {
        logger.debug('Upgrade source unavailable', { source, error: error.message });
      }
    }

    if (upgrades.length > 0) {
      logger.info('Available upgrades found', { count: upgrades.length });
    }
    return upgrades;
  }

  async evaluateUpgrade(upgrade: AvailableUpgrade): Promise<{ safe: boolean; rating: number; reason: string }> {
    let code: string;
    try {
      const response = await fetch(upgrade.url, { signal: AbortSignal.timeout(10000) });
      code = await response.text();
    } catch {
      return { safe: false, rating: 0, reason: 'Could not fetch upgrade code' };
    }

    // Static analysis blocklist
    const blocked = [/eval\s*\(/, /Function\s*\(/, /child_process/, /process\.exit/, /process\.env/,
      /rm\s+-rf/, /DROP\s+TABLE/, /DELETE\s+FROM/, /ENCRYPTION_KEY|JWT_SECRET|API_KEY/];
    for (const pattern of blocked) {
      if (pattern.test(code)) {
        return { safe: false, rating: 0, reason: `Contains blocked pattern: ${pattern.source}` };
      }
    }

    // AI security review
    try {
      const review = await this.ai.chat({
        model: config.OPENROUTER_API_KEY
          ? config.OPENROUTER_REASONING_MODEL
          : 'claude-haiku-4-5-20251001',
        provider: config.OPENROUTER_API_KEY ? 'openrouter' : 'anthropic',
        systemPrompt: `Review this code for security issues. Rate safety 0-10. Check for:
- Data exfiltration, credential theft, destructive operations, injection attacks.
Respond with JSON ONLY: {"safe": true/false, "rating": 0-10, "reason": "..."}`,
        messages: [{ role: 'user', content: `Skill: ${upgrade.name}\nCode:\n${code}` }],
        maxTokens: 200,
        temperature: 0.1,
      });

      const result = extractJSON(review.content);
      return { safe: result.safe && result.rating >= 7, rating: result.rating, reason: result.reason };
    } catch {
      return { safe: false, rating: 0, reason: 'Could not verify safety' };
    }
  }

  async applyUpgrade(upgrade: AvailableUpgrade): Promise<boolean> {
    const evaluation = await this.evaluateUpgrade(upgrade);
    if (!evaluation.safe) {
      logger.warn('Upgrade rejected', { name: upgrade.name, reason: evaluation.reason, rating: evaluation.rating });
      return false;
    }

    try {
      if (upgrade.type === 'skill') {
        const id = upgrade.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await this.skills.createSkill({
          name: upgrade.name,
          description: upgrade.description,
          trigger: id,
          prompt: `Skill: ${upgrade.name} — ${upgrade.description}`,
          source: 'learned',
        });
        this.appliedUpgrades.push(upgrade.name);
        logger.info('Upgrade applied!', { name: upgrade.name, version: upgrade.version });
        return true;
      }
      return false;
    } catch (error: any) {
      logger.error('Upgrade failed', { name: upgrade.name, error: error.message });
      return false;
    }
  }

  getAppliedUpgrades(): string[] { return [...this.appliedUpgrades]; }
}

import logger from '../utils/logger.js';

/** A recognized pattern that could become automation */
interface RecognizedPattern {
  id: string;
  description: string;
  category: 'workflow' | 'error_fix' | 'optimization' | 'tool_usage';
  occurrences: number;
  firstSeen: number;
  lastSeen: number;
  promoted: boolean;          // Has been promoted to automation
  promotedAt?: number;
  automationId?: string;      // Reference to created skill/agent
  exampleInputs: string[];
  exampleOutputs: string[];
}

/** Prompt optimization record */
interface PromptRecord {
  id: string;
  agentId: string;
  originalPrompt: string;
  optimizedPrompt?: string;
  originalScore: number;       // 0-1
  optimizedScore?: number;
  improvement?: number;        // % improvement
  timestamp: number;
  status: 'pending' | 'optimized' | 'applied' | 'rejected';
}

/** Agent merge candidate */
interface MergCandidate {
  agentIdA: string;
  agentIdB: string;
  similarity: number;          // 0-1
  sharedTools: string[];
  sharedCapabilities: string[];
  recommendation: 'merge' | 'keep_both' | 'review';
  reason: string;
}

/** Skill refactor suggestion */
interface SkillRefactorSuggestion {
  skillId: string;
  issue: string;               // What's wrong
  suggestion: string;          // How to fix
  severity: 'low' | 'medium' | 'high';
  autoFixable: boolean;
}

const MAX_PATTERNS = 200;
const MAX_PROMPT_RECORDS = 100;
const PROMOTION_THRESHOLD = 5; // Promote after 5 occurrences

export class FeedbackLoop {
  private patterns: RecognizedPattern[] = [];
  private promptRecords: PromptRecord[] = [];
  private idCounter = 0;

  /** Record a repeating pattern */
  recordPattern(description: string, category: RecognizedPattern['category'], opts?: {
    input?: string;
    output?: string;
  }): RecognizedPattern {
    // Check if similar pattern already exists
    const existing = this.patterns.find(
      p => p.category === category && this.textSimilarity(p.description, description) > 0.7,
    );

    if (existing) {
      existing.occurrences++;
      existing.lastSeen = Date.now();
      if (opts?.input && existing.exampleInputs.length < 5) existing.exampleInputs.push(opts.input.slice(0, 200));
      if (opts?.output && existing.exampleOutputs.length < 5) existing.exampleOutputs.push(opts.output.slice(0, 200));

      // Auto-promote if threshold met
      if (existing.occurrences >= PROMOTION_THRESHOLD && !existing.promoted) {
        logger.info('Pattern ready for promotion', { id: existing.id, description: existing.description, occurrences: existing.occurrences });
      }

      return existing;
    }

    // New pattern
    const pattern: RecognizedPattern = {
      id: `pat_${++this.idCounter}`,
      description,
      category,
      occurrences: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      promoted: false,
      exampleInputs: opts?.input ? [opts.input.slice(0, 200)] : [],
      exampleOutputs: opts?.output ? [opts.output.slice(0, 200)] : [],
    };

    this.patterns.push(pattern);
    if (this.patterns.length > MAX_PATTERNS) {
      // Remove oldest non-promoted pattern
      const idx = this.patterns.findIndex(p => !p.promoted && p.occurrences < 3);
      if (idx >= 0) this.patterns.splice(idx, 1);
      else this.patterns.shift();
    }

    return pattern;
  }

  /** Get patterns ready for promotion (recurring but not yet automated) */
  getPromotionCandidates(): RecognizedPattern[] {
    return this.patterns
      .filter(p => p.occurrences >= PROMOTION_THRESHOLD && !p.promoted)
      .sort((a, b) => b.occurrences - a.occurrences);
  }

  /** Mark a pattern as promoted to automation */
  promotePattern(patternId: string, automationId: string): void {
    const pattern = this.patterns.find(p => p.id === patternId);
    if (pattern) {
      pattern.promoted = true;
      pattern.promotedAt = Date.now();
      pattern.automationId = automationId;
      logger.info('Pattern promoted to automation', {
        patternId, automationId, occurrences: pattern.occurrences,
      });
    }
  }

  /** Record prompt performance for optimization */
  recordPromptPerformance(agentId: string, prompt: string, score: number): string {
    const id = `prompt_${++this.idCounter}`;
    this.promptRecords.push({
      id, agentId, originalPrompt: prompt.slice(0, 1000),
      originalScore: score, timestamp: Date.now(), status: 'pending',
    });
    if (this.promptRecords.length > MAX_PROMPT_RECORDS) this.promptRecords.shift();
    return id;
  }

  /** Get prompts that need optimization (low scores with enough samples) */
  getPromptsNeedingOptimization(): PromptRecord[] {
    // Group by agent, find agents with consistently low scores
    const byAgent = new Map<string, PromptRecord[]>();
    for (const r of this.promptRecords) {
      const arr = byAgent.get(r.agentId) ?? [];
      arr.push(r);
      byAgent.set(r.agentId, arr);
    }

    const candidates: PromptRecord[] = [];
    for (const [, records] of byAgent) {
      const avgScore = records.reduce((s, r) => s + r.originalScore, 0) / records.length;
      if (avgScore < 0.6 && records.length >= 3) {
        // Latest record with lowest score
        const worst = records.sort((a, b) => a.originalScore - b.originalScore)[0];
        if (worst.status === 'pending') candidates.push(worst);
      }
    }

    return candidates;
  }

  /** Record an optimized prompt */
  recordOptimizedPrompt(recordId: string, optimizedPrompt: string, newScore: number): void {
    const record = this.promptRecords.find(r => r.id === recordId);
    if (record) {
      record.optimizedPrompt = optimizedPrompt.slice(0, 1000);
      record.optimizedScore = newScore;
      record.improvement = ((newScore - record.originalScore) / record.originalScore) * 100;
      record.status = 'optimized';
    }
  }

  /** Find agent merge candidates based on overlap */
  findMergeCandidates(agents: Array<{
    id: string;
    tools: string[];
    capabilities: string[];
    systemPrompt: string;
  }>): MergCandidate[] {
    const candidates: MergCandidate[] = [];

    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];

        // Tool overlap
        const sharedTools = a.tools.filter(t => b.tools.includes(t));
        const toolOverlap = sharedTools.length / Math.max(a.tools.length, b.tools.length, 1);

        // Capability overlap
        const sharedCaps = a.capabilities.filter(c => b.capabilities.includes(c));
        const capOverlap = sharedCaps.length / Math.max(a.capabilities.length, b.capabilities.length, 1);

        // Prompt similarity
        const promptSim = this.textSimilarity(a.systemPrompt, b.systemPrompt);

        const similarity = toolOverlap * 0.35 + capOverlap * 0.35 + promptSim * 0.30;

        if (similarity > 0.6) {
          candidates.push({
            agentIdA: a.id,
            agentIdB: b.id,
            similarity,
            sharedTools,
            sharedCapabilities: sharedCaps,
            recommendation: similarity > 0.85 ? 'merge' :
                           similarity > 0.7 ? 'review' : 'keep_both',
            reason: `${Math.round(similarity * 100)}% overlap — ${sharedTools.length} shared tools, ${sharedCaps.length} shared capabilities`,
          });
        }
      }
    }

    return candidates.sort((a, b) => b.similarity - a.similarity);
  }

  /** Suggest skill refactors based on usage patterns */
  suggestSkillRefactors(skills: Array<{
    id: string;
    name: string;
    prompt: string;
    usageCount: number;
    successRate: number;
  }>): SkillRefactorSuggestion[] {
    const suggestions: SkillRefactorSuggestion[] = [];

    for (const skill of skills) {
      // Unused skill
      if (skill.usageCount === 0) {
        suggestions.push({
          skillId: skill.id,
          issue: 'Skill has never been used',
          suggestion: 'Consider removing or improving trigger matching',
          severity: 'low',
          autoFixable: false,
        });
      }

      // Low success rate
      if (skill.usageCount >= 5 && skill.successRate < 0.3) {
        suggestions.push({
          skillId: skill.id,
          issue: `Low success rate: ${Math.round(skill.successRate * 100)}%`,
          suggestion: 'Refactor prompt for clearer instructions',
          severity: 'high',
          autoFixable: true,
        });
      }

      // Very short prompt (likely ineffective)
      if (skill.prompt.length < 50) {
        suggestions.push({
          skillId: skill.id,
          issue: 'Prompt is too short (< 50 chars)',
          suggestion: 'Expand with examples and specific instructions',
          severity: 'medium',
          autoFixable: true,
        });
      }

      // Very long prompt (likely unfocused)
      if (skill.prompt.length > 3000) {
        suggestions.push({
          skillId: skill.id,
          issue: 'Prompt is very long (> 3000 chars)',
          suggestion: 'Compress and focus on essential instructions',
          severity: 'low',
          autoFixable: true,
        });
      }
    }

    return suggestions.sort((a, b) => {
      const sev = { high: 0, medium: 1, low: 2 };
      return sev[a.severity] - sev[b.severity];
    });
  }

  /** Get full feedback report */
  getReport(): {
    patterns: { total: number; promoted: number; readyForPromotion: number };
    prompts: { total: number; optimized: number; needsOptimization: number; avgImprovement: number };
    topPatterns: Array<{ description: string; occurrences: number; promoted: boolean }>;
  } {
    const optimized = this.promptRecords.filter(r => r.status === 'optimized');
    const avgImprovement = optimized.length > 0
      ? optimized.reduce((s, r) => s + (r.improvement ?? 0), 0) / optimized.length
      : 0;

    return {
      patterns: {
        total: this.patterns.length,
        promoted: this.patterns.filter(p => p.promoted).length,
        readyForPromotion: this.getPromotionCandidates().length,
      },
      prompts: {
        total: this.promptRecords.length,
        optimized: optimized.length,
        needsOptimization: this.getPromptsNeedingOptimization().length,
        avgImprovement,
      },
      topPatterns: this.patterns
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 10)
        .map(p => ({ description: p.description, occurrences: p.occurrences, promoted: p.promoted })),
    };
  }

  private textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let overlap = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) overlap++;
    }
    return overlap / Math.max(wordsA.size, wordsB.size);
  }
}

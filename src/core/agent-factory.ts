import { AgentDefinition } from '../agents/types.js';
import { registerAgent, unregisterAgent, getAgent, getAllAgents, hasAgent } from '../agents/registry.js';
import { AIClient } from './ai-client.js';
import { SkillsEngine } from './skills-engine.js';
import { extractJSON } from '../utils/helpers.js';
import logger from '../utils/logger.js';

const MAX_DYNAMIC_AGENTS = 5;
const AGENT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface DynamicAgentMeta {
  id: string;
  createdAt: number;
  lastUsedAt: number;
  source: 'need' | 'skill' | 'template' | 'capability';
}

export class AgentFactory {
  private ai: AIClient;
  private skills: SkillsEngine;
  private dynamicAgents: Map<string, DynamicAgentMeta> = new Map();

  constructor(ai: AIClient, skills: SkillsEngine) {
    this.ai = ai;
    this.skills = skills;
  }

  /** Create an agent by analyzing what the task needs */
  async createFromNeed(taskDescription: string): Promise<AgentDefinition | null> {
    // Check if an existing agent already fits
    const existing = getAllAgents();
    const existingNames = existing.map(a => `${a.id}: ${a.description}`).join('\n');

    try {
      const response = await this.ai.chat({
        systemPrompt: `You are an agent architect. Given a task, decide if an existing agent fits or if a new one is needed.
Existing agents:\n${existingNames}

If an existing agent fits, respond: {"existing": true, "agentId": "<id>"}
If a new agent is needed, respond:
{"existing": false, "id": "<kebab-case-id>", "name": "<Agent Name>", "description": "<what it does>", "tools": [<tool names from: bash, search, file, github, browser, kie, social, openclaw, ssh, memory, email, trading, device, rag>], "systemPrompt": "<detailed instructions for the agent>", "temperature": 0.3}
Respond with ONLY valid JSON.`,
        messages: [{ role: 'user', content: `Task: ${taskDescription}` }],
        maxTokens: 800, temperature: 0.3,
      });

      const plan = extractJSON<{
        existing: boolean;
        agentId?: string;
        id?: string;
        name?: string;
        description?: string;
        tools?: string[];
        systemPrompt?: string;
        temperature?: number;
      }>(response.content);

      if (plan.existing && plan.agentId) {
        return getAgent(plan.agentId) ?? null;
      }

      if (!plan.id || !plan.name || !plan.systemPrompt) return null;

      // Enforce limits — evict LRU if needed
      this.enforceLimits();

      const agent: AgentDefinition = {
        id: `dyn-${plan.id}`,
        name: plan.name,
        description: plan.description ?? taskDescription,
        systemPrompt: plan.systemPrompt,
        model: 'dynamic',
        tools: plan.tools ?? ['bash', 'search', 'memory'],
        maxTokens: 4096,
        temperature: plan.temperature ?? 0.3,
        maxToolIterations: 15,
      };

      registerAgent(agent);
      this.dynamicAgents.set(agent.id, {
        id: agent.id,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        source: 'need',
      });

      logger.info('Dynamic agent created from need', { id: agent.id, name: agent.name, tools: agent.tools });
      return agent;
    } catch (err: any) {
      logger.warn('Failed to create agent from need', { error: err.message });
      return null;
    }
  }

  /** Create a specialized agent around an existing skill */
  createFromSkill(skillId: string): AgentDefinition | null {
    const skill = this.skills.getSkill(skillId);
    if (!skill) return null;

    const agentId = `dyn-skill-${skillId}`;
    if (hasAgent(agentId)) {
      this.touchAgent(agentId);
      return getAgent(agentId)!;
    }

    this.enforceLimits();

    const agent: AgentDefinition = {
      id: agentId,
      name: `${skill.name} Specialist`,
      description: `Specialized agent for: ${skill.description}`,
      systemPrompt: `You are a specialist agent for the "${skill.name}" skill.\n\n${skill.prompt}\n\nAlways apply this skill's expertise when responding. Be thorough and precise.`,
      model: 'dynamic',
      tools: ['bash', 'search', 'memory'],
      maxTokens: 4096,
      temperature: 0.5,
      maxToolIterations: 10,
    };

    registerAgent(agent);
    this.dynamicAgents.set(agent.id, {
      id: agent.id, createdAt: Date.now(), lastUsedAt: Date.now(), source: 'skill',
    });

    logger.info('Dynamic agent created from skill', { id: agent.id, skill: skillId });
    return agent;
  }

  /** Clone an existing agent with overrides */
  createFromTemplate(baseAgentId: string, overrides: Partial<AgentDefinition>): AgentDefinition | null {
    const base = getAgent(baseAgentId);
    if (!base) return null;

    const newId = overrides.id ?? `dyn-${baseAgentId}-${Date.now().toString(36)}`;
    if (hasAgent(newId)) return getAgent(newId)!;

    this.enforceLimits();

    const agent: AgentDefinition = {
      ...base,
      ...overrides,
      id: newId,
    };

    registerAgent(agent);
    this.dynamicAgents.set(agent.id, {
      id: agent.id, createdAt: Date.now(), lastUsedAt: Date.now(), source: 'template',
    });

    logger.info('Dynamic agent created from template', { id: agent.id, base: baseAgentId });
    return agent;
  }

  /** Create an agent from discovered capabilities */
  createFromCapabilities(id: string, name: string, capabilities: string[], tools: string[]): AgentDefinition {
    const agentId = `dyn-cap-${id}`;
    if (hasAgent(agentId)) {
      this.touchAgent(agentId);
      return getAgent(agentId)!;
    }

    this.enforceLimits();

    const agent: AgentDefinition = {
      id: agentId,
      name,
      description: `Auto-created agent with capabilities: ${capabilities.join(', ')}`,
      systemPrompt: `You are a specialized agent with the following capabilities:\n${capabilities.map(c => `- ${c}`).join('\n')}\n\nUse these capabilities to help the user. Be proactive and thorough.`,
      model: 'dynamic',
      tools,
      maxTokens: 4096,
      temperature: 0.3,
      maxToolIterations: 15,
    };

    registerAgent(agent);
    this.dynamicAgents.set(agent.id, {
      id: agent.id, createdAt: Date.now(), lastUsedAt: Date.now(), source: 'capability',
    });

    logger.info('Dynamic agent created from capabilities', { id: agent.id, capabilities });
    return agent;
  }

  /** Mark an agent as recently used */
  touchAgent(agentId: string): void {
    const meta = this.dynamicAgents.get(agentId);
    if (meta) meta.lastUsedAt = Date.now();
  }

  /** Remove expired dynamic agents and enforce limit */
  private enforceLimits(): void {
    // Remove expired agents (>24h unused)
    const now = Date.now();
    for (const [id, meta] of this.dynamicAgents) {
      if (now - meta.lastUsedAt > AGENT_TTL_MS) {
        unregisterAgent(id);
        this.dynamicAgents.delete(id);
        logger.info('Dynamic agent expired', { id });
      }
    }

    // Evict LRU if still over limit
    while (this.dynamicAgents.size >= MAX_DYNAMIC_AGENTS) {
      let oldest: DynamicAgentMeta | null = null;
      for (const meta of this.dynamicAgents.values()) {
        if (!oldest || meta.lastUsedAt < oldest.lastUsedAt) oldest = meta;
      }
      if (oldest) {
        unregisterAgent(oldest.id);
        this.dynamicAgents.delete(oldest.id);
        logger.info('Dynamic agent evicted (LRU)', { id: oldest.id });
      } else break;
    }
  }

  /** Get all dynamic agent IDs */
  getDynamicAgentIds(): string[] {
    return Array.from(this.dynamicAgents.keys());
  }

  /** Get count of dynamic agents */
  getDynamicAgentCount(): number {
    return this.dynamicAgents.size;
  }
}

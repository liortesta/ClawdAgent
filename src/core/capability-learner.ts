import { AIClient } from './ai-client.js';
import { SkillsEngine } from './skills-engine.js';
import { AgentFactory } from './agent-factory.js';
import { extractJSON } from '../utils/helpers.js';
import logger from '../utils/logger.js';

interface DiscoveredCapability {
  name: string;
  type: 'service' | 'tool' | 'runtime' | 'database' | 'framework';
  version?: string;
  details?: string;
}

interface ServerProfile {
  serverId: string;
  capabilities: DiscoveredCapability[];
  lastScanned: number;
}

export class CapabilityLearner {
  private ai: AIClient;
  private skills: SkillsEngine;
  private factory: AgentFactory;
  private serverProfiles: Map<string, ServerProfile> = new Map();

  constructor(ai: AIClient, skills: SkillsEngine, factory: AgentFactory) {
    this.ai = ai;
    this.skills = skills;
    this.factory = factory;
  }

  /** Learn capabilities from SSH scan output */
  async learnFromSSHScan(serverId: string, scanOutput: string): Promise<DiscoveredCapability[]> {
    try {
      const response = await this.ai.chat({
        systemPrompt: `Analyze this server scan output and extract capabilities.
Return JSON array: [{"name": "docker", "type": "service|tool|runtime|database|framework", "version": "24.0", "details": "Docker engine running"}]
Only include software/services that are actually INSTALLED and RUNNING. Be precise.`,
        messages: [{ role: 'user', content: `Server: ${serverId}\nScan output:\n${scanOutput.slice(0, 4000)}` }],
        maxTokens: 500, temperature: 0,
      });

      const capabilities = extractJSON<DiscoveredCapability[]>(response.content);
      if (!Array.isArray(capabilities)) return [];

      // Store profile
      this.serverProfiles.set(serverId, {
        serverId, capabilities, lastScanned: Date.now(),
      });

      // Create skills for capability clusters
      await this.createSkillsForCapabilities(serverId, capabilities);

      logger.info('Learned server capabilities', { serverId, count: capabilities.length });
      return capabilities;
    } catch (err: any) {
      logger.warn('Failed to learn from SSH scan', { serverId, error: err.message });
      return [];
    }
  }

  /** Learn capabilities from MCP server tool definitions */
  async learnFromMCPServer(serverName: string, tools: Array<{ name: string; description: string }>): Promise<DiscoveredCapability[]> {
    const capabilities: DiscoveredCapability[] = tools.map(t => ({
      name: t.name,
      type: 'tool' as const,
      details: t.description,
    }));

    // Group tools into logical skills
    if (capabilities.length >= 2) {
      try {
        const response = await this.ai.chat({
          systemPrompt: `Group these MCP tools into logical skill categories.
Return JSON: [{"skillName": "<name>", "description": "<what this group does>", "trigger": "<regex pattern>", "tools": ["tool1", "tool2"]}]`,
          messages: [{
            role: 'user',
            content: `MCP Server: ${serverName}\nTools:\n${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}`,
          }],
          maxTokens: 500, temperature: 0.2,
        });

        const groups = extractJSON<Array<{ skillName: string; description: string; trigger: string; tools: string[] }>>(response.content);
        if (Array.isArray(groups)) {
          for (const group of groups) {
            const skillId = `mcp-${serverName}-${group.skillName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            if (!this.skills.getSkill(skillId)) {
              await this.skills.createSkill({
                name: `${group.skillName} (${serverName})`,
                description: group.description,
                trigger: group.trigger || skillId,
                prompt: `Use the ${serverName} MCP server tools: ${group.tools.join(', ')}.\n${group.description}`,
                source: 'learned',
              });
            }
          }
        }
      } catch {
        // Non-critical: skill grouping failed
      }
    }

    logger.info('Learned MCP capabilities', { serverName, count: capabilities.length });
    return capabilities;
  }

  /** Suggest or create an agent for a set of capabilities */
  suggestAgentForCapabilities(capabilities: DiscoveredCapability[]): string | null {
    if (capabilities.length === 0) return null;

    // Map capability types to tool names
    const toolMap: Record<string, string[]> = {
      docker: ['bash', 'ssh'],
      nginx: ['bash', 'ssh'],
      postgres: ['bash', 'ssh', 'db'],
      mysql: ['bash', 'ssh', 'db'],
      redis: ['bash', 'ssh'],
      nodejs: ['bash', 'ssh', 'file'],
      python: ['bash', 'ssh', 'file'],
      git: ['bash', 'ssh', 'github'],
    };

    const tools = new Set<string>(['bash', 'memory']);
    const capNames: string[] = [];

    for (const cap of capabilities) {
      capNames.push(cap.name);
      const mapped = toolMap[cap.name.toLowerCase()];
      if (mapped) mapped.forEach(t => tools.add(t));
    }

    // Create a specialized agent
    const agent = this.factory.createFromCapabilities(
      capNames.slice(0, 3).join('-').toLowerCase(),
      `${capNames.slice(0, 3).join(' + ')} Expert`,
      capNames,
      Array.from(tools),
    );

    return agent.id;
  }

  /** Create skills from discovered capabilities on a server */
  private async createSkillsForCapabilities(serverId: string, capabilities: DiscoveredCapability[]): Promise<void> {
    // Group capabilities by type
    const services = capabilities.filter(c => c.type === 'service');
    const databases = capabilities.filter(c => c.type === 'database');

    // Create management skill for services
    if (services.length > 0) {
      const skillId = `server-${serverId}-services`;
      if (!this.skills.getSkill(skillId)) {
        await this.skills.createSkill({
          name: `${serverId} Services`,
          description: `Manage services on ${serverId}: ${services.map(s => s.name).join(', ')}`,
          trigger: `(${services.map(s => s.name).join('|')}).*${serverId}|${serverId}.*(${services.map(s => s.name).join('|')})`,
          prompt: `Server ${serverId} has these services: ${services.map(s => `${s.name} ${s.version ?? ''}`).join(', ')}. Use SSH to manage them.`,
          source: 'learned',
        });
      }
    }

    // Create query skill for databases
    if (databases.length > 0) {
      const skillId = `server-${serverId}-databases`;
      if (!this.skills.getSkill(skillId)) {
        await this.skills.createSkill({
          name: `${serverId} Databases`,
          description: `Query databases on ${serverId}: ${databases.map(d => d.name).join(', ')}`,
          trigger: `(database|db|query|sql).*(${serverId})`,
          prompt: `Server ${serverId} has databases: ${databases.map(d => `${d.name} ${d.version ?? ''}`).join(', ')}. Use SSH to connect and query.`,
          source: 'learned',
        });
      }
    }
  }

  /** Get profile for a server */
  getServerProfile(serverId: string): ServerProfile | undefined {
    return this.serverProfiles.get(serverId);
  }

  /** Get all known server profiles */
  getAllProfiles(): ServerProfile[] {
    return Array.from(this.serverProfiles.values());
  }
}

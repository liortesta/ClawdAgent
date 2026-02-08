import { ClaudeClient } from './claude-client.js';
import { getAgent, getAllAgents, type AgentDefinition } from '../agents/registry.js';
import logger from '../utils/logger.js';
import { extractJSON } from '../utils/helpers.js';

export class Orchestrator {
  private claude: ClaudeClient;

  constructor(claude: ClaudeClient) {
    this.claude = claude;
  }

  selectAgent(agentId: string): AgentDefinition {
    const agent = getAgent(agentId);
    if (!agent) {
      logger.warn(`Agent ${agentId} not found, falling back to general`);
      return getAgent('general')!;
    }
    return agent;
  }

  async executeWithSecurityReview(
    agentId: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<{ approved: boolean; reason?: string }> {
    const guard = getAgent('security-guard');
    if (!guard) return { approved: true };

    const response = await this.claude.chat({
      systemPrompt: guard.systemPrompt,
      messages: [{ role: 'user', content: `Review this action:\nAgent: ${agentId}\nAction: ${action}\nParams: ${JSON.stringify(params)}` }],
      maxTokens: guard.maxTokens,
      temperature: guard.temperature,
    });

    try {
      const review = extractJSON(response.content);
      if (review.decision === 'block') {
        logger.warn('Action blocked by security guard', { agentId, action, reason: review.reason });
        return { approved: false, reason: review.reason };
      }
      return { approved: true, reason: review.decision === 'caution' ? review.reason : undefined };
    } catch {
      return { approved: true };
    }
  }

  getAvailableAgents(): Array<{ id: string; name: string; description: string }> {
    return getAllAgents().map(a => ({ id: a.id, name: a.name, description: a.description }));
  }
}

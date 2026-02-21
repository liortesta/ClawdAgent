/**
 * A2A Agent Card Generator
 * Builds the public Agent Card from ClawdAgent's registered agents, tools, and skills.
 * @see https://a2a-protocol.org
 */

import { getAllAgents } from '../../agents/registry.js';
import type { AgentCard, AgentSkill } from './types.js';

/** Map ClawdAgent's internal agents to A2A skills */
function buildSkillsFromAgents(): AgentSkill[] {
  return getAllAgents().map(agent => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    tags: agent.tools ?? [],
    examples: getExamplesForAgent(agent.id),
  }));
}

/** Example prompts for each agent (helps remote agents understand capabilities) */
function getExamplesForAgent(agentId: string): string[] {
  const examples: Record<string, string[]> = {
    'server-manager': [
      'Check disk usage on all servers',
      'Restart nginx on VPS1',
      'Run docker ps on production server',
    ],
    'code-assistant': [
      'Write a REST API endpoint for user registration',
      'Fix the bug in auth.ts line 42',
      'Create a GitHub PR with my changes',
    ],
    'researcher': [
      'Find the latest news about AI agents',
      'Summarize this article: [url]',
      'Compare React vs Vue for a new project',
    ],
    'task-planner': [
      'Remind me to deploy at 3pm',
      'Create a daily backup task',
      'Schedule a weekly report every Monday',
    ],
    'general': [
      'What time is it?',
      'Help me draft an email',
      'Translate this to Spanish',
    ],
    'web-agent': [
      'Sign up on example.com with my details',
      'Scrape product prices from a website',
      'Fill out this form automatically',
    ],
    'content-creator': [
      'Generate an AI video about cooking',
      'Create a thumbnail for my YouTube video',
      'Post this content to Twitter and Instagram',
    ],
    'crypto-trader': [
      'Buy 0.1 BTC at market price',
      'Show my current portfolio',
      'Set a stop-loss at $95,000 for BTC',
    ],
    'crypto-analyst': [
      'Analyze BTC/USDT 4h chart',
      'What are the top trending coins?',
      'Generate trading signals for ETH',
    ],
    'ai-app-builder': [
      'Build a SaaS landing page with Stripe payments',
      'Create a full-stack app from this spec',
      'Deploy my app to production',
    ],
  };
  return examples[agentId] ?? [];
}

/** Build the full A2A Agent Card for this ClawdAgent instance */
export function buildAgentCard(baseUrl: string): AgentCard {
  const skills = buildSkillsFromAgents();

  return {
    name: 'ClawdAgent',
    description:
      'Autonomous AI agent system with 18 specialized agents, 29 tools, and 74 skills. ' +
      'Manages servers, writes code, creates content, trades crypto, automates browsers, ' +
      'and evolves its own capabilities. Runs 24/7 across Telegram, Discord, WhatsApp, and Web.',
    url: baseUrl,
    version: '6.0.0',
    protocolVersion: '0.2.1',
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills,
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT Bearer token — obtain via POST /api/auth/login',
      },
      apiKey: {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
        description: 'API key for agent-to-agent communication',
      },
    },
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    provider: {
      organization: 'ClawdAgent',
      url: 'https://github.com/liorbs/clawdagent',
    },
    documentationUrl: 'https://github.com/liorbs/clawdagent#readme',
    supportsAuthenticatedExtendedCard: false,
  };
}

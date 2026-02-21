/**
 * ACP (Agent Communication Protocol) Type Definitions
 * Lightweight REST-based agent messaging protocol by IBM BeeAI / Linux Foundation.
 * @see https://agentcommunicationprotocol.dev
 */

// ─── Agent Descriptor ───────────────────────────────────────────────────────

/** ACP agent metadata descriptor */
export interface ACPAgentDescriptor {
  name: string;
  description: string;
  version: string;
  capabilities: string[];
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ─── Messages ───────────────────────────────────────────────────────────────

/** ACP message format */
export interface ACPMessage {
  role: 'user' | 'assistant';
  content: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
}

// ─── Runs ───────────────────────────────────────────────────────────────────

/** Run states in ACP */
export type ACPRunState =
  | 'created'
  | 'in-progress'
  | 'awaiting-input'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** ACP run object (equivalent to A2A Task) */
export interface ACPRun {
  id: string;
  agentId: string;
  state: ACPRunState;
  input: ACPMessage[];
  output: ACPMessage[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

/** ACP error response */
export interface ACPError {
  error: string;
  message: string;
  statusCode: number;
}

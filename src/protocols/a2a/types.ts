/**
 * A2A Protocol Type Definitions
 * Based on the Agent-to-Agent (A2A) Protocol specification by Google/Linux Foundation.
 * @see https://a2a-protocol.org
 */

// ─── Agent Card ─────────────────────────────────────────────────────────────

/** Describes a skill/capability that the agent offers */
export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
}

/** OAuth2 flow configuration */
export interface OAuthFlows {
  authorizationCode?: {
    authorizationUrl: string;
    tokenUrl: string;
    scopes: Record<string, string>;
  };
  clientCredentials?: {
    tokenUrl: string;
    scopes: Record<string, string>;
  };
}

/** Security scheme for authenticating with the agent */
export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect' | 'mutualTls';
  description?: string;
  // apiKey
  name?: string;
  in?: 'header' | 'query' | 'cookie';
  // http
  scheme?: string;
  bearerFormat?: string;
  // oauth2
  flows?: OAuthFlows;
  // openIdConnect
  openIdConnectUrl?: string;
}

/** Agent capabilities */
export interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
}

/** The Agent Card — public metadata about an A2A-compatible agent */
export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  protocolVersion: string;
  capabilities: AgentCapabilities;
  skills: AgentSkill[];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  securitySchemes?: Record<string, SecurityScheme>;
  security?: Array<Record<string, string[]>>;
  provider?: {
    organization: string;
    url?: string;
  };
  documentationUrl?: string;
  supportsAuthenticatedExtendedCard?: boolean;
}

// ─── Messages & Parts ───────────────────────────────────────────────────────

/** Text part of a message */
export interface TextPart {
  type: 'text';
  text: string;
  metadata?: Record<string, unknown>;
}

/** File part (inline bytes or URI reference) */
export interface FilePart {
  type: 'file';
  file: {
    name?: string;
    mimeType?: string;
    bytes?: string; // base64
    uri?: string;
  };
  metadata?: Record<string, unknown>;
}

/** Structured data part */
export interface DataPart {
  type: 'data';
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type Part = TextPart | FilePart | DataPart;

/** A message exchanged between user and agent */
export interface A2AMessage {
  role: 'user' | 'agent';
  parts: Part[];
  metadata?: Record<string, unknown>;
}

/** An artifact produced by the agent during task execution */
export interface Artifact {
  name?: string;
  description?: string;
  parts: Part[];
  index: number;
  append?: boolean;
  lastChunk?: boolean;
  metadata?: Record<string, unknown>;
}

// ─── Task Lifecycle ─────────────────────────────────────────────────────────

/** All valid task states */
export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected'
  | 'auth-required'
  | 'unknown';

/** Task status with optional message */
export interface TaskStatus {
  state: TaskState;
  message?: A2AMessage;
  timestamp: string;
}

/** The Task object — central unit of work in A2A */
export interface A2ATask {
  id: string;
  contextId?: string;
  status: TaskStatus;
  history?: TaskStatus[];
  artifacts?: Artifact[];
  metadata?: Record<string, unknown>;
}

// ─── JSON-RPC 2.0 ──────────────────────────────────────────────────────────

/** JSON-RPC 2.0 request */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 success response */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

/** JSON-RPC 2.0 error */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// ─── Method Params ──────────────────────────────────────────────────────────

/** Params for tasks/send and tasks/sendSubscribe */
export interface SendMessageParams {
  message: A2AMessage;
  configuration?: TaskSendConfiguration;
  metadata?: Record<string, unknown>;
}

/** Configuration for task creation */
export interface TaskSendConfiguration {
  acceptedOutputModes?: string[];
  blocking?: boolean;
  historyLength?: number;
  pushNotificationConfig?: PushNotificationConfig;
}

/** Params for tasks/get */
export interface GetTaskParams {
  id: string;
  historyLength?: number;
}

/** Params for tasks/cancel */
export interface CancelTaskParams {
  id: string;
}

/** Push notification configuration */
export interface PushNotificationConfig {
  url: string;
  token?: string;
  authentication?: {
    schemes: string[];
    credentials?: string;
  };
}

// ─── SSE Events ─────────────────────────────────────────────────────────────

/** SSE event types for streaming */
export type TaskEvent =
  | { type: 'status'; taskId: string; status: TaskStatus; final: boolean }
  | { type: 'artifact'; taskId: string; artifact: Artifact }
  | { type: 'error'; taskId: string; error: JsonRpcError };

// ─── Error Codes ────────────────────────────────────────────────────────────

export const A2A_ERRORS = {
  TASK_NOT_FOUND: { code: -32001, message: 'Task not found' },
  TASK_NOT_CANCELABLE: { code: -32002, message: 'Task cannot be canceled' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
  PARSE_ERROR: { code: -32700, message: 'Parse error' },
  PUSH_NOT_SUPPORTED: { code: -32003, message: 'Push notifications not supported' },
  CONTENT_TYPE_NOT_SUPPORTED: { code: -32004, message: 'Content type not supported' },
  UNAUTHORIZED: { code: -32005, message: 'Unauthorized' },
} as const;

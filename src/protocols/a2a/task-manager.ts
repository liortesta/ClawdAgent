/**
 * A2A Task Manager
 * Manages the full task lifecycle: create, get, cancel, subscribe (SSE).
 * Tasks map to ClawdAgent's Engine.processMessage() pipeline.
 * @see https://a2a-protocol.org
 */

import { randomUUID } from 'crypto';
import type {
  A2ATask, A2AMessage, TaskState, TaskStatus, Artifact,
  SendMessageParams, GetTaskParams, CancelTaskParams,
  JsonRpcRequest, JsonRpcResponse, TaskEvent,
} from './types.js';
import { A2A_ERRORS } from './types.js';
import type { Engine } from '../../core/engine.js';
import logger from '../../utils/logger.js';

/** In-memory task store (production: swap for Redis/PostgreSQL) */
const tasks = new Map<string, A2ATask>();

/** Active SSE subscribers per task */
const subscribers = new Map<string, Set<(event: TaskEvent) => void>>();

/** Abort controllers for cancellation */
const abortControllers = new Map<string, AbortController>();

/** Maximum tasks to keep in memory */
const MAX_TASKS = 1000;

/** Evict oldest completed tasks when limit reached */
function evictOldTasks(): void {
  if (tasks.size < MAX_TASKS) return;
  const completed = [...tasks.entries()]
    .filter(([, t]) => ['completed', 'failed', 'canceled', 'rejected'].includes(t.status.state))
    .sort((a, b) => new Date(a[1].status.timestamp).getTime() - new Date(b[1].status.timestamp).getTime());
  for (const [id] of completed.slice(0, Math.floor(MAX_TASKS / 4))) {
    tasks.delete(id);
    subscribers.delete(id);
    abortControllers.delete(id);
  }
}

/** Create a new task status */
function makeStatus(state: TaskState, message?: A2AMessage): TaskStatus {
  return { state, message, timestamp: new Date().toISOString() };
}

/** Emit event to all subscribers of a task */
function emit(taskId: string, event: TaskEvent): void {
  const subs = subscribers.get(taskId);
  if (!subs) return;
  for (const fn of subs) {
    try { fn(event); } catch { /* subscriber gone */ }
  }
}

/** Update task state and notify subscribers */
function transitionTask(taskId: string, state: TaskState, message?: A2AMessage, final = false): void {
  const task = tasks.get(taskId);
  if (!task) return;
  const status = makeStatus(state, message);
  // Keep history
  if (!task.history) task.history = [];
  task.history.push(task.status);
  task.status = status;
  emit(taskId, { type: 'status', taskId, status, final });
}

/** Add artifact to task and notify subscribers */
export function addArtifact(taskId: string, artifact: Artifact): void {
  const task = tasks.get(taskId);
  if (!task) return;
  if (!task.artifacts) task.artifacts = [];
  task.artifacts.push(artifact);
  emit(taskId, { type: 'artifact', taskId, artifact });
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send a message — creates or continues a task.
 * Maps to ClawdAgent's Engine.processMessage().
 */
export async function sendMessage(
  params: SendMessageParams,
  engine: Engine,
): Promise<A2ATask> {
  evictOldTasks();

  const taskId = randomUUID();
  const contextId = (params.metadata?.contextId as string) ?? randomUUID();

  // Extract text from message parts
  const textParts = params.message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text);
  const userText = textParts.join('\n') || '[empty message]';

  // Create task in submitted state
  const task: A2ATask = {
    id: taskId,
    contextId,
    status: makeStatus('submitted', params.message),
    history: [],
    artifacts: [],
    metadata: { ...params.metadata, createdAt: new Date().toISOString() },
  };
  tasks.set(taskId, task);

  // Transition to working
  transitionTask(taskId, 'working');

  // Create abort controller for cancellation
  const abortController = new AbortController();
  abortControllers.set(taskId, abortController);

  // Process asynchronously via ClawdAgent engine
  processTaskAsync(taskId, userText, contextId, engine, abortController.signal)
    .catch(err => {
      logger.error('A2A task processing failed', { taskId, error: String(err) });
      transitionTask(taskId, 'failed', {
        role: 'agent',
        parts: [{ type: 'text', text: `Task failed: ${String(err)}` }],
      }, true);
    })
    .finally(() => {
      abortControllers.delete(taskId);
    });

  // Return task immediately (non-blocking by default)
  if (params.configuration?.blocking) {
    // Blocking mode — wait for completion
    return waitForCompletion(taskId, 120_000);
  }
  return task;
}

/** Wait for task to reach a terminal state */
async function waitForCompletion(taskId: string, timeoutMs: number): Promise<A2ATask> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const task = tasks.get(taskId);
      if (!task) { reject(new Error('Task disappeared')); return; }
      if (['completed', 'failed', 'canceled', 'rejected'].includes(task.status.state)) {
        resolve(task);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(task); // Return current state on timeout
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

/** Process task via ClawdAgent engine (async) */
async function processTaskAsync(
  taskId: string,
  userText: string,
  contextId: string,
  engine: Engine,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    transitionTask(taskId, 'canceled', undefined, true);
    return;
  }

  const chunks: string[] = [];

  try {
    const result = await engine.process({
      platform: 'web',
      userId: `a2a:${contextId}`,
      userName: 'A2A Agent',
      chatId: `a2a:${taskId}`,
      text: userText,
      conversationId: contextId,
      metadata: { protocol: 'a2a', taskId },
      onTextChunk: (chunk: string) => {
        chunks.push(chunk);
        // Emit intermediate status with partial text
        const partialText = chunks.join('');
        emit(taskId, {
          type: 'status',
          taskId,
          status: makeStatus('working', {
            role: 'agent',
            parts: [{ type: 'text', text: partialText }],
          }),
          final: false,
        });
      },
    });

    if (signal.aborted) {
      transitionTask(taskId, 'canceled', undefined, true);
      return;
    }

    // Build final response (map OutgoingMessage fields to A2A)
    const responseText = result.text || chunks.join('') || 'Task completed with no output.';
    const agentMessage: A2AMessage = {
      role: 'agent',
      parts: [{ type: 'text', text: responseText }],
      metadata: {
        agent: result.agentUsed,
        provider: result.provider,
        tokensUsed: result.tokensUsed,
      },
    };

    transitionTask(taskId, 'completed', agentMessage, true);
  } catch (err) {
    if (signal.aborted) {
      transitionTask(taskId, 'canceled', undefined, true);
      return;
    }
    throw err;
  }
}

/** Get a task by ID */
export function getTask(params: GetTaskParams): A2ATask | undefined {
  const task = tasks.get(params.id);
  if (!task) return undefined;

  // Trim history if requested
  if (params.historyLength !== undefined && task.history) {
    const trimmed = { ...task, history: task.history.slice(-params.historyLength) };
    return trimmed;
  }
  return task;
}

/** List all tasks, optionally filtered */
export function listTasks(contextId?: string, limit = 50): A2ATask[] {
  let all = [...tasks.values()];
  if (contextId) {
    all = all.filter(t => t.contextId === contextId);
  }
  return all
    .sort((a, b) => new Date(b.status.timestamp).getTime() - new Date(a.status.timestamp).getTime())
    .slice(0, limit);
}

/** Cancel a task */
export function cancelTask(params: CancelTaskParams): A2ATask | undefined {
  const task = tasks.get(params.id);
  if (!task) return undefined;

  // Only cancel tasks that are still active
  if (['completed', 'failed', 'canceled', 'rejected'].includes(task.status.state)) {
    return undefined; // Cannot cancel terminal tasks
  }

  // Signal abort to the processing function
  const controller = abortControllers.get(params.id);
  if (controller) controller.abort();

  transitionTask(params.id, 'canceled', undefined, true);
  return tasks.get(params.id);
}

/** Subscribe to task events (for SSE streaming) */
export function subscribe(taskId: string, callback: (event: TaskEvent) => void): () => void {
  if (!subscribers.has(taskId)) {
    subscribers.set(taskId, new Set());
  }
  subscribers.get(taskId)!.add(callback);

  // Return unsubscribe function
  return () => {
    const subs = subscribers.get(taskId);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) subscribers.delete(taskId);
    }
  };
}

/** Send message with SSE streaming — returns task + event emitter */
export async function sendMessageStream(
  params: SendMessageParams,
  engine: Engine,
): Promise<{ task: A2ATask; subscribe: (cb: (event: TaskEvent) => void) => () => void }> {
  const task = await sendMessage({ ...params, configuration: { ...params.configuration, blocking: false } }, engine);
  return {
    task,
    subscribe: (cb) => subscribe(task.id, cb),
  };
}

// ─── JSON-RPC 2.0 Dispatcher ───────────────────────────────────────────────

/** Handle a JSON-RPC 2.0 request */
export async function handleJsonRpc(
  request: JsonRpcRequest,
  engine: Engine,
): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'tasks/send': {
        const task = await sendMessage(params as unknown as SendMessageParams, engine);
        return { jsonrpc: '2.0', id, result: task };
      }
      case 'tasks/get': {
        const task = getTask(params as unknown as GetTaskParams);
        if (!task) return { jsonrpc: '2.0', id, error: A2A_ERRORS.TASK_NOT_FOUND };
        return { jsonrpc: '2.0', id, result: task };
      }
      case 'tasks/cancel': {
        const task = cancelTask(params as unknown as CancelTaskParams);
        if (!task) return { jsonrpc: '2.0', id, error: A2A_ERRORS.TASK_NOT_CANCELABLE };
        return { jsonrpc: '2.0', id, result: task };
      }
      case 'tasks/pushNotification/set':
      case 'tasks/pushNotification/get':
        return { jsonrpc: '2.0', id, error: A2A_ERRORS.PUSH_NOT_SUPPORTED };
      default:
        return { jsonrpc: '2.0', id, error: A2A_ERRORS.METHOD_NOT_FOUND };
    }
  } catch (err) {
    logger.error('A2A JSON-RPC error', { method, error: String(err) });
    return {
      jsonrpc: '2.0',
      id,
      error: { code: A2A_ERRORS.INTERNAL_ERROR.code, message: String(err) },
    };
  }
}

/** Get task count stats */
export function getTaskStats(): Record<string, number> {
  const stats: Record<string, number> = { total: tasks.size };
  for (const task of tasks.values()) {
    stats[task.status.state] = (stats[task.status.state] ?? 0) + 1;
  }
  return stats;
}

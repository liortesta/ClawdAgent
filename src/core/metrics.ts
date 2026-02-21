/**
 * Metrics & Observability — Prometheus-compatible metrics export.
 *
 * Tracks: HTTP requests, AI provider calls, tool executions, memory usage,
 * cron tasks, WebSocket connections, and circuit breaker state.
 *
 * Exposed at GET /metrics in Prometheus text exposition format.
 * Zero external dependencies — uses built-in counters and gauges.
 */

import logger from '../utils/logger.js';

// ── Metric Types ─────────────────────────────────────────────────────────────

interface Counter {
  type: 'counter';
  help: string;
  values: Map<string, number>;
}

interface Gauge {
  type: 'gauge';
  help: string;
  values: Map<string, number>;
}

interface Histogram {
  type: 'histogram';
  help: string;
  buckets: number[];
  observations: Map<string, number[]>;
}

type Metric = Counter | Gauge | Histogram;

// ── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, Metric>();

function getOrCreateCounter(name: string, help: string): Counter {
  let m = registry.get(name);
  if (!m) { m = { type: 'counter', help, values: new Map() }; registry.set(name, m); }
  return m as Counter;
}

function getOrCreateGauge(name: string, help: string): Gauge {
  let m = registry.get(name);
  if (!m) { m = { type: 'gauge', help, values: new Map() }; registry.set(name, m); }
  return m as Gauge;
}

function getOrCreateHistogram(name: string, help: string, buckets: number[]): Histogram {
  let m = registry.get(name);
  if (!m) { m = { type: 'histogram', help, buckets, observations: new Map() }; registry.set(name, m); }
  return m as Histogram;
}

function labelsToKey(labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) return '';
  return '{' + entries.map(([k, v]) => `${k}="${v}"`).join(',') + '}';
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Increment a counter */
export function incCounter(name: string, help: string, labels: Record<string, string> = {}, value = 1): void {
  const c = getOrCreateCounter(name, help);
  const key = labelsToKey(labels);
  c.values.set(key, (c.values.get(key) ?? 0) + value);
}

/** Set a gauge value */
export function setGauge(name: string, help: string, labels: Record<string, string> = {}, value: number): void {
  const g = getOrCreateGauge(name, help);
  g.values.set(labelsToKey(labels), value);
}

/** Observe a histogram value */
export function observeHistogram(name: string, help: string, buckets: number[], labels: Record<string, string> = {}, value: number): void {
  const h = getOrCreateHistogram(name, help, buckets);
  const key = labelsToKey(labels);
  const obs = h.observations.get(key) ?? [];
  obs.push(value);
  h.observations.set(key, obs);
}

// ── Pre-defined Metrics ──────────────────────────────────────────────────────

const HTTP_DURATION_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const AI_DURATION_BUCKETS = [0.5, 1, 2, 5, 10, 30, 60, 120];

/** Track HTTP request */
export function trackHTTPRequest(method: string, path: string, statusCode: number, durationMs: number): void {
  const route = normalizePath(path);
  incCounter('http_requests_total', 'Total HTTP requests', { method, route, status: String(statusCode) });
  observeHistogram('http_request_duration_seconds', 'HTTP request duration', HTTP_DURATION_BUCKETS, { method, route }, durationMs / 1000);
}

/** Track AI provider call */
export function trackAICall(provider: string, model: string, durationMs: number, inputTokens: number, outputTokens: number, success: boolean): void {
  incCounter('ai_requests_total', 'Total AI provider requests', { provider, model, status: success ? 'success' : 'error' });
  incCounter('ai_tokens_total', 'Total AI tokens used', { provider, direction: 'input' }, inputTokens);
  incCounter('ai_tokens_total', 'Total AI tokens used', { provider, direction: 'output' }, outputTokens);
  observeHistogram('ai_request_duration_seconds', 'AI request duration', AI_DURATION_BUCKETS, { provider }, durationMs / 1000);
}

/** Track tool execution */
export function trackToolExecution(tool: string, success: boolean, durationMs: number): void {
  incCounter('tool_executions_total', 'Total tool executions', { tool, status: success ? 'success' : 'error' });
  observeHistogram('tool_execution_duration_seconds', 'Tool execution duration', HTTP_DURATION_BUCKETS, { tool }, durationMs / 1000);
}

/** Track WebSocket connections */
export function trackWSConnection(action: 'open' | 'close'): void {
  const g = getOrCreateGauge('websocket_connections', 'Active WebSocket connections');
  const current = g.values.get('') ?? 0;
  g.values.set('', action === 'open' ? current + 1 : Math.max(0, current - 1));
}

/** Track cron execution */
export function trackCronExecution(taskName: string, success: boolean): void {
  incCounter('cron_executions_total', 'Total cron executions', { task: taskName, status: success ? 'success' : 'error' });
}

/** Update system metrics (call periodically) */
export function updateSystemMetrics(): void {
  const mem = process.memoryUsage();
  setGauge('process_heap_used_bytes', 'Process heap used bytes', {}, mem.heapUsed);
  setGauge('process_heap_total_bytes', 'Process heap total bytes', {}, mem.heapTotal);
  setGauge('process_rss_bytes', 'Process RSS bytes', {}, mem.rss);
  setGauge('process_uptime_seconds', 'Process uptime seconds', {}, process.uptime());
}

// ── Prometheus Text Format Export ────────────────────────────────────────────

/** Render all metrics in Prometheus text exposition format */
export function renderMetrics(): string {
  updateSystemMetrics();
  const lines: string[] = [];

  for (const [name, metric] of registry) {
    lines.push(`# HELP ${name} ${metric.help}`);
    lines.push(`# TYPE ${name} ${metric.type === 'histogram' ? 'histogram' : metric.type}`);

    if (metric.type === 'counter' || metric.type === 'gauge') {
      for (const [key, val] of metric.values) {
        lines.push(`${name}${key} ${val}`);
      }
    } else if (metric.type === 'histogram') {
      for (const [key, observations] of metric.observations) {
        const sorted = [...observations].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((a, b) => a + b, 0);

        for (const bucket of metric.buckets) {
          const le = sorted.filter(v => v <= bucket).length;
          const bucketKey = key ? key.replace('}', `,le="${bucket}"}`) : `{le="${bucket}"}`;
          lines.push(`${name}_bucket${bucketKey} ${le}`);
        }
        const infKey = key ? key.replace('}', ',le="+Inf"}') : '{le="+Inf"}';
        lines.push(`${name}_bucket${infKey} ${count}`);
        lines.push(`${name}_sum${key} ${sum}`);
        lines.push(`${name}_count${key} ${count}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

/** Normalize route path for metric labels (collapse IDs) */
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .split('?')[0];
}

/** Express middleware that tracks request metrics */
export function metricsMiddleware(req: any, res: any, next: () => void): void {
  const start = Date.now();
  res.on('finish', () => {
    trackHTTPRequest(req.method, req.path, res.statusCode, Date.now() - start);
  });
  next();
}

logger.info('Metrics module initialized');

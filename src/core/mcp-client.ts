import { spawn, ChildProcess } from 'child_process';
import logger from '../utils/logger.js';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  serverId: string;
}

interface MCPServer {
  id: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  process?: ChildProcess;
  tools: MCPTool[];
  resources: MCPResource[];
  ready: boolean;
  requestId: number;
  pendingRequests: Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>;
  buffer: string;
}

export interface MCPServerConfig {
  id: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class MCPClient {
  private servers: Map<string, MCPServer> = new Map();

  async init(serverConfigs: MCPServerConfig[]) {
    for (const cfg of serverConfigs) {
      await this.startServer(cfg);
    }
    logger.info('MCP Client initialized', {
      servers: this.servers.size,
      tools: this.getToolCount(),
    });
  }

  private async startServer(cfg: MCPServerConfig) {
    const server: MCPServer = {
      id: cfg.id,
      command: cfg.command,
      args: cfg.args ?? [],
      env: cfg.env,
      tools: [],
      resources: [],
      ready: false,
      requestId: 0,
      pendingRequests: new Map(),
      buffer: '',
    };

    try {
      server.process = spawn(cfg.command, cfg.args ?? [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...cfg.env },
        shell: true,
      });

      server.process.stdout?.on('data', (data: Buffer) => {
        server.buffer += data.toString();
        this.processBuffer(server);
      });

      server.process.stderr?.on('data', (data: Buffer) => {
        logger.debug(`MCP ${cfg.id} stderr: ${data.toString().trim()}`);
      });

      server.process.on('exit', (code) => {
        logger.warn(`MCP server ${cfg.id} exited`, { code });
        server.ready = false;
      });

      // Initialize the MCP server (JSON-RPC 2.0)
      await this.sendRequest(server, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'ClawdAgent', version: '5.0.0' },
      });

      // Send initialized notification
      this.sendNotification(server, 'notifications/initialized', {});

      // Discover tools
      try {
        const toolsResult = await this.sendRequest(server, 'tools/list', {});
        server.tools = (toolsResult.tools ?? []).map((t: any) => ({
          name: t.name,
          description: t.description ?? '',
          inputSchema: t.inputSchema ?? {},
          serverId: cfg.id,
        }));
      } catch { /* server may not support tools */ }

      // Discover resources
      try {
        const resourcesResult = await this.sendRequest(server, 'resources/list', {});
        server.resources = (resourcesResult.resources ?? []).map((r: any) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          serverId: cfg.id,
        }));
      } catch { /* server may not support resources */ }

      server.ready = true;
      this.servers.set(cfg.id, server);
      logger.info(`MCP server started: ${cfg.id}`, {
        tools: server.tools.map(t => t.name),
        resources: server.resources.length,
      });
    } catch (err: any) {
      logger.warn(`Failed to start MCP server: ${cfg.id}`, { error: err.message });
      server.process?.kill();
    }
  }

  private sendRequest(server: MCPServer, method: string, params: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++server.requestId;
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

      const timeout = setTimeout(() => {
        server.pendingRequests.delete(id);
        reject(new Error(`MCP request timeout: ${method}`));
      }, 30000);

      server.pendingRequests.set(id, {
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (err) => { clearTimeout(timeout); reject(err); },
      });

      server.process?.stdin?.write(message);
    });
  }

  private sendNotification(server: MCPServer, method: string, params: Record<string, unknown>) {
    const message = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    server.process?.stdin?.write(message);
  }

  private processBuffer(server: MCPServer) {
    const lines = server.buffer.split('\n');
    server.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && server.pendingRequests.has(msg.id)) {
          const pending = server.pendingRequests.get(msg.id)!;
          server.pendingRequests.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
          } else {
            pending.resolve(msg.result ?? {});
          }
        }
      } catch {
        logger.debug('MCP parse error', { line: line.slice(0, 200) });
      }
    }
  }

  /** Get all tools from all connected MCP servers. */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const server of this.servers.values()) {
      if (server.ready) tools.push(...server.tools);
    }
    return tools;
  }

  /** Call a tool on the appropriate MCP server. */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    for (const server of this.servers.values()) {
      const tool = server.tools.find(t => t.name === toolName);
      if (tool && server.ready) {
        const result = await this.sendRequest(server, 'tools/call', {
          name: toolName,
          arguments: args,
        });
        // MCP tool results are an array of content blocks
        if (Array.isArray(result.content)) {
          return result.content
            .map((c: any) => c.text ?? JSON.stringify(c))
            .join('\n');
        }
        return JSON.stringify(result);
      }
    }
    throw new Error(`MCP tool not found: ${toolName}`);
  }

  /** Read a resource from the appropriate MCP server. */
  async readResource(uri: string): Promise<string> {
    for (const server of this.servers.values()) {
      const resource = server.resources.find(r => r.uri === uri);
      if (resource && server.ready) {
        const result = await this.sendRequest(server, 'resources/read', { uri });
        if (Array.isArray(result.contents)) {
          return result.contents
            .map((c: any) => c.text ?? JSON.stringify(c))
            .join('\n');
        }
        return JSON.stringify(result);
      }
    }
    throw new Error(`MCP resource not found: ${uri}`);
  }

  /** Get a summary of all available MCP tools for the system prompt. */
  getToolsSummary(): string {
    const tools = this.getAllTools();
    if (tools.length === 0) return '';
    return tools.map(t => `- mcp:${t.name} (${t.serverId}): ${t.description}`).join('\n');
  }

  async shutdown() {
    for (const [id, server] of this.servers) {
      try {
        server.process?.kill('SIGTERM');
        logger.info(`MCP server stopped: ${id}`);
      } catch { /* ignore */ }
    }
    this.servers.clear();
  }

  getServerCount(): number { return this.servers.size; }
  getToolCount(): number { return this.getAllTools().length; }
}

import { BaseTool, ToolResult } from './base-tool.js';
import { searchKnowledge, getKnowledgeByCategory, learnFact } from '../../memory/repositories/knowledge.js';
import { getUserTasks } from '../../memory/repositories/tasks.js';
import { getUserServers } from '../../memory/repositories/servers.js';

export class DbTool extends BaseTool {
  name = 'db';
  description = 'Query the database (knowledge, tasks, servers)';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;
    const userId = input.userId as string;

    if (!userId) return { success: false, output: '', error: 'Missing userId' };

    this.log('DB action', { action, userId });

    try {
      switch (action) {
        case 'search-knowledge': {
          const results = await searchKnowledge(userId, input.query as string);
          return { success: true, output: results || 'No matching knowledge found' };
        }

        case 'get-knowledge-category': {
          const results = await getKnowledgeByCategory(userId, input.category as string);
          return { success: true, output: results || 'No knowledge in this category' };
        }

        case 'learn': {
          await learnFact(userId, input.key as string, input.value as string, (input.category as string) ?? 'manual', 'tool');
          return { success: true, output: `Learned: ${input.key} = ${input.value}` };
        }

        case 'list-tasks': {
          const tasks = await getUserTasks(userId, input.status as string);
          return { success: true, output: tasks.map(t => `- ${t.title} (${t.status})`).join('\n') || 'No tasks' };
        }

        case 'list-servers': {
          const srvs = await getUserServers(userId);
          return { success: true, output: srvs.map(s => `- ${s.name}: ${s.host}:${s.port ?? 22} (${s.status ?? 'unknown'})`).join('\n') || 'No servers' };
        }

        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Use: search-knowledge, get-knowledge-category, learn, list-tasks, list-servers` };
      }
    } catch (err: any) {
      this.error('DB action failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }
}

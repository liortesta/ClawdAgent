import { BaseTool, ToolResult } from './base-tool.js';
import { TaskManager } from '../../actions/tasks/manager.js';

const manager = new TaskManager();

export class TaskTool extends BaseTool {
  name = 'task';
  description = 'Create, list, update, and manage tasks';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;
    const userId = input.userId as string;

    if (!userId) return { success: false, output: '', error: 'Missing userId' };

    this.log('Task action', { action, userId });

    try {
      switch (action) {
        case 'create': {
          const task = await manager.create(userId, input.title as string, {
            description: input.description as string,
            priority: input.priority as string,
            dueDate: input.dueDate ? new Date(input.dueDate as string) : undefined,
            tags: input.tags as string[],
          });
          return { success: true, output: `Task created: "${task.title}" (ID: ${task.id})` };
        }

        case 'list': {
          const tasks = await manager.list(userId, input.status as string);
          if (tasks.length === 0) return { success: true, output: 'No tasks found' };
          const formatted = tasks.map(t =>
            `- [${t.priority ?? 'medium'}] ${t.title} (${t.status})${t.dueDate ? ` — due ${t.dueDate.toLocaleDateString()}` : ''}`
          ).join('\n');
          return { success: true, output: formatted };
        }

        case 'complete': {
          await manager.complete(input.taskId as string);
          return { success: true, output: `Task ${input.taskId} marked as done` };
        }

        case 'overdue': {
          const overdue = await manager.getOverdue(userId);
          if (overdue.length === 0) return { success: true, output: 'No overdue tasks' };
          const formatted = overdue.map(t =>
            `- ${t.title}${t.dueDate ? ` (due ${t.dueDate.toLocaleDateString()})` : ''}`
          ).join('\n');
          return { success: true, output: formatted };
        }

        default:
          return { success: false, output: '', error: `Unknown action: ${action}. Use: create, list, complete, overdue` };
      }
    } catch (err: any) {
      this.error('Task action failed', { error: err.message });
      return { success: false, output: '', error: err.message };
    }
  }
}

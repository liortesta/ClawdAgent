import { createTask, getUserTasks, updateTask, getOverdueTasks } from '../../memory/repositories/tasks.js';
import logger from '../../utils/logger.js';

export class TaskManager {
  async create(userId: string, title: string, options?: { description?: string; priority?: string; dueDate?: Date; tags?: string[] }) {
    const task = await createTask(userId, { title, ...options });
    logger.info('Task created', { userId, taskId: task.id, title });
    return task;
  }

  async list(userId: string, status?: string) {
    return getUserTasks(userId, status);
  }

  async complete(taskId: string) {
    await updateTask(taskId, { status: 'done', completedAt: new Date() });
  }

  async getOverdue(userId: string) {
    return getOverdueTasks(userId);
  }
}

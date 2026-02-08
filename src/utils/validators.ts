import { z } from 'zod';

export const serverSchema = z.object({
  name: z.string().min(1).max(100),
  host: z.string().min(1),
  port: z.coerce.number().min(1).max(65535).default(22),
  username: z.string().min(1),
  authMethod: z.enum(['password', 'key']).default('key'),
});

export const taskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(['p0', 'p1', 'p2', 'p3']).default('p2'),
  dueDate: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
});

export const messageSchema = z.object({
  text: z.string().min(1).max(10000),
  platform: z.enum(['telegram', 'discord', 'whatsapp', 'web']),
  userId: z.string().min(1),
});

export const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(100),
});

export const githubRepoSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().default('main'),
});

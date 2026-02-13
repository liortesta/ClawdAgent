import { AuthorizationError } from '../utils/errors.js';

export enum Role {
  ADMIN = 'admin',
  USER = 'user',
  READONLY = 'readonly',
}

const permissions: Record<string, string[]> = {
  admin: ['*'],
  user: [
    'chat', 'tasks', 'tasks.read', 'search',
    'github.read', 'servers.read',
    'rag.query', 'rag.upload', 'rag.list',
    'trading.read', 'trading.paper',
    'knowledge', 'skills.read', 'logs.read',
    'history.read', 'costs.read', 'cron.read',
    'settings.read',
  ],
  readonly: [
    'chat', 'tasks.read', 'search',
    'rag.query', 'rag.list',
    'trading.read',
    'knowledge.read', 'skills.read', 'logs.read',
    'history.read', 'costs.read',
  ],
};

// Actions that require admin role — cannot be granted to user/readonly
const ADMIN_ONLY_ACTIONS = [
  'bash', 'ssh', 'desktop', 'device',
  'trading.live', 'trading.config',
  'servers.write', 'servers.delete',
  'settings.write', 'cron.write', 'cron.delete',
  'rag.delete', 'skills.write',
  'admin',
];

export function hasPermission(role: string, action: string): boolean {
  const rolePerms = permissions[role] ?? [];
  if (rolePerms.includes('*')) return true;

  // Check admin-only actions
  if (ADMIN_ONLY_ACTIONS.some(a => action === a || action.startsWith(a + '.'))) {
    return role === 'admin';
  }

  return rolePerms.some(p => action === p || action.startsWith(p.replace('.read', '')));
}

export function requirePermission(role: string, action: string) {
  if (!hasPermission(role, action)) {
    throw new AuthorizationError(`Role '${role}' cannot perform '${action}'`);
  }
}

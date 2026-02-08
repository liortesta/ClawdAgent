import { AuthorizationError } from '../utils/errors.js';

export enum Role {
  ADMIN = 'admin',
  USER = 'user',
  READONLY = 'readonly',
}

const permissions: Record<string, string[]> = {
  admin: ['*'],
  user: ['chat', 'tasks', 'search', 'github.read', 'servers.read'],
  readonly: ['chat', 'tasks.read', 'search'],
};

export function hasPermission(role: string, action: string): boolean {
  const rolePerms = permissions[role] ?? [];
  if (rolePerms.includes('*')) return true;
  return rolePerms.some(p => action === p || action.startsWith(p.replace('.read', '')));
}

export function requirePermission(role: string, action: string) {
  if (!hasPermission(role, action)) {
    throw new AuthorizationError(`Role '${role}' cannot perform '${action}'`);
  }
}

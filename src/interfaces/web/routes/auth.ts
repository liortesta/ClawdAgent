import { Router, Request, Response } from 'express';
import { generateToken, hashPassword, verifyPassword } from '../../../security/auth.js';

const users = new Map<string, { passwordHash: string; role: string }>();

export function setupAuthRoutes(): Router {
  const router = Router();

  router.post('/register', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) { res.status(400).json({ error: 'Username and password required' }); return; }
    if (users.has(username)) { res.status(409).json({ error: 'User exists' }); return; }

    const passwordHash = await hashPassword(password);
    users.set(username, { passwordHash, role: 'user' });
    const token = generateToken({ userId: username, role: 'user', platform: 'web' });
    res.json({ token });
  });

  router.post('/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const user = users.get(username);
    if (!user) { res.status(401).json({ error: 'Invalid credentials' }); return; }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return; }

    const token = generateToken({ userId: username, role: user.role, platform: 'web' });
    res.json({ token });
  });

  return router;
}

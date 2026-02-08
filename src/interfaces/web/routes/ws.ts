import { WebSocketServer, WebSocket } from 'ws';
import { Engine } from '../../../core/engine.js';
import { verifyToken } from '../../../security/auth.js';
import logger from '../../../utils/logger.js';

export function setupWebSocket(wss: WebSocketServer, engine: Engine) {
  wss.on('connection', (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    let user: { userId: string; role: string } | null = null;
    try {
      if (token) user = verifyToken(token);
    } catch { ws.close(4001, 'Invalid token'); return; }

    if (!user) { ws.close(4001, 'Authentication required'); return; }

    logger.info('WebSocket connected', { userId: user.userId });

    ws.on('message', async (data) => {
      try {
        const { text } = JSON.parse(data.toString());
        const response = await engine.process({
          platform: 'web', userId: user!.userId, userName: user!.userId, chatId: 'ws', text,
        });
        ws.send(JSON.stringify({ type: 'message', data: response }));
      } catch (error: any) {
        ws.send(JSON.stringify({ type: 'error', data: { message: error.message } }));
      }
    });

    ws.on('close', () => logger.debug('WebSocket disconnected', { userId: user?.userId }));
  });
}

import { Router, Request, Response } from 'express';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const LOGS_DIR = join(process.cwd(), 'logs');

export function setupLogsRoutes(): Router {
  const router = Router();

  // GET /api/logs — get recent logs
  router.get('/', (req: Request, res: Response) => {
    const { level, limit: limitStr, search } = req.query;
    const limit = parseInt(limitStr as string) || 100;

    try {
      // Find most recent log files
      if (!existsSync(LOGS_DIR)) {
        res.json({ logs: [], files: [] });
        return;
      }

      const files = readdirSync(LOGS_DIR)
        .filter(f => f.endsWith('.log') || f.endsWith('.jsonl'))
        .map(f => ({
          name: f,
          path: join(LOGS_DIR, f),
          size: statSync(join(LOGS_DIR, f)).size,
          modified: statSync(join(LOGS_DIR, f)).mtime.toISOString(),
        }))
        .sort((a, b) => b.modified.localeCompare(a.modified));

      // Read from the combined/error log
      const targetFiles = ['combined.log', 'error.log', 'app.log'];
      let logFile = files.find(f => targetFiles.includes(f.name));
      if (!logFile && files.length > 0) logFile = files[0];

      if (!logFile) {
        res.json({ logs: [], files: files.map(f => ({ name: f.name, size: f.size, modified: f.modified })) });
        return;
      }

      const content = readFileSync(logFile.path, 'utf-8');
      let lines = content.trim().split('\n').filter(Boolean);

      // Parse log entries
      let entries = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          // Plain text log line
          const match = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s]*)\s+\[?(\w+)\]?\s*(.*)/);
          if (match) {
            return { timestamp: match[1], level: match[2].toLowerCase(), message: match[3] };
          }
          return { timestamp: new Date().toISOString(), level: 'info', message: line };
        }
      });

      // Filter by level
      if (level && typeof level === 'string') {
        entries = entries.filter(e => e.level === level);
      }

      // Filter by search
      if (search && typeof search === 'string') {
        const searchLower = search.toLowerCase();
        entries = entries.filter(e =>
          (e.message ?? '').toLowerCase().includes(searchLower) ||
          JSON.stringify(e).toLowerCase().includes(searchLower)
        );
      }

      // Return latest entries
      const result = entries.slice(-limit).reverse();
      res.json({
        logs: result,
        total: entries.length,
        files: files.map(f => ({ name: f.name, size: f.size, modified: f.modified })),
      });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to read logs: ${err.message}` });
    }
  });

  // GET /api/logs/file/:filename — read specific log file
  router.get('/file/:filename', (req: Request, res: Response) => {
    const filePath = join(LOGS_DIR, String(req.params.filename));

    // Prevent path traversal
    if (!filePath.startsWith(LOGS_DIR)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'Log file not found' });
      return;
    }

    try {
      const tail = parseInt(req.query.tail as string) || 200;
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      const result = lines.slice(-tail);
      res.json({ lines: result, total: lines.length, file: req.params.filename });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to read file: ${err.message}` });
    }
  });

  return router;
}

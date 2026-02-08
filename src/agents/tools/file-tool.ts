import { readFile, writeFile, stat } from 'fs/promises';
import { BaseTool, ToolResult } from './base-tool.js';

export class FileTool extends BaseTool {
  name = 'file';
  description = 'Read, write, and manage files';

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input.action as string;
    const path = input.path as string;

    if (!path) return { success: false, output: '', error: 'No path provided' };

    try {
      switch (action) {
        case 'read': {
          const content = await readFile(path, 'utf-8');
          return { success: true, output: content };
        }
        case 'write': {
          const content = input.content as string;
          await writeFile(path, content, 'utf-8');
          return { success: true, output: `Written to ${path}` };
        }
        case 'stat': {
          const info = await stat(path);
          return { success: true, output: JSON.stringify({ size: info.size, modified: info.mtime, isDir: info.isDirectory() }) };
        }
        default:
          return { success: false, output: '', error: `Unknown action: ${action}` };
      }
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }
}

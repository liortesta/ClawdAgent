import logger from '../../utils/logger.js';
import config from '../../config.js';

export interface DesktopAction {
  type: 'click' | 'doubleClick' | 'rightClick' | 'moveMouse' | 'type' | 'keyPress' | 'hotkey' | 'screenshot' | 'scroll' | 'getClipboard' | 'setClipboard' | 'openApp';
  x?: number;
  y?: number;
  text?: string;
  keys?: string[];
  direction?: 'up' | 'down';
  amount?: number;
  appName?: string;
}

export interface DesktopResult {
  success: boolean;
  data?: any;
  screenshot?: Buffer;
  error?: string;
}

// Lazy-loaded nut-js modules (only imported when DESKTOP_ENABLED=true)
let nutMouse: any;
let nutKeyboard: any;
let nutScreen: any;
let nutClipboard: any;
let nutButton: any;
let nutKey: any;
let nutPoint: any;
let nutLoaded = false;

async function loadNutJs(): Promise<boolean> {
  if (nutLoaded) return true;
  try {
    const nutjs = await import('@nut-tree/nut-js');
    nutMouse = nutjs.mouse;
    nutKeyboard = nutjs.keyboard;
    nutScreen = nutjs.screen;
    nutClipboard = nutjs.clipboard;
    nutButton = nutjs.Button;
    nutKey = nutjs.Key;
    nutPoint = nutjs.Point;
    nutLoaded = true;
    return true;
  } catch (err: any) {
    logger.warn('Failed to load @nut-tree/nut-js — desktop control unavailable', { error: err.message });
    return false;
  }
}

function resolveKey(keyStr: string): number | undefined {
  if (!nutKey) return undefined;
  const KEY_MAP: Record<string, number> = {
    enter: nutKey.Enter, tab: nutKey.Tab, escape: nutKey.Escape,
    backspace: nutKey.Backspace, delete: nutKey.Delete,
    up: nutKey.Up, down: nutKey.Down, left: nutKey.Left, right: nutKey.Right,
    home: nutKey.Home, end: nutKey.End, pageup: nutKey.PageUp, pagedown: nutKey.PageDown,
    space: nutKey.Space,
    f1: nutKey.F1, f2: nutKey.F2, f3: nutKey.F3, f4: nutKey.F4, f5: nutKey.F5, f6: nutKey.F6,
    f7: nutKey.F7, f8: nutKey.F8, f9: nutKey.F9, f10: nutKey.F10, f11: nutKey.F11, f12: nutKey.F12,
    ctrl: nutKey.LeftControl, control: nutKey.LeftControl,
    alt: nutKey.LeftAlt, shift: nutKey.LeftShift,
    win: nutKey.LeftWin, meta: nutKey.LeftWin, cmd: nutKey.LeftWin,
  };
  const lower = keyStr.toLowerCase();
  return KEY_MAP[lower] ?? nutKey[keyStr] ?? undefined;
}

export class DesktopController {
  private enabled: boolean;
  private initialized = false;

  constructor() {
    this.enabled = config.DESKTOP_ENABLED ?? false;
  }

  private async ensureInit(): Promise<boolean> {
    if (this.initialized) return true;
    if (!this.enabled) return false;
    const loaded = await loadNutJs();
    if (loaded) {
      nutMouse.config.autoDelayMs = 100;
      nutKeyboard.config.autoDelayMs = 50;
      this.initialized = true;
      logger.info('Desktop controller initialized');
    } else {
      this.enabled = false;
    }
    return this.initialized;
  }

  isEnabled(): boolean { return this.enabled; }

  async executeAction(action: DesktopAction): Promise<DesktopResult> {
    if (!(await this.ensureInit())) return { success: false, error: 'Desktop control is disabled or unavailable' };

    try {
      switch (action.type) {
        case 'click':
          await nutMouse.setPosition(new nutPoint(action.x ?? 0, action.y ?? 0));
          await nutMouse.click(nutButton.LEFT);
          return { success: true };

        case 'doubleClick':
          await nutMouse.setPosition(new nutPoint(action.x ?? 0, action.y ?? 0));
          await nutMouse.doubleClick(nutButton.LEFT);
          return { success: true };

        case 'rightClick':
          await nutMouse.setPosition(new nutPoint(action.x ?? 0, action.y ?? 0));
          await nutMouse.click(nutButton.RIGHT);
          return { success: true };

        case 'moveMouse':
          await nutMouse.setPosition(new nutPoint(action.x ?? 0, action.y ?? 0));
          return { success: true };

        case 'type':
          if (action.text) await nutKeyboard.type(action.text);
          return { success: true };

        case 'keyPress': {
          if (!action.keys?.length) return { success: true };
          const resolved = action.keys.map(resolveKey).filter((k): k is number => k !== undefined);
          for (const k of resolved) await nutKeyboard.pressKey(k);
          for (const k of [...resolved].reverse()) await nutKeyboard.releaseKey(k);
          return { success: true };
        }

        case 'hotkey': {
          if (!action.keys?.length) return { success: true };
          const resolved = action.keys.map(resolveKey).filter((k): k is number => k !== undefined);
          for (const k of resolved) await nutKeyboard.pressKey(k);
          for (const k of [...resolved].reverse()) await nutKeyboard.releaseKey(k);
          return { success: true };
        }

        case 'screenshot': {
          const img = await nutScreen.grab();
          return { success: true, screenshot: Buffer.from(img.data), data: { width: img.width, height: img.height } };
        }

        case 'scroll':
          if (action.direction === 'up') {
            await nutMouse.scrollUp(action.amount ?? 3);
          } else {
            await nutMouse.scrollDown(action.amount ?? 3);
          }
          return { success: true };

        case 'getClipboard': {
          const text = await nutClipboard.getContent();
          return { success: true, data: { text } };
        }

        case 'setClipboard':
          if (action.text) await nutClipboard.setContent(action.text);
          return { success: true };

        case 'openApp': {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          const appName = action.appName ?? action.text ?? '';
          if (process.platform === 'win32') {
            await execAsync(`start "" "${appName}"`);
          } else if (process.platform === 'darwin') {
            await execAsync(`open -a "${appName}"`);
          } else {
            await execAsync(appName);
          }
          return { success: true, data: { opened: appName } };
        }

        default:
          return { success: false, error: `Unknown action type: ${action.type}` };
      }
    } catch (err: any) {
      logger.error('Desktop action failed', { action: action.type, error: err.message });
      return { success: false, error: err.message };
    }
  }

  async takeScreenshot(): Promise<{ buffer: Buffer; width: number; height: number } | null> {
    if (!(await this.ensureInit())) return null;
    try {
      const img = await nutScreen.grab();
      return { buffer: Buffer.from(img.data), width: img.width, height: img.height };
    } catch (err: any) {
      logger.error('Screenshot failed', { error: err.message });
      return null;
    }
  }

  async getMousePosition(): Promise<{ x: number; y: number }> {
    if (!(await this.ensureInit())) return { x: 0, y: 0 };
    const pos = await nutMouse.getPosition();
    return { x: pos.x, y: pos.y };
  }

  async getScreenSize(): Promise<{ width: number; height: number }> {
    if (!(await this.ensureInit())) return { width: 0, height: 0 };
    const w = await nutScreen.width();
    const h = await nutScreen.height();
    return { width: w, height: h };
  }
}

import { describe, it, expect } from 'vitest';
import { checkDesktopSafety } from '../../src/actions/desktop/safety.js';

describe('checkDesktopSafety', () => {
  it('blocks "rm -rf /" in typed text', () => {
    const result = checkDesktopSafety({ type: 'type', text: 'rm -rf /' });
    expect(result.allowed).toBe(false);
  });

  it('blocks "format c:" in typed text', () => {
    const result = checkDesktopSafety({ type: 'type', text: 'format c:' });
    expect(result.allowed).toBe(false);
  });

  it('blocks "mkfs" in typed text', () => {
    const result = checkDesktopSafety({ type: 'type', text: 'mkfs /dev/sda1' });
    expect(result.allowed).toBe(false);
  });

  it('blocks "shutdown" in typed text', () => {
    const result = checkDesktopSafety({ type: 'type', text: 'shutdown -h now' });
    expect(result.allowed).toBe(false);
  });

  it('allows safe commands like "ls" in typed text', () => {
    const result = checkDesktopSafety({ type: 'type', text: 'ls -la' });
    expect(result.allowed).toBe(true);
  });

  it('allows "git status" in typed text', () => {
    const result = checkDesktopSafety({ type: 'type', text: 'git status' });
    expect(result.allowed).toBe(true);
  });

  it('allows "npm test" in typed text', () => {
    const result = checkDesktopSafety({ type: 'type', text: 'npm test' });
    expect(result.allowed).toBe(true);
  });

  it('performs case-insensitive matching on dangerous patterns', () => {
    const result = checkDesktopSafety({ type: 'type', text: 'SHUTDOWN' });
    expect(result.allowed).toBe(false);
  });

  it('blocks launching a blocked app like regedit', () => {
    const result = checkDesktopSafety({ type: 'openApp', appName: 'regedit' });
    expect(result.allowed).toBe(false);
  });

  it('allows launching a safe app', () => {
    const result = checkDesktopSafety({ type: 'openApp', appName: 'notepad' });
    expect(result.allowed).toBe(true);
  });
});

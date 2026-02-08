import { describe, it, expect } from 'vitest';
import { parseCronExpression } from '../../src/core/cron-engine.js';

describe('parseCronExpression', () => {
  it('parses "every 5 min" to a 5-minute interval', () => {
    expect(parseCronExpression('every 5 min')).toBe('*/5 * * * *');
  });

  it('parses "every morning" to 08:00 daily', () => {
    expect(parseCronExpression('every morning')).toBe('0 8 * * *');
  });

  it('parses "every evening" to 20:00 daily', () => {
    expect(parseCronExpression('every evening')).toBe('0 20 * * *');
  });

  it('parses Hebrew "כל בוקר" to 08:00 daily', () => {
    expect(parseCronExpression('כל בוקר')).toBe('0 8 * * *');
  });

  it('parses Hebrew "כל שעה" to every hour', () => {
    expect(parseCronExpression('כל שעה')).toBe('0 * * * *');
  });

  it('parses Hebrew "כל יום" to 09:00 daily', () => {
    expect(parseCronExpression('כל יום')).toBe('0 9 * * *');
  });

  it('passes through a raw valid cron expression unchanged', () => {
    expect(parseCronExpression('30 14 * * 1')).toBe('30 14 * * 1');
  });

  it('returns null for unrecognized input', () => {
    expect(parseCronExpression('do something random')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCronExpression('')).toBeNull();
  });
});

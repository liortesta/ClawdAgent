import { describe, it, expect } from 'vitest';
import { chunkText } from '../../src/actions/rag/chunker.js';

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    const text = 'This is a short paragraph that fits easily within the default chunk size limit.';
    const chunks = chunkText(text, 'test-doc');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].source).toBe('test-doc');
    expect(chunks[0].index).toBe(0);
  });

  it('splits long text into multiple chunks', () => {
    const text = 'A'.repeat(3000);
    const chunks = chunkText(text, 'long-doc', 500, 100);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('sets the correct source field on every chunk', () => {
    const text = 'B'.repeat(2500);
    const chunks = chunkText(text, 'my-source', 500, 100);
    for (const chunk of chunks) {
      expect(chunk.source).toBe('my-source');
    }
  });

  it('produces overlap between consecutive chunks', () => {
    const text = 'Word '.repeat(600); // ~3000 chars
    const chunks = chunkText(text, 'overlap-test', 500, 200);
    if (chunks.length >= 2) {
      const endOfFirst = chunks[0].text.slice(-100);
      const startOfSecond = chunks[1].text.slice(0, 200);
      expect(startOfSecond).toContain(endOfFirst.trim().split(' ').pop());
    }
  });

  it('returns an empty array for empty text', () => {
    const chunks = chunkText('', 'empty');
    expect(chunks).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '../../src/actions/rag/embeddings.js';

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('returns -1.0 for opposite vectors', () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('returns a positive value for similar vectors', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 4];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('returns NaN for a zero vector (degenerate case)', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBeNaN();
  });

  it('handles different-length vectors by iterating over the shorter length', () => {
    const a = [1, 0];
    const b = [1, 0, 0, 0];
    // The function iterates over a.length (2), ignoring extra elements in b
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeCloseTo(1.0);
  });
});

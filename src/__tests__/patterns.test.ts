import { describe, it, expect } from 'vitest';
import { extractPatterns } from '../analysis/patterns';
import type { SequenceData } from 'tnaj';

describe('extractPatterns', () => {
  it('extracts known bigram and trigram counts', () => {
    const data: SequenceData = [
      ['A', 'B', 'C', 'A', 'B'],
      ['A', 'B', 'C', 'A', 'B'],
    ];
    const results = extractPatterns(data, { minCount: 1 });
    const ab = results.find(r => r.pattern === 'A->B');
    expect(ab).toBeDefined();
    expect(ab!.count).toBe(4); // 2 per sequence × 2 sequences
  });

  it('minCount filter removes rare patterns', () => {
    const data: SequenceData = [
      ['A', 'B', 'C', 'A', 'B'],
      ['A', 'B', 'C', 'A', 'B'],
    ];
    const strict = extractPatterns(data, { minCount: 5 });
    // Most patterns appear less than 5 times
    expect(strict.length).toBeLessThan(
      extractPatterns(data, { minCount: 1 }).length
    );
  });

  it('minSupport filter based on fraction of sequences', () => {
    const data: SequenceData = [
      ['A', 'B', 'C'],
      ['X', 'Y', 'Z'],
    ];
    // A->B only in first sequence → support = 0.5
    const results = extractPatterns(data, { minCount: 1, minSupport: 0.6 });
    expect(results.find(r => r.pattern === 'A->B')).toBeUndefined();

    const allResults = extractPatterns(data, { minCount: 1, minSupport: 0.4 });
    expect(allResults.find(r => r.pattern === 'A->B')).toBeDefined();
  });

  it('support = fraction of sequences containing pattern', () => {
    const data: SequenceData = [
      ['A', 'B', 'C'],
      ['A', 'B', 'D'],
      ['X', 'Y', 'Z'],
    ];
    const results = extractPatterns(data, { minCount: 1 });
    const ab = results.find(r => r.pattern === 'A->B');
    expect(ab).toBeDefined();
    expect(ab!.support).toBeCloseTo(2 / 3, 10); // present in 2 of 3 sequences
  });

  it('frequency = count / totalWindows', () => {
    const data: SequenceData = [['A', 'B', 'C']];
    // bigrams: A->B, B->C (2 windows); trigrams: A->B->C (1 window); totalWindows=3
    const results = extractPatterns(data, { minCount: 1 });
    const ab = results.find(r => r.pattern === 'A->B');
    expect(ab!.frequency).toBeCloseTo(1 / 3, 10);
  });

  it('empty data returns empty results', () => {
    const results = extractPatterns([], { minCount: 1 });
    expect(results).toEqual([]);
  });

  it('minN > maxN returns empty results', () => {
    const data: SequenceData = [['A', 'B', 'C']];
    const results = extractPatterns(data, { minN: 5, maxN: 2 });
    expect(results).toEqual([]);
  });

  it('results sorted by count descending', () => {
    const data: SequenceData = [
      ['A', 'B', 'A', 'B', 'A', 'B'],
      ['C', 'D', 'C', 'D', 'C', 'D'],
    ];
    const results = extractPatterns(data, { minCount: 1 });
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.count).toBeLessThanOrEqual(results[i - 1]!.count);
    }
  });

  it('handles sequences with nulls', () => {
    const data: SequenceData = [['A', null, 'B', null, 'C']];
    const results = extractPatterns(data, { minCount: 1 });
    // Effective sequence: A, B, C → bigrams A->B, B->C; trigram A->B->C
    const ab = results.find(r => r.pattern === 'A->B');
    expect(ab).toBeDefined();
  });

  it('custom minN/maxN works', () => {
    const data: SequenceData = [['A', 'B', 'C', 'D', 'E']];
    const bigramsOnly = extractPatterns(data, { minN: 2, maxN: 2, minCount: 1 });
    for (const r of bigramsOnly) {
      expect(r.pattern.split('->').length).toBe(2);
    }
  });
});

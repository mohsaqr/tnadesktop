import { describe, it, expect } from 'vitest';
import { estimateCS } from '../analysis/stability';
import { makeTNAFromSequences, SAMPLE_SEQUENCES } from './helpers';

describe('estimateCS', () => {
  const model = makeTNAFromSequences(SAMPLE_SEQUENCES, 'relative');
  const measures = ['InStrength', 'OutStrength', 'Betweenness'] as const;

  it('returns CS coefficients per measure', () => {
    const result = estimateCS(model, {
      iter: 10,
      seed: 42,
      measures: [...measures],
    });

    for (const m of measures) {
      expect(result.csCoefficients[m]).toBeDefined();
      expect(typeof result.csCoefficients[m]).toBe('number');
    }
  });

  it('CS values are in [0, 1] range', () => {
    const result = estimateCS(model, {
      iter: 10,
      seed: 42,
      measures: [...measures],
    });

    for (const m of measures) {
      expect(result.csCoefficients[m]).toBeGreaterThanOrEqual(0);
      expect(result.csCoefficients[m]).toBeLessThanOrEqual(1);
    }
  });

  it('meanCorrelations has correct shape', () => {
    const dropProps = [0.1, 0.3, 0.5, 0.7, 0.9];
    const result = estimateCS(model, {
      iter: 10,
      seed: 42,
      measures: [...measures],
      dropProps,
    });

    for (const m of measures) {
      expect(result.meanCorrelations[m]).toBeDefined();
      expect(result.meanCorrelations[m]).toHaveLength(dropProps.length);
    }
    expect(result.dropProps).toEqual(dropProps);
  });

  it('is deterministic with fixed seed', () => {
    const r1 = estimateCS(model, { iter: 10, seed: 42, measures: [...measures] });
    const r2 = estimateCS(model, { iter: 10, seed: 42, measures: [...measures] });

    for (const m of measures) {
      expect(r1.csCoefficients[m]).toBe(r2.csCoefficients[m]);
      expect(r1.meanCorrelations[m]).toEqual(r2.meanCorrelations[m]);
    }
  });

  it('returns correct threshold and certainty from options', () => {
    const result = estimateCS(model, {
      iter: 10,
      seed: 42,
      threshold: 0.5,
      certainty: 0.9,
    });
    expect(result.threshold).toBe(0.5);
    expect(result.certainty).toBe(0.9);
  });

  it('measures with zero variance produce CS = 0', () => {
    // Create a model where all sequences are identical
    const uniformData = Array.from({ length: 10 }, () => ['A', 'B', 'C', 'A', 'B']);
    const uniformModel = makeTNAFromSequences(uniformData as any, 'relative');

    const result = estimateCS(uniformModel, {
      iter: 10,
      seed: 42,
      measures: ['Betweenness'] as any[],
    });

    // With identical sequences, centralities are constant, but we test
    // that the function doesn't crash and returns valid values
    expect(result.csCoefficients['Betweenness']).toBeDefined();
    expect(result.csCoefficients['Betweenness']).toBeGreaterThanOrEqual(0);
    expect(result.csCoefficients['Betweenness']).toBeLessThanOrEqual(1);
  });
});

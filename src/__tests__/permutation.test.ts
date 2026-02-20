import { describe, it, expect } from 'vitest';
import { permutationTest } from '../analysis/permutation';
import { makeTNAFromSequences, SAMPLE_SEQUENCES, SAMPLE_SEQUENCES_2 } from './helpers';

describe('permutationTest', () => {
  const modelX = makeTNAFromSequences(SAMPLE_SEQUENCES, 'relative');
  const modelY = makeTNAFromSequences(SAMPLE_SEQUENCES_2, 'relative');
  const a = modelX.labels.length;

  it('returns correct structure', () => {
    const result = permutationTest(modelX, modelY, { iter: 20, seed: 42 });

    expect(result.edgeStats).toBeInstanceOf(Array);
    expect(result.edgeStats).toHaveLength(a * a); // all pairs reported
    expect(result.diffTrue).toBeInstanceOf(Float64Array);
    expect(result.diffTrue).toHaveLength(a * a);
    expect(result.diffSig).toBeInstanceOf(Float64Array);
    expect(result.diffSig).toHaveLength(a * a);
    expect(result.pValues).toBeInstanceOf(Float64Array);
    expect(result.pValues).toHaveLength(a * a);
    expect(result.labels).toEqual(modelX.labels);
    expect(result.nStates).toBe(a);
    expect(result.level).toBe(0.05);
  });

  it('is deterministic with fixed seed', () => {
    const r1 = permutationTest(modelX, modelY, { iter: 20, seed: 42 });
    const r2 = permutationTest(modelX, modelY, { iter: 20, seed: 42 });

    for (let i = 0; i < a * a; i++) {
      expect(r1.pValues[i]).toBe(r2.pValues[i]);
      expect(r1.diffTrue[i]).toBe(r2.diffTrue[i]);
    }
  });

  it('p-values are in [0, 1]', () => {
    const result = permutationTest(modelX, modelY, { iter: 20, seed: 42 });
    for (let i = 0; i < a * a; i++) {
      expect(result.pValues[i]).toBeGreaterThanOrEqual(0);
      expect(result.pValues[i]).toBeLessThanOrEqual(1);
    }
  });

  it('identical models produce large p-values', () => {
    const result = permutationTest(modelX, modelX, { iter: 20, seed: 42 });
    // True difference should be zero everywhere
    for (let i = 0; i < a * a; i++) {
      expect(result.diffTrue[i]).toBe(0);
    }
    // P-values should be large (no significant difference)
    let significantCount = 0;
    for (let i = 0; i < a * a; i++) {
      if (result.pValues[i]! < 0.05) significantCount++;
    }
    // Very few (if any) should be significant by chance
    expect(significantCount).toBeLessThanOrEqual(a); // generous bound
  });

  it('effectSize is computed (not all NaN)', () => {
    const result = permutationTest(modelX, modelY, { iter: 20, seed: 42 });
    let hasFiniteES = false;
    for (const stat of result.edgeStats) {
      if (!isNaN(stat.effectSize) && isFinite(stat.effectSize)) {
        hasFiniteES = true;
        break;
      }
    }
    expect(hasFiniteES).toBe(true);
  });

  it('diffSig is zero where p >= level', () => {
    const result = permutationTest(modelX, modelY, { iter: 20, seed: 42 });
    for (let i = 0; i < a * a; i++) {
      if (result.pValues[i]! >= result.level) {
        expect(result.diffSig[i]).toBe(0);
      }
    }
  });

  it('diffSig equals diffTrue where p < level', () => {
    const result = permutationTest(modelX, modelY, { iter: 20, seed: 42 });
    for (let i = 0; i < a * a; i++) {
      if (result.pValues[i]! < result.level) {
        expect(result.diffSig[i]).toBe(result.diffTrue[i]);
      }
    }
  });

  it('edge stats have correct from/to labels', () => {
    const result = permutationTest(modelX, modelY, { iter: 20, seed: 42 });
    const labelSet = new Set(modelX.labels);
    for (const stat of result.edgeStats) {
      expect(labelSet.has(stat.from)).toBe(true);
      expect(labelSet.has(stat.to)).toBe(true);
    }
  });
});

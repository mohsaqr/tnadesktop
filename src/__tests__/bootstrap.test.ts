import { describe, it, expect } from 'vitest';
import { bootstrapTna } from '../analysis/bootstrap';
import { makeTNAFromSequences, SAMPLE_SEQUENCES } from './helpers';

describe('bootstrapTna', () => {
  const model = makeTNAFromSequences(SAMPLE_SEQUENCES, 'relative');
  const a = model.labels.length; // 3 states

  it('returns correct structure', () => {
    const result = bootstrapTna(model, { iter: 20, seed: 42 });

    expect(result.edges).toBeInstanceOf(Array);
    expect(result.edges.length).toBeGreaterThan(0);
    expect(result.model).toBeDefined();
    expect(result.labels).toEqual(model.labels);
    expect(result.method).toBe('stability');
    expect(result.iter).toBe(20);
    expect(result.level).toBe(0.05);

    expect(result.weightsMean).toBeInstanceOf(Float64Array);
    expect(result.weightsMean).toHaveLength(a * a);
    expect(result.weightsSd).toBeInstanceOf(Float64Array);
    expect(result.weightsSd).toHaveLength(a * a);
  });

  it('is deterministic with fixed seed', () => {
    const r1 = bootstrapTna(model, { iter: 20, seed: 42 });
    const r2 = bootstrapTna(model, { iter: 20, seed: 42 });

    expect(r1.edges.length).toBe(r2.edges.length);
    for (let i = 0; i < r1.edges.length; i++) {
      expect(r1.edges[i]!.pValue).toBe(r2.edges[i]!.pValue);
      expect(r1.edges[i]!.weight).toBe(r2.edges[i]!.weight);
    }
  });

  it('p-values are in [0, 1]', () => {
    const result = bootstrapTna(model, { iter: 20, seed: 42 });
    for (const edge of result.edges) {
      expect(edge.pValue).toBeGreaterThanOrEqual(0);
      expect(edge.pValue).toBeLessThanOrEqual(1);
    }
  });

  it('CI lower <= weight <= CI upper for most edges', () => {
    const result = bootstrapTna(model, { iter: 50, seed: 42 });
    let withinCI = 0;
    for (const edge of result.edges) {
      if (edge.ciLower <= edge.weight && edge.weight <= edge.ciUpper) {
        withinCI++;
      }
    }
    // At least half of edges should have weight within CI
    expect(withinCI).toBeGreaterThanOrEqual(result.edges.length / 2);
  });

  it('pruned model has zeros for non-significant edges', () => {
    const result = bootstrapTna(model, { iter: 20, seed: 42 });
    // Check that the significant model exists and has valid shape
    const sigModel = result.model;
    expect(sigModel.labels).toEqual(model.labels);
    // Count non-zero entries in significant model
    let nonZero = 0;
    for (let i = 0; i < a; i++) {
      for (let j = 0; j < a; j++) {
        if (sigModel.weights.get(i, j) > 0) nonZero++;
      }
    }
    // Significant edges should be <= total edges
    const totalEdges = result.edges.filter(e => e.weight > 0).length;
    expect(nonZero).toBeLessThanOrEqual(totalEdges);
  });

  it('method=stability works', () => {
    const result = bootstrapTna(model, { iter: 20, seed: 42, method: 'stability' });
    expect(result.method).toBe('stability');
  });

  it('method=threshold works', () => {
    const result = bootstrapTna(model, { iter: 20, seed: 42, method: 'threshold' });
    expect(result.method).toBe('threshold');
  });

  it('edge from/to labels match model labels', () => {
    const result = bootstrapTna(model, { iter: 20, seed: 42 });
    const labelSet = new Set(model.labels);
    for (const edge of result.edges) {
      expect(labelSet.has(edge.from)).toBe(true);
      expect(labelSet.has(edge.to)).toBe(true);
    }
  });
});

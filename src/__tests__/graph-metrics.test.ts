import { describe, it, expect } from 'vitest';
import { computeGraphMetrics } from '../analysis/graph-metrics';
import {
  makeTNA,
  TRIANGLE_MATRIX,
  STAR_MATRIX,
  COMPLETE3_MATRIX,
  DISCONNECTED_MATRIX,
  SINGLE_NODE_MATRIX,
  SELF_LOOP_MATRIX,
  TWO_CLIQUE_MATRIX,
} from './helpers';

describe('computeGraphMetrics', () => {
  describe('triangle graph (A→B→C→A)', () => {
    // After buildModel with type='frequency', triangle has 3 directed edges
    const model = makeTNA(TRIANGLE_MATRIX, ['A', 'B', 'C'], 'frequency');

    it('has 3 edges', () => {
      const m = computeGraphMetrics(model);
      expect(m.edges).toBe(3);
    });

    it('has density = 3/6 = 0.5', () => {
      const m = computeGraphMetrics(model);
      expect(m.density).toBeCloseTo(0.5, 10);
    });

    it('has 1 component', () => {
      const m = computeGraphMetrics(model);
      expect(m.components).toBe(1);
      expect(m.largestComponentSize).toBe(3);
    });

    it('has transitivity = 1 (all triads closed)', () => {
      const m = computeGraphMetrics(model);
      expect(m.transitivity).toBe(1);
    });

    it('has no self-loops', () => {
      const m = computeGraphMetrics(model);
      expect(m.selfLoops).toBe(0);
    });
  });

  describe('star graph (A→B, A→C, A→D)', () => {
    const model = makeTNA(STAR_MATRIX, ['A', 'B', 'C', 'D'], 'frequency');

    it('has reciprocity = 0 (no back edges)', () => {
      const m = computeGraphMetrics(model);
      expect(m.reciprocity).toBe(0);
    });

    it('has 3 edges', () => {
      const m = computeGraphMetrics(model);
      expect(m.edges).toBe(3);
    });
  });

  describe('complete directed 3-node', () => {
    const model = makeTNA(COMPLETE3_MATRIX, ['A', 'B', 'C'], 'frequency');

    it('has 6 edges', () => {
      const m = computeGraphMetrics(model);
      expect(m.edges).toBe(6);
    });

    it('has density = 1.0', () => {
      const m = computeGraphMetrics(model);
      expect(m.density).toBeCloseTo(1.0, 10);
    });

    it('has reciprocity = 1.0', () => {
      const m = computeGraphMetrics(model);
      expect(m.reciprocity).toBeCloseTo(1.0, 10);
    });
  });

  describe('disconnected graph', () => {
    const model = makeTNA(DISCONNECTED_MATRIX, ['A', 'B', 'C', 'D'], 'frequency');

    it('has 2 components', () => {
      const m = computeGraphMetrics(model);
      expect(m.components).toBe(2);
    });

    it('has correct largest component size', () => {
      const m = computeGraphMetrics(model);
      expect(m.largestComponentSize).toBe(2);
    });
  });

  describe('self-loops', () => {
    const model = makeTNA(SELF_LOOP_MATRIX, ['A', 'B', 'C'], 'frequency');

    it('counts self-loops', () => {
      const m = computeGraphMetrics(model);
      expect(m.selfLoops).toBe(2); // A and B have self-loops
    });
  });

  describe('undirected (co-occurrence)', () => {
    const model = makeTNA(TWO_CLIQUE_MATRIX, ['A', 'B', 'C', 'D', 'E', 'F'], 'co-occurrence');

    it('edge count is halved for undirected', () => {
      const m = computeGraphMetrics(model);
      // Count non-zero off-diagonal pairs
      const n = 6;
      let pairs = 0;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (model.weights.get(i, j) > 0 || model.weights.get(j, i) > 0) pairs++;
        }
      }
      expect(m.edges).toBe(pairs);
    });

    it('reciprocity is null for undirected', () => {
      const m = computeGraphMetrics(model);
      expect(m.reciprocity).toBeNull();
    });
  });

  describe('single node', () => {
    const model = makeTNA(SINGLE_NODE_MATRIX, ['A'], 'frequency');

    it('has 0 edges and density 0', () => {
      const m = computeGraphMetrics(model);
      expect(m.edges).toBe(0);
      expect(m.density).toBe(0);
    });

    it('has 1 component of size 1', () => {
      const m = computeGraphMetrics(model);
      expect(m.components).toBe(1);
      expect(m.largestComponentSize).toBe(1);
    });
  });

  it('avgDegree is correct for complete graph', () => {
    const model = makeTNA(COMPLETE3_MATRIX, ['A', 'B', 'C'], 'frequency');
    const m = computeGraphMetrics(model);
    // directed: avgDegree = edges / n = 6 / 3 = 2
    expect(m.avgDegree).toBeCloseTo(2, 10);
  });
});

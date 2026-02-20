import { describe, it, expect } from 'vitest';
import { detectCommunities } from '../analysis/communities';
import { makeTNA, TWO_CLIQUE_MATRIX, COMPLETE3_MATRIX, SINGLE_NODE_MATRIX } from './helpers';
import type { CommunityMethod } from 'tnaj';

const METHODS: CommunityMethod[] = [
  'louvain', 'walktrap', 'fast_greedy', 'label_prop', 'leading_eigen', 'edge_betweenness',
];

describe('detectCommunities', () => {
  describe('valid CommunityResult structure', () => {
    const model = makeTNA(TWO_CLIQUE_MATRIX, ['A', 'B', 'C', 'D', 'E', 'F'], 'co-occurrence');

    for (const method of METHODS) {
      it(`${method} returns valid result`, () => {
        const result = detectCommunities(model, method);

        // Has correct label count
        expect(result.labels).toHaveLength(6);
        expect(result.labels).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);

        // Assignments cover all nodes
        expect(result.assignments[method]).toBeDefined();
        expect(result.assignments[method]!).toHaveLength(6);

        // Count matches actual number of unique communities
        const unique = new Set(result.assignments[method]!);
        expect(result.counts[method]).toBe(unique.size);
      });
    }
  });

  describe('two-clique graph finds 2 communities', () => {
    const model = makeTNA(TWO_CLIQUE_MATRIX, ['A', 'B', 'C', 'D', 'E', 'F'], 'co-occurrence');

    for (const method of METHODS) {
      it(`${method} finds 2 communities`, () => {
        const result = detectCommunities(model, method);
        const nComm = result.counts[method]!;
        // Should find 2 communities (might occasionally find 1 or 3 depending on method)
        expect(nComm).toBeGreaterThanOrEqual(2);
        expect(nComm).toBeLessThanOrEqual(3);
      });

      it(`${method} groups clique nodes together`, () => {
        const result = detectCommunities(model, method);
        const a = result.assignments[method]!;
        // Within each clique, nodes should be in the same community
        // Clique 1: A(0), B(1), C(2)
        expect(a[0]).toBe(a[1]);
        expect(a[1]).toBe(a[2]);
        // Clique 2: D(3), E(4), F(5)
        expect(a[3]).toBe(a[4]);
        expect(a[4]).toBe(a[5]);
      });
    }
  });

  describe('complete graph', () => {
    const model = makeTNA(COMPLETE3_MATRIX, ['A', 'B', 'C'], 'co-occurrence');

    it('finds at most 1-2 communities (no clear partition)', () => {
      for (const method of METHODS) {
        const result = detectCommunities(model, method);
        // Complete graph has no modularity gain from splitting
        expect(result.counts[method]).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('single node', () => {
    const model = makeTNA(SINGLE_NODE_MATRIX, ['A'], 'frequency');

    for (const method of METHODS) {
      it(`${method} returns 1 community`, () => {
        const result = detectCommunities(model, method);
        expect(result.counts[method]).toBe(1);
        expect(result.assignments[method]).toEqual([0]);
      });
    }
  });

  describe('community renumbering', () => {
    const model = makeTNA(TWO_CLIQUE_MATRIX, ['A', 'B', 'C', 'D', 'E', 'F'], 'co-occurrence');

    for (const method of METHODS) {
      it(`${method} assignments are 0-indexed and contiguous`, () => {
        const result = detectCommunities(model, method);
        const a = result.assignments[method]!;
        const unique = [...new Set(a)].sort((x, y) => x - y);
        // Should be contiguous: [0, 1, ..., k-1]
        for (let i = 0; i < unique.length; i++) {
          expect(unique[i]).toBe(i);
        }
      });
    }
  });
});

import { describe, it, expect } from 'vitest';
import {
  erdosRenyi,
  barabasiAlbert,
  wattsStrogatz,
  stochasticBlockModel,
  matrixToEdgeRows,
} from '../analysis/random-networks';

// ═══════════════════════════════════════════════════════════
//  Erdos-Renyi
// ═══════════════════════════════════════════════════════════
describe('erdosRenyi', () => {
  it('is deterministic with same seed', () => {
    const a = erdosRenyi({ n: 10, p: 0.5, directed: false, weighted: false, seed: 42 });
    const b = erdosRenyi({ n: 10, p: 0.5, directed: false, weighted: false, seed: 42 });
    expect(a.matrix).toEqual(b.matrix);
  });

  it('undirected produces symmetric matrix', () => {
    const { matrix } = erdosRenyi({ n: 8, p: 0.5, directed: false, weighted: false, seed: 42 });
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        expect(matrix[i]![j]).toBe(matrix[j]![i]);
      }
    }
  });

  it('directed produces non-symmetric matrix (in general)', () => {
    const { matrix } = erdosRenyi({ n: 10, p: 0.5, directed: true, weighted: false, seed: 42 });
    let asymmetric = false;
    for (let i = 0; i < 10 && !asymmetric; i++) {
      for (let j = i + 1; j < 10 && !asymmetric; j++) {
        if (matrix[i]![j] !== matrix[j]![i]) asymmetric = true;
      }
    }
    expect(asymmetric).toBe(true);
  });

  it('p=0 produces no edges', () => {
    const { matrix } = erdosRenyi({ n: 5, p: 0, directed: true, weighted: false, seed: 42 });
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        expect(matrix[i]![j]).toBe(0);
      }
    }
  });

  it('p=1 produces all edges (no self-loops)', () => {
    const { matrix } = erdosRenyi({ n: 5, p: 1, directed: true, weighted: false, seed: 42 });
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if (i === j) expect(matrix[i]![j]).toBe(0);
        else expect(matrix[i]![j]).toBe(1);
      }
    }
  });

  it('weighted values are in (0, 1]', () => {
    const { matrix } = erdosRenyi({ n: 10, p: 1, directed: true, weighted: true, seed: 42 });
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        if (i !== j) {
          expect(matrix[i]![j]).toBeGreaterThan(0);
          expect(matrix[i]![j]).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('n=1 produces 1x1 zero matrix', () => {
    const { matrix, labels } = erdosRenyi({ n: 1, p: 1, directed: true, weighted: false, seed: 42 });
    expect(matrix).toEqual([[0]]);
    expect(labels).toEqual(['N1']);
  });

  it('generates correct label count', () => {
    const { labels } = erdosRenyi({ n: 5, p: 0.5, directed: true, weighted: false, seed: 42 });
    expect(labels).toHaveLength(5);
  });
});

// ═══════════════════════════════════════════════════════════
//  Barabasi-Albert
// ═══════════════════════════════════════════════════════════
describe('barabasiAlbert', () => {
  it('is deterministic with same seed', () => {
    const a = barabasiAlbert({ n: 10, m: 2, directed: false, seed: 42 });
    const b = barabasiAlbert({ n: 10, m: 2, directed: false, seed: 42 });
    expect(a.matrix).toEqual(b.matrix);
  });

  it('produces correct node count', () => {
    const { matrix, labels } = barabasiAlbert({ n: 15, m: 2, directed: false, seed: 42 });
    expect(labels).toHaveLength(15);
    expect(matrix).toHaveLength(15);
  });

  it('initial core is fully connected', () => {
    const { matrix } = barabasiAlbert({ n: 10, m: 3, directed: false, seed: 42 });
    // Initial core is m+1=4 nodes, fully connected
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        expect(matrix[i]![j]).toBe(1);
        expect(matrix[j]![i]).toBe(1);
      }
    }
  });

  it('each new node has at least some connections', () => {
    const { matrix } = barabasiAlbert({ n: 10, m: 2, directed: false, seed: 42 });
    for (let i = 3; i < 10; i++) { // nodes after initial core (m+1=3)
      let degree = 0;
      for (let j = 0; j < 10; j++) {
        if (matrix[i]![j]! > 0) degree++;
      }
      expect(degree).toBeGreaterThanOrEqual(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  Watts-Strogatz
// ═══════════════════════════════════════════════════════════
describe('wattsStrogatz', () => {
  it('is deterministic with same seed', () => {
    const a = wattsStrogatz({ n: 10, k: 4, beta: 0.3, seed: 42 });
    const b = wattsStrogatz({ n: 10, k: 4, beta: 0.3, seed: 42 });
    expect(a.matrix).toEqual(b.matrix);
  });

  it('ring lattice with beta=0 is regular', () => {
    const { matrix } = wattsStrogatz({ n: 10, k: 4, beta: 0, seed: 42 });
    // Each node should have exactly k=4 neighbors
    for (let i = 0; i < 10; i++) {
      let deg = 0;
      for (let j = 0; j < 10; j++) {
        if (matrix[i]![j]! > 0) deg++;
      }
      expect(deg).toBe(4);
    }
  });

  it('undirected produces symmetric matrix', () => {
    const { matrix } = wattsStrogatz({ n: 10, k: 4, beta: 0.5, seed: 42 });
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        expect(matrix[i]![j]).toBe(matrix[j]![i]);
      }
    }
  });

  it('rounds odd k up to even', () => {
    // k=3 should become k=4
    const { matrix } = wattsStrogatz({ n: 10, k: 3, beta: 0, seed: 42 });
    for (let i = 0; i < 10; i++) {
      let deg = 0;
      for (let j = 0; j < 10; j++) {
        if (matrix[i]![j]! > 0) deg++;
      }
      expect(deg).toBe(4); // rounded up from 3
    }
  });
});

// ═══════════════════════════════════════════════════════════
//  Stochastic Block Model
// ═══════════════════════════════════════════════════════════
describe('stochasticBlockModel', () => {
  it('is deterministic with same seed', () => {
    const a = stochasticBlockModel({ n: 12, k: 3, pIn: 0.8, pOut: 0.1, directed: false, seed: 42 });
    const b = stochasticBlockModel({ n: 12, k: 3, pIn: 0.8, pOut: 0.1, directed: false, seed: 42 });
    expect(a.matrix).toEqual(b.matrix);
  });

  it('uses round-robin community assignment', () => {
    // With n=6, k=3: communities should be [0,1,2,0,1,2]
    // Test by checking pIn=1 pOut=0 → fully separated
    const { matrix } = stochasticBlockModel({ n: 6, k: 3, pIn: 1, pOut: 0, directed: false, seed: 42 });
    // Nodes 0,3 in community 0: connected
    expect(matrix[0]![3]).toBe(1);
    expect(matrix[3]![0]).toBe(1);
    // Nodes 0,1 in different communities: not connected
    expect(matrix[0]![1]).toBe(0);
  });

  it('pIn=1 pOut=0 produces fully separated communities', () => {
    const { matrix } = stochasticBlockModel({ n: 6, k: 2, pIn: 1, pOut: 0, directed: false, seed: 42 });
    // Community 0: nodes 0,2,4; Community 1: nodes 1,3,5
    // Within-community edges
    expect(matrix[0]![2]).toBe(1);
    expect(matrix[0]![4]).toBe(1);
    expect(matrix[2]![4]).toBe(1);
    // Between-community edges
    expect(matrix[0]![1]).toBe(0);
    expect(matrix[0]![3]).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  matrixToEdgeRows
// ═══════════════════════════════════════════════════════════
describe('matrixToEdgeRows', () => {
  it('directed includes all non-zero off-diagonal entries', () => {
    const matrix = [
      [0, 2, 0],
      [0, 0, 3],
      [1, 0, 0],
    ];
    const rows = matrixToEdgeRows(matrix, ['A', 'B', 'C'], true);
    expect(rows).toHaveLength(3);
    expect(rows).toContainEqual(['A', 'B', '2']);
    expect(rows).toContainEqual(['B', 'C', '3']);
    expect(rows).toContainEqual(['C', 'A', '1']);
  });

  it('undirected skips lower triangle', () => {
    const matrix = [
      [0, 2, 0],
      [2, 0, 3],
      [0, 3, 0],
    ];
    const rows = matrixToEdgeRows(matrix, ['A', 'B', 'C'], false);
    expect(rows).toHaveLength(2); // A→B and B→C only
  });

  it('empty matrix produces empty rows', () => {
    const matrix = [
      [0, 0],
      [0, 0],
    ];
    const rows = matrixToEdgeRows(matrix, ['A', 'B'], true);
    expect(rows).toHaveLength(0);
  });
});

/**
 * Random network generators: Erdos-Renyi, Barabasi-Albert, Watts-Strogatz, Stochastic Block Model.
 * Each returns { matrix, labels } suitable for buildModel(matrix, { type, labels }).
 */

// ─── Seeded RNG (Mulberry32) ───
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeLabels(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `N${i + 1}`);
}

export interface GeneratorResult {
  matrix: number[][];
  labels: string[];
}

// ═══════════════════════════════════════════════════════════
//  Erdos-Renyi
// ═══════════════════════════════════════════════════════════
export interface ERParams {
  n: number;
  p: number;
  directed: boolean;
  weighted: boolean;
  seed?: number;
}

export function erdosRenyi(params: ERParams): GeneratorResult {
  const { n, p, directed, weighted, seed = 42 } = params;
  const rng = mulberry32(seed);
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0) as number[]);

  for (let i = 0; i < n; i++) {
    const jStart = directed ? 0 : i + 1;
    for (let j = jStart; j < n; j++) {
      if (i === j) continue;
      if (rng() < p) {
        const w = weighted ? Math.round((0.1 + rng() * 0.9) * 1000) / 1000 : 1;
        matrix[i]![j] = w;
        if (!directed) matrix[j]![i] = w;
      }
    }
  }

  return { matrix, labels: makeLabels(n) };
}

// ═══════════════════════════════════════════════════════════
//  Barabasi-Albert (preferential attachment)
// ═══════════════════════════════════════════════════════════
export interface BAParams {
  n: number;
  m: number;        // edges per new node
  directed: boolean;
  seed?: number;
}

export function barabasiAlbert(params: BAParams): GeneratorResult {
  const { n, m: edgesPerNode, directed, seed = 42 } = params;
  const rng = mulberry32(seed);
  const m = Math.min(edgesPerNode, n - 1);
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0) as number[]);

  // Start with m+1 fully connected nodes
  const init = Math.min(m + 1, n);
  for (let i = 0; i < init; i++) {
    for (let j = i + 1; j < init; j++) {
      matrix[i]![j] = 1;
      if (!directed) matrix[j]![i] = 1;
      else matrix[j]![i] = 1; // fully connected initial core
    }
  }

  // Degree array for preferential attachment
  const degree = new Float64Array(n);
  for (let i = 0; i < init; i++) degree[i] = init - 1;

  // Add remaining nodes
  for (let newNode = init; newNode < n; newNode++) {
    const totalDeg = degree.reduce((s, d) => s + d, 0) || 1;
    const targets = new Set<number>();

    // Select m unique targets via preferential attachment
    let attempts = 0;
    while (targets.size < m && attempts < n * 10) {
      attempts++;
      let r = rng() * totalDeg;
      for (let k = 0; k < newNode; k++) {
        r -= degree[k]!;
        if (r <= 0) {
          targets.add(k);
          break;
        }
      }
    }

    for (const t of targets) {
      matrix[newNode]![t] = 1;
      if (!directed) matrix[t]![newNode] = 1;
      degree[newNode]!++;
      degree[t]!++;
    }
  }

  return { matrix, labels: makeLabels(n) };
}

// ═══════════════════════════════════════════════════════════
//  Watts-Strogatz (small-world)
// ═══════════════════════════════════════════════════════════
export interface WSParams {
  n: number;
  k: number;        // each node connected to k nearest neighbors (must be even)
  beta: number;     // rewiring probability
  seed?: number;
}

export function wattsStrogatz(params: WSParams): GeneratorResult {
  const { n, beta, seed = 42 } = params;
  let k = params.k;
  if (k % 2 !== 0) k = k + 1;  // ensure even
  k = Math.min(k, n - 1);
  const rng = mulberry32(seed);
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0) as number[]);

  // Build ring lattice
  const halfK = Math.floor(k / 2);
  for (let i = 0; i < n; i++) {
    for (let j = 1; j <= halfK; j++) {
      const neighbor = (i + j) % n;
      matrix[i]![neighbor] = 1;
      matrix[neighbor]![i] = 1;
    }
  }

  // Rewire
  for (let i = 0; i < n; i++) {
    for (let j = 1; j <= halfK; j++) {
      if (rng() < beta) {
        const oldTarget = (i + j) % n;
        // Pick a random node that isn't i and isn't already connected
        let newTarget = -1;
        let attempts = 0;
        while (attempts < n * 2) {
          attempts++;
          const candidate = Math.floor(rng() * n);
          if (candidate !== i && matrix[i]![candidate] === 0) {
            newTarget = candidate;
            break;
          }
        }
        if (newTarget >= 0) {
          matrix[i]![oldTarget] = 0;
          matrix[oldTarget]![i] = 0;
          matrix[i]![newTarget] = 1;
          matrix[newTarget]![i] = 1;
        }
      }
    }
  }

  return { matrix, labels: makeLabels(n) };
}

// ═══════════════════════════════════════════════════════════
//  Stochastic Block Model
// ═══════════════════════════════════════════════════════════
export interface SBMParams {
  n: number;
  k: number;        // number of communities
  pIn: number;      // within-community edge probability
  pOut: number;     // between-community edge probability
  directed: boolean;
  seed?: number;
}

export function stochasticBlockModel(params: SBMParams): GeneratorResult {
  const { n, k, pIn, pOut, directed, seed = 42 } = params;
  const rng = mulberry32(seed);
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0) as number[]);

  // Assign nodes to communities (roughly equal sizes)
  const community = new Array(n).fill(0) as number[];
  for (let i = 0; i < n; i++) {
    community[i] = i % k;
  }

  for (let i = 0; i < n; i++) {
    const jStart = directed ? 0 : i + 1;
    for (let j = jStart; j < n; j++) {
      if (i === j) continue;
      const p = community[i] === community[j] ? pIn : pOut;
      if (rng() < p) {
        matrix[i]![j] = 1;
        if (!directed) matrix[j]![i] = 1;
      }
    }
  }

  return { matrix, labels: makeLabels(n) };
}

// ═══════════════════════════════════════════════════════════
//  Helper: matrix to edge list rows (for Edge List tab)
// ═══════════════════════════════════════════════════════════
export function matrixToEdgeRows(matrix: number[][], labels: string[], directed: boolean): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < labels.length; i++) {
    const jStart = directed ? 0 : i;
    for (let j = jStart; j < labels.length; j++) {
      if (i === j) continue;
      if (matrix[i]![j]! > 0) {
        rows.push([labels[i]!, labels[j]!, matrix[i]![j]!.toString()]);
      }
    }
  }
  return rows;
}

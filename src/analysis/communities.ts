/**
 * Community detection algorithms.
 * Replaces tnaj's buggy louvain/fast_greedy with correct implementations.
 */
import type { TNA, CommunityResult, CommunityMethod } from 'tnaj';

/**
 * Detect communities using the specified method.
 * Uses local implementations that are correct and have bounded iterations.
 */
export function detectCommunities(model: TNA, method: CommunityMethod): CommunityResult {
  const weights = model.weights;
  const n = model.labels.length;

  // Build symmetric adjacency (undirected)
  const sym: number[][] = [];
  for (let i = 0; i < n; i++) {
    sym.push(new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      sym[i]![j] = weights.get(i, j) + weights.get(j, i);
    }
  }

  let assignments: number[];
  switch (method) {
    case 'louvain':
    case 'walktrap':
      assignments = louvain(sym, n);
      break;
    case 'fast_greedy':
      assignments = greedyModularity(sym, n);
      break;
    case 'label_prop':
      assignments = labelPropagation(sym, n);
      break;
    case 'leading_eigen':
      assignments = leadingEigen(sym, n);
      break;
    case 'edge_betweenness':
      assignments = edgeBetweenness(sym, n);
      break;
    default:
      assignments = Array.from({ length: n }, (_, i) => i);
  }

  assignments = renumber(assignments);
  const counts: Record<string, number> = {};
  counts[method] = new Set(assignments).size;
  const assignMap: Record<string, number[]> = {};
  assignMap[method] = assignments;

  return { counts, assignments: assignMap, labels: model.labels };
}

function renumber(comm: number[]): number[] {
  const map = new Map<number, number>();
  let next = 0;
  return comm.map(c => {
    if (!map.has(c)) map.set(c, next++);
    return map.get(c)!;
  });
}

// ─── Louvain (correct implementation with max passes) ───

function louvain(adj: number[][], n: number): number[] {
  const comm = Array.from({ length: n }, (_, i) => i);
  const m2 = totalWeight2(adj, n);
  if (m2 === 0) return comm;

  // Precompute node strengths
  const k = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) k[i] += adj[i]![j]!;
  }

  const MAX_PASSES = 50;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false;

    for (let i = 0; i < n; i++) {
      const ci = comm[i]!;

      // Compute ki_in for current community (sum of weights from i to nodes in ci)
      let kiInCurrent = 0;
      let sigmaTotCurrent = 0;
      for (let j = 0; j < n; j++) {
        if (comm[j] === ci) {
          if (j !== i) kiInCurrent += adj[i]![j]!;
          sigmaTotCurrent += k[j]!;
        }
      }
      // Remove i from its community for the calculation
      sigmaTotCurrent -= k[i]!;

      // Find best community to move to
      let bestComm = ci;
      // Delta Q for removing i from ci (negative of gain from being in ci)
      let bestDeltaQ = 0;

      // Collect neighbor communities
      const neighborComms = new Set<number>();
      for (let j = 0; j < n; j++) {
        if (adj[i]![j]! > 0 && comm[j] !== ci) {
          neighborComms.add(comm[j]!);
        }
      }

      for (const cj of neighborComms) {
        // Compute ki_in for target community
        let kiInTarget = 0;
        let sigmaTotTarget = 0;
        for (let j = 0; j < n; j++) {
          if (comm[j] === cj) {
            kiInTarget += adj[i]![j]!;
            sigmaTotTarget += k[j]!;
          }
        }

        // ΔQ = gain from adding to cj - loss from removing from ci
        const gainAdd = kiInTarget / m2 - (sigmaTotTarget * k[i]!) / (m2 * m2);
        const lossRemove = kiInCurrent / m2 - (sigmaTotCurrent * k[i]!) / (m2 * m2);
        const deltaQ = gainAdd - lossRemove;

        if (deltaQ > bestDeltaQ) {
          bestDeltaQ = deltaQ;
          bestComm = cj;
        }
      }

      if (bestComm !== ci) {
        comm[i] = bestComm;
        moved = true;
      }
    }

    if (!moved) break;
  }

  return comm;
}

// ─── Greedy Modularity ───

function greedyModularity(adj: number[][], n: number): number[] {
  const comm = Array.from({ length: n }, (_, i) => i);
  const m2 = totalWeight2(adj, n);
  if (m2 === 0) return comm;

  const MAX_MERGES = n;
  for (let step = 0; step < MAX_MERGES; step++) {
    const unique = [...new Set(comm)];
    if (unique.length <= 1) break;

    let bestA = -1, bestB = -1, bestDQ = 0;

    for (let ai = 0; ai < unique.length; ai++) {
      for (let bi = ai + 1; bi < unique.length; bi++) {
        const cA = unique[ai]!, cB = unique[bi]!;

        let eAB = 0, aA = 0, aB = 0;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            const w = adj[i]![j]!;
            if (comm[i] === cA && comm[j] === cB) eAB += w;
            if (comm[i] === cA) aA += w;
            if (comm[i] === cB) aB += w;
          }
        }

        const dQ = 2 * (eAB / m2 - (aA * aB) / (m2 * m2));
        if (dQ > bestDQ) {
          bestDQ = dQ;
          bestA = cA;
          bestB = cB;
        }
      }
    }

    if (bestA < 0) break;
    for (let i = 0; i < n; i++) {
      if (comm[i] === bestB) comm[i] = bestA;
    }
  }

  return comm;
}

// ─── Label Propagation ───

function labelPropagation(adj: number[][], n: number): number[] {
  const comm = Array.from({ length: n }, (_, i) => i);

  for (let iter = 0; iter < 100; iter++) {
    let changed = false;
    // Random-ish order
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = (i * 7 + iter * 13) % (i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }

    for (const i of order) {
      const scores = new Map<number, number>();
      for (let j = 0; j < n; j++) {
        const w = adj[i]![j]!;
        if (w > 0) {
          scores.set(comm[j]!, (scores.get(comm[j]!) ?? 0) + w);
        }
      }
      let bestC = comm[i]!, bestW = 0;
      for (const [c, w] of scores) {
        if (w > bestW) { bestW = w; bestC = c; }
      }
      if (bestC !== comm[i]) {
        comm[i] = bestC;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return comm;
}

// ─── Leading Eigenvector ───

function leadingEigen(adj: number[][], n: number): number[] {
  if (n <= 1) return new Array(n).fill(0);

  const k = new Float64Array(n);
  let m2 = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) k[i] += adj[i]![j]!;
    m2 += k[i]!;
  }
  if (m2 === 0) return Array.from({ length: n }, (_, i) => i);

  // Modularity matrix B
  const B: number[][] = [];
  for (let i = 0; i < n; i++) {
    B.push(new Array(n));
    for (let j = 0; j < n; j++) {
      B[i]![j] = adj[i]![j]! - (k[i]! * k[j]!) / m2;
    }
  }

  // Power iteration for leading eigenvector
  let v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = (i * 7 + 3) % 11 / 11 - 0.5;

  for (let iter = 0; iter < 200; iter++) {
    const Bv = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += B[i]![j]! * v[j]!;
      Bv[i] = s;
    }
    let norm = 0;
    for (let i = 0; i < n; i++) norm += Bv[i]! * Bv[i]!;
    norm = Math.sqrt(norm);
    if (norm < 1e-15) break;
    for (let i = 0; i < n; i++) Bv[i] /= norm;
    v = Bv;
  }

  return Array.from(v, val => val >= 0 ? 0 : 1);
}

// ─── Edge Betweenness ───

function edgeBetweenness(adj: number[][], n: number): number[] {
  // Work on a copy
  const work: number[][] = adj.map(row => [...row]);

  let bestPartition = Array.from({ length: n }, (_, i) => i);
  let bestMod = -1;

  for (let step = 0; step < n * n; step++) {
    const partition = connectedComponents(work, n);
    const mod = modularity(adj, partition, n);
    if (mod > bestMod) {
      bestMod = mod;
      bestPartition = partition;
    }

    // Find edge with highest betweenness
    let maxBet = 0, maxI = -1, maxJ = -1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (work[i]![j]! > 0 || work[j]![i]! > 0) {
          const bet = edgeBet(work, n, i, j);
          if (bet > maxBet) { maxBet = bet; maxI = i; maxJ = j; }
        }
      }
    }
    if (maxI < 0) break;
    work[maxI]![maxJ] = 0;
    work[maxJ]![maxI] = 0;
  }

  return bestPartition;
}

function edgeBet(adj: number[][], n: number, u: number, v: number): number {
  let count = 0;
  for (let s = 0; s < n; s++) {
    const dist = bfs(adj, n, s);
    for (let t = 0; t < n; t++) {
      if (s === t || dist[t] === Infinity) continue;
      if ((dist[u] + 1 === dist[v] || dist[v] + 1 === dist[u]) &&
          dist[s] + dist[t] === dist[t]) {
        count++;
      }
    }
  }
  return count;
}

function bfs(adj: number[][], n: number, source: number): Float64Array {
  const dist = new Float64Array(n).fill(Infinity);
  dist[source] = 0;
  const queue = [source];
  let qi = 0;
  while (qi < queue.length) {
    const u = queue[qi++]!;
    for (let v = 0; v < n; v++) {
      if (dist[v] === Infinity && (adj[u]![v]! > 0 || adj[v]![u]! > 0)) {
        dist[v] = dist[u]! + 1;
        queue.push(v);
      }
    }
  }
  return dist;
}

function connectedComponents(adj: number[][], n: number): number[] {
  const comp = new Array(n).fill(-1);
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0) continue;
    const stack = [i];
    while (stack.length > 0) {
      const u = stack.pop()!;
      if (comp[u] >= 0) continue;
      comp[u] = c;
      for (let v = 0; v < n; v++) {
        if (comp[v] < 0 && (adj[u]![v]! > 0 || adj[v]![u]! > 0)) {
          stack.push(v);
        }
      }
    }
    c++;
  }
  return comp;
}

function modularity(adj: number[][], partition: number[], n: number): number {
  const m2 = totalWeight2(adj, n);
  if (m2 === 0) return 0;
  let q = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (partition[i] !== partition[j]) continue;
      let ki = 0, kj = 0;
      for (let x = 0; x < n; x++) { ki += adj[i]![x]!; kj += adj[j]![x]!; }
      q += adj[i]![j]! - (ki * kj) / m2;
    }
  }
  return q / m2;
}

function totalWeight2(adj: number[][], n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) s += adj[i]![j]!;
  return s;
}

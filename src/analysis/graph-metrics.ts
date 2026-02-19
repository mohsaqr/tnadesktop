/**
 * Network-level graph metrics computed from a TNA model's weight matrix.
 */
import type { TNA } from 'tnaj';

export interface GraphMetrics {
  nodes: number;
  edges: number;
  density: number;
  avgDegree: number;
  avgWeightedDegree: number;
  reciprocity: number | null;   // null for undirected
  transitivity: number;         // global clustering coefficient
  avgPathLength: number;        // mean finite shortest path
  diameter: number;             // max finite shortest path
  components: number;           // weakly connected components
  largestComponentSize: number;
  selfLoops: number;
}

export function computeGraphMetrics(model: TNA): GraphMetrics {
  const n = model.labels.length;
  const w = model.weights;
  const isUndirected = model.type === 'co-occurrence';

  // Count edges, self-loops
  let selfLoops = 0;
  let edgeCount = 0;
  for (let i = 0; i < n; i++) {
    if (w.get(i, i) > 0) selfLoops++;
    for (let j = 0; j < n; j++) {
      if (i !== j && w.get(i, j) > 0) edgeCount++;
    }
  }
  // For undirected: each pair counted twice in the loop above
  const edges = isUndirected ? edgeCount / 2 : edgeCount;

  // Density
  const maxEdges = isUndirected ? n * (n - 1) / 2 : n * (n - 1);
  const density = maxEdges > 0 ? edges / maxEdges : 0;

  // Degree
  const avgDegree = n > 0 ? (isUndirected ? 2 * edges / n : edges / n) : 0;

  // Weighted degree: mean of (outStrength + inStrength) / 2
  let totalWeightedDeg = 0;
  for (let i = 0; i < n; i++) {
    let outS = 0, inS = 0;
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        outS += w.get(i, j);
        inS += w.get(j, i);
      }
    }
    totalWeightedDeg += (outS + inS) / 2;
  }
  const avgWeightedDegree = n > 0 ? totalWeightedDeg / n : 0;

  // Reciprocity (directed only)
  let reciprocity: number | null = null;
  if (!isUndirected) {
    let mutual = 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && w.get(i, j) > 0) {
          total++;
          if (w.get(j, i) > 0) mutual++;
        }
      }
    }
    reciprocity = total > 0 ? mutual / total : 0;
  }

  // Transitivity: global clustering coefficient
  // Build binary undirected adjacency
  const adj: boolean[][] = [];
  const deg: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    adj[i] = new Array(n).fill(false);
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && (w.get(i, j) > 0 || w.get(j, i) > 0)) {
        adj[i]![j] = true;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (adj[i]![j]) deg[i]++;
    }
  }

  let triangles = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!adj[i]![j]) continue;
      for (let k = j + 1; k < n; k++) {
        if (adj[i]![k] && adj[j]![k]) triangles++;
      }
    }
  }
  let triples = 0;
  for (let i = 0; i < n; i++) {
    triples += deg[i]! * (deg[i]! - 1) / 2;
  }
  const transitivity = triples > 0 ? (3 * triangles) / triples : 0;

  // Floyd-Warshall for shortest paths (distance = 1/weight)
  const INF = Infinity;
  const dist: number[][] = [];
  for (let i = 0; i < n; i++) {
    dist[i] = new Array(n).fill(INF);
    dist[i]![i] = 0;
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const wij = w.get(i, j);
        if (wij > 0) dist[i]![j] = 1 / wij;
        if (isUndirected) {
          const wji = w.get(j, i);
          if (wji > 0) {
            const d = 1 / wji;
            if (d < dist[i]![j]!) dist[i]![j] = d;
          }
        }
      }
    }
  }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const via = dist[i]![k]! + dist[k]![j]!;
        if (via < dist[i]![j]!) dist[i]![j] = via;
      }
    }
  }

  let sumPath = 0;
  let countPath = 0;
  let maxPath = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && dist[i]![j]! < INF) {
        sumPath += dist[i]![j]!;
        countPath++;
        if (dist[i]![j]! > maxPath) maxPath = dist[i]![j]!;
      }
    }
  }
  const avgPathLength = countPath > 0 ? sumPath / countPath : 0;
  const diameter = maxPath;

  // Weakly connected components (BFS on symmetrized adjacency)
  const visited = new Array(n).fill(false);
  let components = 0;
  let largestComponentSize = 0;

  for (let start = 0; start < n; start++) {
    if (visited[start]) continue;
    components++;
    let size = 0;
    const queue = [start];
    visited[start] = true;
    while (queue.length > 0) {
      const v = queue.shift()!;
      size++;
      for (let u = 0; u < n; u++) {
        if (!visited[u] && adj[v]![u]) {
          visited[u] = true;
          queue.push(u);
        }
      }
    }
    if (size > largestComponentSize) largestComponentSize = size;
  }

  return {
    nodes: n,
    edges,
    density,
    avgDegree,
    avgWeightedDegree,
    reciprocity,
    transitivity,
    avgPathLength,
    diameter,
    components,
    largestComponentSize,
    selfLoops,
  };
}

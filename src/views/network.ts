/**
 * Network graph visualization with configurable layout, edges, and self-loops.
 */
import * as d3 from 'd3';
import type { TNA, CommunityResult, CentralityResult } from 'tnaj';
import type { NetworkSettings } from '../main';
import { showTooltip, hideTooltip } from '../main';
import { NODE_COLORS, COMMUNITY_COLORS } from './colors';
import { cytoscapeLayout } from './cytoscape-layouts';
import type { CytoscapeLayoutName } from './cytoscape-layouts';

/** Format edge weight: integers shown without decimals, others as .XX */
export function fmtWeight(w: number): string {
  if (Number.isInteger(w)) return String(w);
  return w.toFixed(2).replace(/^0\./, '.');
}

/** Format a number with up to `digits` decimal places, stripping trailing zeros. */
export function fmtNum(v: number, digits = 4): string {
  if (Number.isInteger(v)) return String(v);
  return parseFloat(v.toFixed(digits)).toString();
}

interface NodeDatum {
  id: string;
  idx: number;
  color: string;
  x: number;
  y: number;
  radius: number;
}

interface EdgeDatum {
  fromIdx: number;
  toIdx: number;
  weight: number;
}

// ═══════════════════════════════════════════════════════════
//  Layout algorithms
// ═══════════════════════════════════════════════════════════

/** Simple seeded PRNG (mulberry32) for deterministic layouts. */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rescalePositions(
  positions: { x: number; y: number }[],
  width: number, height: number, padding: number,
) {
  if (positions.length === 0) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const usableW = width - 2 * padding;
  const usableH = height - 2 * padding;
  // Uniform scaling: use the limiting dimension to preserve aspect ratio
  const scale = Math.min(usableW / rangeX, usableH / rangeY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const cx = width / 2;
  const cy = height / 2;
  for (const p of positions) {
    p.x = cx + (p.x - midX) * scale;
    p.y = cy + (p.y - midY) * scale;
  }
}

export function circularLayout(
  n: number, cx: number, cy: number, radius: number,
): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

function springLayout(
  n: number, weights: { get(i: number, j: number): number },
  width: number, height: number, padding: number, seed = 42,
  nodeRadius = 25,
): { x: number; y: number }[] {
  // Build links from weight matrix
  const links: { source: number; target: number; weight: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const w = weights.get(i, j);
      if (w > 0) links.push({ source: i, target: j, weight: w });
    }
  }

  // SNA-aware parameters: adapt to graph size
  const isSna = n > 20;
  const chargeStrength = isSna ? -200 - (n * 5) : -300;
  const linkDist = isSna ? 30 + 200 / Math.sqrt(n) : 100;
  const linkStr = isSna ? 0.3 : undefined;
  const collideRadius = isSna ? nodeRadius * 1.8 : padding * 0.5;
  const iters = isSna ? 500 : 300;

  // Seed initial positions in a circle with jitter so spring layout is deterministic
  const rng = seededRandom(seed);
  const cx = width / 2;
  const cy = height / 2;
  const initRadius = Math.min(width, height) / 4;
  const nodes = Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return { index: i, x: cx + initRadius * Math.cos(angle) + (rng() - 0.5) * 2, y: cy + initRadius * Math.sin(angle) + (rng() - 0.5) * 2 };
  });

  const linkForce = d3.forceLink(links).id((_d, i) => i).distance(linkDist);
  if (linkStr !== undefined) linkForce.strength(linkStr);

  const sim = d3.forceSimulation(nodes)
    .force('link', linkForce)
    .force('charge', d3.forceManyBody().strength(chargeStrength))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(collideRadius))
    .force('x', d3.forceX(width / 2).strength(isSna ? 0.05 : 0))
    .force('y', d3.forceY(height / 2).strength(isSna ? 0.05 : 0))
    .stop();

  for (let i = 0; i < iters; i++) sim.tick();

  const positions = nodes.map(nd => ({ x: nd.x!, y: nd.y! }));
  rescalePositions(positions, width, height, padding);
  return positions;
}

function kamadaKawaiLayout(
  n: number, weights: { get(i: number, j: number): number },
  width: number, height: number, padding: number,
): { x: number; y: number }[] {
  // Floyd-Warshall shortest paths with 1/weight distances
  const INF = 1e9;
  const dist: number[][] = Array.from({ length: n }, () => Array(n).fill(INF));
  for (let i = 0; i < n; i++) dist[i]![i] = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const w = weights.get(i, j);
      if (w > 0) {
        const d = 1 / w;
        if (d < dist[i]![j]!) dist[i]![j] = d;
      }
    }
  }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i]![k]! + dist[k]![j]! < dist[i]![j]!) {
          dist[i]![j] = dist[i]![k]! + dist[k]![j]!;
        }
      }
    }
  }

  // Initialize from circular layout
  const cx = width / 2, cy = height / 2;
  const radius = Math.min(cx, cy) - padding;
  const pos = circularLayout(n, cx, cy, radius);

  // Desired distance scaling
  let maxDist = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (dist[i]![j]! < INF && dist[i]![j]! > maxDist) maxDist = dist[i]![j]!;
    }
  }
  const L0 = Math.min(width, height) * 0.4;
  const scale = maxDist > 0 ? L0 / maxDist : 1;

  // Spring constants k_ij = 1 / d_ij^2
  const iterations = 300;
  const eps = 0.01;
  for (let iter = 0; iter < iterations; iter++) {
    for (let m = 0; m < n; m++) {
      let dEx = 0, dEy = 0;
      for (let i = 0; i < n; i++) {
        if (i === m || dist[m]![i]! >= INF) continue;
        const dij = dist[m]![i]! * scale;
        const kij = 1 / (dij * dij);
        const dx = pos[m]!.x - pos[i]!.x;
        const dy = pos[m]!.y - pos[i]!.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        dEx += kij * (dx - dij * dx / d);
        dEy += kij * (dy - dij * dy / d);
      }
      const step = 1;
      pos[m]!.x -= step * dEx;
      pos[m]!.y -= step * dEy;
    }
    if (Math.abs(eps) < 1e-6) break;
  }

  rescalePositions(pos, width, height, padding);
  return pos;
}

function spectralLayout(
  n: number, weights: { get(i: number, j: number): number },
  width: number, height: number, padding: number, seed = 42,
): { x: number; y: number }[] {
  if (n <= 2) {
    const pos = circularLayout(n, width / 2, height / 2, Math.min(width, height) / 2 - padding);
    return pos;
  }

  // Symmetrize weights
  const W: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      W[i]![j] = (weights.get(i, j) + weights.get(j, i)) / 2;
    }
  }

  // Build Laplacian L = D - W
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    let deg = 0;
    for (let j = 0; j < n; j++) deg += W[i]![j]!;
    L[i]![i] = deg;
    for (let j = 0; j < n; j++) {
      if (i !== j) L[i]![j] = -W[i]![j]!;
    }
  }

  // Power iteration to find smallest non-trivial eigenvectors
  // We use inverse power iteration on L + shift to avoid the zero eigenvalue
  const rng = seededRandom(seed);
  function randomVec(): number[] {
    const v = Array.from({ length: n }, () => rng() - 0.5);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return v.map(x => x / norm);
  }

  function matVecMul(M: number[][], v: number[]): number[] {
    return M.map(row => row.reduce((s, val, j) => s + val * v[j]!, 0));
  }

  function normalize(v: number[]): number[] {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map(x => x / norm);
  }

  function orthogonalize(v: number[], basis: number[][]): number[] {
    const result = [...v];
    for (const b of basis) {
      const dot = result.reduce((s, x, i) => s + x * b[i]!, 0);
      for (let i = 0; i < n; i++) result[i]! -= dot * b[i]!;
    }
    return result;
  }

  // Use L directly, find eigenvectors via power iteration on (maxEig*I - L)
  // to convert smallest eigenvectors to largest
  // Estimate max eigenvalue (Gershgorin)
  let maxEig = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += Math.abs(L[i]![j]!);
    if (s > maxEig) maxEig = s;
  }
  maxEig *= 1.1;

  // Shifted matrix: M = maxEig*I - L (largest eigvecs of M = smallest of L)
  const M: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? maxEig : 0) - L[i]![j]!)
  );

  // Find 3 dominant eigenvectors of M (= 3 smallest of L)
  const eigvecs: number[][] = [];
  for (let k = 0; k < 3; k++) {
    let v = randomVec();
    for (let iter = 0; iter < 200; iter++) {
      v = matVecMul(M, v);
      v = orthogonalize(v, eigvecs);
      v = normalize(v);
    }
    eigvecs.push(v);
  }

  // eigvecs[0] ≈ constant (Fiedler: skip), use [1] and [2] as x,y
  const xCoords = eigvecs[1] ?? randomVec();
  const yCoords = eigvecs[2] ?? randomVec();

  const pos = xCoords.map((x, i) => ({ x, y: yCoords[i]! }));
  rescalePositions(pos, width, height, padding);
  return pos;
}

// ─── Fruchterman-Reingold (Gephi-faithful) ───
//
// Matches Gephi's FruchtermanReingold.java by Mathieu Jacomy:
//   - k = sqrt(AREA_MULT * area / (1+n))
//   - Repulsive: k²/d  (all pairs)
//   - Attractive: d²/k  (edges only, no weight scaling)
//   - Gravity: 0.01 * k * gravity * d  (toward origin)
//   - Constant speed factor (speed / SPEED_DIVISOR) instead of cooling
//   - maxDisplace cap per iteration
//
// Adapted for batch use: we loop many iterations internally since
// Gephi calls goAlgo() from a UI loop.

function fruchtermanReingoldLayout(
  n: number, weights: { get(i: number, j: number): number },
  width: number, height: number, padding: number, seed = 42,
  _nodeRadius = 25,
): { x: number; y: number }[] {
  if (n <= 1) return [{ x: width / 2, y: height / 2 }];

  // Gephi constants
  const SPEED_DIVISOR = 800;
  const AREA_MULTIPLICATOR = 10000;

  // Tunable properties (Gephi defaults)
  const area = 10000;
  const gravity = 10;
  const speed = 1;

  // Derived
  const k = Math.sqrt((AREA_MULTIPLICATOR * area) / (1 + n));
  const maxDisplace = Math.sqrt(AREA_MULTIPLICATOR * area) / 10;
  const speedFactor = speed / SPEED_DIVISOR;

  // More iterations for larger graphs (Gephi runs interactively; we batch)
  const iterations = n > 20 ? Math.max(1000, n * 8) : 500;

  // Build edge list
  const edges: { i: number; j: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = weights.get(i, j) + weights.get(j, i);
      if (w > 0) edges.push({ i, j });
    }
  }

  // Seed from circular layout for determinism
  const rng = seededRandom(seed);
  const pos = Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n;
    const r = Math.min(width, height) * 0.3;
    return {
      x: width / 2 + r * Math.cos(angle) + (rng() - 0.5) * 2,
      y: height / 2 + r * Math.sin(angle) + (rng() - 0.5) * 2,
    };
  });

  const dispX = new Float64Array(n);
  const dispY = new Float64Array(n);

  for (let iter = 0; iter < iterations; iter++) {
    dispX.fill(0);
    dispY.fill(0);

    // Repulsive forces: all node pairs
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i]!.x - pos[j]!.x;
        const dy = pos[i]!.y - pos[j]!.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const repulsiveF = (k * k) / dist;
        const fx = (dx / dist) * repulsiveF;
        const fy = (dy / dist) * repulsiveF;
        dispX[i]! += fx;  dispY[i]! += fy;
        dispX[j]! -= fx;  dispY[j]! -= fy;
      }
    }

    // Attractive forces: edges only, d²/k (no weight scaling, like Gephi)
    for (const edge of edges) {
      const dx = pos[edge.i]!.x - pos[edge.j]!.x;
      const dy = pos[edge.i]!.y - pos[edge.j]!.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const attractiveF = (dist * dist) / k;
      const fx = (dx / dist) * attractiveF;
      const fy = (dy / dist) * attractiveF;
      dispX[edge.i]! -= fx;  dispY[edge.i]! -= fy;
      dispX[edge.j]! += fx;  dispY[edge.j]! += fy;
    }

    // Gravity toward center: 0.01 * k * gravity * d (Gephi formula)
    const cx = width / 2, cy = height / 2;
    for (let i = 0; i < n; i++) {
      const dx = pos[i]!.x - cx;
      const dy = pos[i]!.y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const gf = 0.01 * k * gravity * d;
      dispX[i]! -= gf * dx / d;
      dispY[i]! -= gf * dy / d;
    }

    // Apply speed scaling (constant, no cooling — like Gephi)
    for (let i = 0; i < n; i++) {
      dispX[i]! *= speedFactor;
      dispY[i]! *= speedFactor;
    }

    // Apply displacement capped by maxDisplace * speedFactor
    const limitedDisplace = maxDisplace * speedFactor;
    for (let i = 0; i < n; i++) {
      const dx = dispX[i]!;
      const dy = dispY[i]!;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const capped = Math.min(limitedDisplace, dist) / dist;
      pos[i]!.x += dx * capped;
      pos[i]!.y += dy * capped;
    }
  }

  rescalePositions(pos, width, height, padding);
  return pos;
}

// ─── ForceAtlas2 (Gephi's signature layout) ───

function forceAtlas2Layout(
  n: number, weights: { get(i: number, j: number): number },
  width: number, height: number, padding: number, seed = 42,
  _nodeRadius = 25,
): { x: number; y: number }[] {
  if (n <= 1) return [{ x: width / 2, y: height / 2 }];

  const isSna = n > 20;
  const linLog = true;                 // LinLog mode: better community separation
  const scalingRatio = isSna ? 2.0 + n * 0.02 : 2.0;
  const gravity = isSna ? 1.0 + n * 0.005 : 1.0;
  const jitterTolerance = 1.0;
  const iterations = isSna ? Math.max(600, n * 4) : 600;

  // Build adjacency
  const edges: { i: number; j: number; w: number }[] = [];
  const degree = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const w = weights.get(i, j);
      if (w > 0) {
        if (i < j) edges.push({ i, j, w });
        degree[i]! += w;
      }
    }
  }

  // Seed from circular layout
  const rng = seededRandom(seed);
  const pos = Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n;
    const r = Math.min(width, height) * 0.25;
    return {
      x: width / 2 + r * Math.cos(angle) + (rng() - 0.5),
      y: height / 2 + r * Math.sin(angle) + (rng() - 0.5),
    };
  });

  // Velocities for adaptive step size
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const forceX = new Float64Array(n);
  const forceY = new Float64Array(n);
  const prevForceX = new Float64Array(n);
  const prevForceY = new Float64Array(n);

  for (let iter = 0; iter < iterations; iter++) {
    forceX.fill(0);
    forceY.fill(0);

    // Repulsive forces (degree+1 scaling, as in ForceAtlas2)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i]!.x - pos[j]!.x;
        const dy = pos[i]!.y - pos[j]!.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        // repulsion proportional to (deg+1)(deg+1)/distance
        const repulsion = scalingRatio * (degree[i]! + 1) * (degree[j]! + 1) / dist;
        const fx = (dx / dist) * repulsion;
        const fy = (dy / dist) * repulsion;
        forceX[i]! += fx;  forceY[i]! += fy;
        forceX[j]! -= fx;  forceY[j]! -= fy;
      }
    }

    // Attractive forces
    for (const edge of edges) {
      const dx = pos[edge.i]!.x - pos[edge.j]!.x;
      const dy = pos[edge.i]!.y - pos[edge.j]!.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      let attraction: number;
      if (linLog) {
        // LinLog: attraction = log(1+d) * w
        attraction = Math.log(1 + dist) * edge.w;
      } else {
        attraction = dist * edge.w;
      }
      const fx = (dx / dist) * attraction;
      const fy = (dy / dist) * attraction;
      forceX[edge.i]! -= fx;  forceY[edge.i]! -= fy;
      forceX[edge.j]! += fx;  forceY[edge.j]! += fy;
    }

    // Gravity (strong gravity: proportional to degree+1)
    const cx = width / 2, cy = height / 2;
    for (let i = 0; i < n; i++) {
      const dx = pos[i]!.x - cx;
      const dy = pos[i]!.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const g = gravity * (degree[i]! + 1);
      forceX[i]! -= g * dx / dist;
      forceY[i]! -= g * dy / dist;
    }

    // Adaptive step size per node (ForceAtlas2 "swing" and "traction")
    let totalSwing = 0;
    let totalTraction = 0;
    for (let i = 0; i < n; i++) {
      const swingI = Math.sqrt(
        (forceX[i]! - prevForceX[i]!) ** 2 + (forceY[i]! - prevForceY[i]!) ** 2,
      );
      const tractionI = Math.sqrt(
        (forceX[i]! + prevForceX[i]!) ** 2 + (forceY[i]! + prevForceY[i]!) ** 2,
      ) / 2;
      totalSwing += (degree[i]! + 1) * swingI;
      totalTraction += (degree[i]! + 1) * tractionI;
    }

    const globalSpeed = totalSwing > 0
      ? jitterTolerance * jitterTolerance * totalTraction / totalSwing
      : 1;
    const clampedSpeed = Math.min(globalSpeed, 10);

    for (let i = 0; i < n; i++) {
      const swingI = Math.sqrt(
        (forceX[i]! - prevForceX[i]!) ** 2 + (forceY[i]! - prevForceY[i]!) ** 2,
      );
      const nodeSpeed = clampedSpeed / (1 + clampedSpeed * Math.sqrt(swingI));
      const cappedSpeed = Math.min(nodeSpeed, 10);
      pos[i]!.x += forceX[i]! * cappedSpeed;
      pos[i]!.y += forceY[i]! * cappedSpeed;
    }

    // Save forces for next iteration
    prevForceX.set(forceX);
    prevForceY.set(forceY);
  }

  rescalePositions(pos, width, height, padding);
  return pos;
}

// ─── FR + Circular Shell (Gephi-style) ───

function frShellLayout(
  n: number, weights: { get(i: number, j: number): number },
  width: number, height: number, padding: number, seed = 42,
): { x: number; y: number }[] {
  if (n <= 1) return [{ x: width / 2, y: height / 2 }];

  // Compute weighted degree for each node
  const degree = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      degree[i] += weights.get(i, j) + weights.get(j, i);
    }
  }

  // Determine core vs shell: nodes with degree above 25th percentile are core
  const sorted = Array.from(degree).sort((a, b) => a - b);
  const threshold = sorted[Math.floor(n * 0.25)] ?? 0;
  const isCore: boolean[] = Array.from(degree, d => d > threshold);
  const coreIdx: number[] = [];
  const shellIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isCore[i]) coreIdx.push(i);
    else shellIdx.push(i);
  }

  // If all nodes are core or all are shell, fall back to full FR
  if (shellIdx.length === 0 || coreIdx.length === 0) {
    return fruchtermanReingoldLayout(n, weights, width, height, padding, seed);
  }

  // --- Step 1: Run Gephi-style FR on core nodes only ---
  const coreN = coreIdx.length;
  const SHELL_SPEED_DIVISOR = 800;
  const SHELL_AREA_MULT = 10000;
  const shellArea = 10000;
  const coreK = Math.sqrt((SHELL_AREA_MULT * shellArea) / (1 + coreN));
  const shellMaxDisplace = Math.sqrt(SHELL_AREA_MULT * shellArea) / 10;
  const shellSpeedFactor = 1 / SHELL_SPEED_DIVISOR;
  const shellGravity = 10;
  const iterations = coreN > 20 ? Math.max(1000, coreN * 8) : 500;

  const coreEdges: { i: number; j: number }[] = [];
  const coreMap = new Map<number, number>(); // original idx → core local idx
  coreIdx.forEach((orig, local) => coreMap.set(orig, local));
  for (let a = 0; a < coreN; a++) {
    for (let b = a + 1; b < coreN; b++) {
      const w = weights.get(coreIdx[a]!, coreIdx[b]!) + weights.get(coreIdx[b]!, coreIdx[a]!);
      if (w > 0) coreEdges.push({ i: a, j: b });
    }
  }

  const rng = seededRandom(seed);
  const corePos = Array.from({ length: coreN }, (_, i) => {
    const angle = (2 * Math.PI * i) / coreN;
    const r = Math.min(width, height) * 0.2;
    return {
      x: width / 2 + r * Math.cos(angle) + (rng() - 0.5) * 2,
      y: height / 2 + r * Math.sin(angle) + (rng() - 0.5) * 2,
    };
  });

  const dispX = new Float64Array(coreN);
  const dispY = new Float64Array(coreN);

  for (let iter = 0; iter < iterations; iter++) {
    dispX.fill(0);
    dispY.fill(0);

    // Repulsive: k²/d
    for (let i = 0; i < coreN; i++) {
      for (let j = i + 1; j < coreN; j++) {
        const dx = corePos[i]!.x - corePos[j]!.x;
        const dy = corePos[i]!.y - corePos[j]!.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const repF = (coreK * coreK) / dist;
        const fx = (dx / dist) * repF;
        const fy = (dy / dist) * repF;
        dispX[i]! += fx; dispY[i]! += fy;
        dispX[j]! -= fx; dispY[j]! -= fy;
      }
    }

    // Attractive: d²/k (no weight, like Gephi)
    for (const edge of coreEdges) {
      const dx = corePos[edge.i]!.x - corePos[edge.j]!.x;
      const dy = corePos[edge.i]!.y - corePos[edge.j]!.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const attF = (dist * dist) / coreK;
      const fx = (dx / dist) * attF;
      const fy = (dy / dist) * attF;
      dispX[edge.i]! -= fx; dispY[edge.i]! -= fy;
      dispX[edge.j]! += fx; dispY[edge.j]! += fy;
    }

    // Gravity: 0.01 * k * gravity * d
    const ccx = width / 2, ccy = height / 2;
    for (let i = 0; i < coreN; i++) {
      const dx = corePos[i]!.x - ccx;
      const dy = corePos[i]!.y - ccy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const gf = 0.01 * coreK * shellGravity * d;
      dispX[i]! -= gf * dx / d;
      dispY[i]! -= gf * dy / d;
    }

    // Speed scaling + maxDisplace cap
    const limitedD = shellMaxDisplace * shellSpeedFactor;
    for (let i = 0; i < coreN; i++) {
      const dx = dispX[i]! * shellSpeedFactor;
      const dy = dispY[i]! * shellSpeedFactor;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const cap = Math.min(limitedD, dist) / dist;
      corePos[i]!.x += dx * cap;
      corePos[i]!.y += dy * cap;
    }
  }

  // --- Step 2: Arrange shell nodes in a circle around the core ---
  // Compute bounding radius of core
  const cx = width / 2, cy = height / 2;
  let maxCoreDist = 0;
  for (const p of corePos) {
    const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    if (d > maxCoreDist) maxCoreDist = d;
  }
  const shellRadius = maxCoreDist + Math.min(width, height) * 0.18;

  // Sort shell nodes by their strongest connection to core (for visual coherence)
  const shellSorted = shellIdx.slice().sort((a, b) => {
    let bestA = -1, bestB = -1, bestAw = 0, bestBw = 0;
    for (const ci of coreIdx) {
      const wa = weights.get(a, ci) + weights.get(ci, a);
      const wb = weights.get(b, ci) + weights.get(ci, b);
      if (wa > bestAw) { bestAw = wa; bestA = coreMap.get(ci)!; }
      if (wb > bestBw) { bestBw = wb; bestB = coreMap.get(ci)!; }
    }
    // Sort by angle of their best-connected core node
    const angleA = bestA >= 0 ? Math.atan2(corePos[bestA]!.y - cy, corePos[bestA]!.x - cx) : 0;
    const angleB = bestB >= 0 ? Math.atan2(corePos[bestB]!.y - cy, corePos[bestB]!.x - cx) : 0;
    return angleA - angleB;
  });

  // --- Step 3: Assemble final positions ---
  const pos: { x: number; y: number }[] = Array(n);
  for (let i = 0; i < coreN; i++) {
    pos[coreIdx[i]!] = corePos[i]!;
  }
  for (let i = 0; i < shellSorted.length; i++) {
    const angle = (2 * Math.PI * i) / shellSorted.length - Math.PI / 2;
    pos[shellSorted[i]!] = {
      x: cx + shellRadius * Math.cos(angle),
      y: cy + shellRadius * Math.sin(angle),
    };
  }

  rescalePositions(pos, width, height, padding);
  return pos;
}

// ═══════════════════════════════════════════════════════════
//  Node shape path helpers
// ═══════════════════════════════════════════════════════════

/** Generate an SVG path `d` string for the given shape centered at (0,0). */
export function shapePathD(shape: string, r: number): string {
  switch (shape) {
    case 'square': {
      const h = r * 0.88;
      return `M${-h},${-h}L${h},${-h}L${h},${h}L${-h},${h}Z`;
    }
    case 'diamond': {
      const h = r * 1.1;
      return `M0,${-h}L${h},0L0,${h}L${-h},0Z`;
    }
    case 'triangle': {
      // Equilateral triangle pointing up
      const h = r * 1.15;
      const half = h * Math.sqrt(3) / 2;
      return `M0,${-h}L${half},${h / 2}L${-half},${h / 2}Z`;
    }
    case 'hexagon': {
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        pts.push(`${r * Math.cos(a)},${r * Math.sin(a)}`);
      }
      return `M${pts[0]}L${pts[1]}L${pts[2]}L${pts[3]}L${pts[4]}L${pts[5]}Z`;
    }
    case 'circle':
    default:
      // Two-arc full circle
      return `M0,${-r}A${r},${r} 0 1,1 0,${r}A${r},${r} 0 1,1 0,${-r}Z`;
  }
}

// ═══════════════════════════════════════════════════════════
//  Edge path helpers
// ═══════════════════════════════════════════════════════════

export function computeEdgePath(
  sx: number, sy: number, tx: number, ty: number,
  curvature: number, sourceOuterRadius: number, targetOuterRadius: number, arrowSize: number,
) {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return { path: '', tipX: tx, tipY: ty, tipDx: 0, tipDy: -1, labelX: (sx + tx) / 2, labelY: (sy + ty) / 2 };

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const mx = (sx + tx) / 2 + px * curvature;
  const my = (sy + ty) / 2 + py * curvature;

  const sdx = mx - sx;
  const sdy = my - sy;
  const slen = Math.sqrt(sdx * sdx + sdy * sdy);
  const startX = sx + (sdx / slen) * sourceOuterRadius;
  const startY = sy + (sdy / slen) * sourceOuterRadius;

  const edx = tx - mx;
  const edy = ty - my;
  const elen = Math.sqrt(edx * edx + edy * edy);
  const eux = edx / elen;
  const euy = edy / elen;

  // Arrow tip sits at the outer radius; edge path ends at the arrow base
  const tipX = tx - eux * targetOuterRadius;
  const tipY = ty - euy * targetOuterRadius;
  const endX = tx - eux * (targetOuterRadius + arrowSize);
  const endY = ty - euy * (targetOuterRadius + arrowSize);

  const t = 0.55;
  const labelX = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * mx + t * t * endX;
  const labelY = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * my + t * t * endY;

  return {
    path: `M${startX},${startY} Q${mx},${my} ${endX},${endY}`,
    tipX, tipY, tipDx: eux, tipDy: euy, labelX, labelY,
  };
}

export function arrowPoly(
  tipX: number, tipY: number, dx: number, dy: number, arrowSize: number,
): string {
  const halfW = arrowSize / 2;
  const baseX = tipX - dx * arrowSize;
  const baseY = tipY - dy * arrowSize;
  const lx = baseX - dy * halfW;
  const ly = baseY + dx * halfW;
  const rx = baseX + dy * halfW;
  const ry = baseY - dx * halfW;
  return `${tipX},${tipY} ${lx},${ly} ${rx},${ry}`;
}

// ═══════════════════════════════════════════════════════════
//  Self-loop rendering
// ═══════════════════════════════════════════════════════════

function renderSelfLoop(
  edgeGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  arrowGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  edgeLabelGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  node: NodeDatum,
  weight: number,
  settings: NetworkSettings,
  widthScale: d3.ScaleLinear<number, number>,
  opacityScale: d3.ScaleLinear<number, number>,
  cx: number, cy: number,
  outerRadius: number,
  getDashArray?: (weight: number) => string | null,
  undirected = false,
  actualRadius?: number,
) {
  const loopR = (actualRadius ?? settings.nodeRadius) * 0.7; // visible loop
  const margin = 3; // clear gap between donut ring and arc

  // Direction outward from graph center
  let dirX = node.x - cx;
  let dirY = node.y - cy;
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  dirX /= dirLen;
  dirY /= dirLen;

  // Place loop center outward, with margin so inner edge doesn't touch donut ring
  const loopCX = node.x + dirX * (outerRadius + margin + loopR);
  const loopCY = node.y + dirY * (outerRadius + margin + loopR);

  // Gap faces the node — the two endpoints of the arc sit near the outer border
  const toNodeAngle = Math.atan2(node.y - loopCY, node.x - loopCX);
  const gapHalf = 0.5; // slightly wider gap for cleaner look
  const startAngle = toNodeAngle + gapHalf;
  const endAngle = toNodeAngle - gapHalf + 2 * Math.PI;

  const sx = loopCX + loopR * Math.cos(startAngle);
  const sy = loopCY + loopR * Math.sin(startAngle);
  const ex = loopCX + loopR * Math.cos(endAngle);
  const ey = loopCY + loopR * Math.sin(endAngle);

  const op = Math.min(opacityScale(weight) + 0.15, 1);
  // Cap self-loop stroke width to avoid blobby arcs
  const sw = Math.min(Math.max(widthScale(weight), 1.0), 4);

  // Determine correct sweep flag: the arc should bulge OUTWARD (away from node).
  // Compute the midpoint of the large arc for sweep=0 vs sweep=1 and pick the
  // one whose midpoint is further from the node.
  const midAngle0 = startAngle + (2 * Math.PI - gapHalf * 2) / 2; // going CCW (sweep=0 candidate)
  const midAngle1 = startAngle - (gapHalf * 2) / 2;               // going CW (sweep=1 candidate)
  const mid0x = loopCX + loopR * Math.cos(midAngle0);
  const mid0y = loopCY + loopR * Math.sin(midAngle0);
  const mid1x = loopCX + loopR * Math.cos(midAngle1);
  const mid1y = loopCY + loopR * Math.sin(midAngle1);
  const dist0 = (mid0x - node.x) ** 2 + (mid0y - node.y) ** 2;
  const dist1 = (mid1x - node.x) ** 2 + (mid1y - node.y) ** 2;
  const sweep = dist0 >= dist1 ? 1 : 0;

  const selfLoopPath = edgeGroup.append('path')
    .attr('d', `M${sx},${sy} A${loopR},${loopR} 0 1,${sweep} ${ex},${ey}`)
    .attr('fill', 'none')
    .attr('stroke', settings.edgeColor)
    .attr('stroke-width', sw)
    .attr('stroke-opacity', op)
    .attr('stroke-linecap', 'round');
  const selfDash = getDashArray ? getDashArray(weight) : null;
  if (selfDash) selfLoopPath.attr('stroke-dasharray', selfDash);

  // Arrow at end — use the actual SVG path to get the tangent direction
  if (!undirected) {
    const pathEl = selfLoopPath.node()!;
    const totalLen = pathEl.getTotalLength();
    const nearEnd = pathEl.getPointAtLength(totalLen - 2);
    const atEnd = pathEl.getPointAtLength(totalLen);
    const adx = atEnd.x - nearEnd.x;
    const ady = atEnd.y - nearEnd.y;
    const al = Math.sqrt(adx * adx + ady * ady) || 1;
    const selfArrowSize = settings.arrowSize;
    const tipOffset = 4; // push arrow tip a few px ahead into the gap
    const tipX = atEnd.x + (adx / al) * tipOffset;
    const tipY = atEnd.y + (ady / al) * tipOffset;
    arrowGroup.append('polygon')
      .attr('points', arrowPoly(tipX, tipY, adx / al, ady / al, selfArrowSize))
      .attr('fill', settings.arrowColor)
      .attr('opacity', op);
  }

  // Label on far side of loop (away from node)
  const labelX = loopCX + dirX * (loopR + 6);
  const labelY = loopCY + dirY * (loopR + 6);
  if (settings.showEdgeLabels) {
    edgeLabelGroup.append('text')
      .attr('x', labelX)
      .attr('y', labelY)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('font-size', `${settings.edgeLabelSize}px`)
      .attr('fill', settings.edgeLabelColor)
      .attr('pointer-events', 'none')
      .style('paint-order', 'stroke')
      .style('stroke', '#ffffff')
      .style('stroke-width', '3px')
      .style('stroke-linejoin', 'round')
      .text(fmtWeight(weight));
  }
}

// ═══════════════════════════════════════════════════════════
//  Layout position cache
// ═══════════════════════════════════════════════════════════

/**
 * Cache normalized (0-1) positions so that visual-only setting changes
 * (colors, sizes, shapes, labels) don't re-run expensive layout algorithms.
 * Positions are recomputed only when layout-relevant params change.
 */
let cachedLayoutKey = '';
let cachedNormPositions: { x: number; y: number }[] = [];

function layoutCacheKey(
  model: TNA, layoutName: string, seed: number,
): string {
  // Include labels + a weight fingerprint so model changes invalidate cache
  const wSample: number[] = [];
  const n = model.labels.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      wSample.push(model.weights.get(i, j));
    }
  }
  return `${layoutName}|${seed}|${model.labels.join(',')}|${wSample.join(',')}`;
}

/**
 * Normalize positions for caching using UNIFORM scaling.
 * Both X and Y are scaled by the same factor (maxRange) so that
 * circles stay circular and layout shapes are preserved.
 */
function normalizePositions(positions: { x: number; y: number }[]): { x: number; y: number }[] {
  if (positions.length === 0) return [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const maxRange = Math.max(rangeX, rangeY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return positions.map(p => ({
    x: (p.x - midX) / maxRange + 0.5,
    y: (p.y - midY) / maxRange + 0.5,
  }));
}

/**
 * Denormalize cached positions using UNIFORM scaling.
 * Fits within the smaller usable dimension and centers in the larger,
 * preserving the original layout's aspect ratio.
 */
function denormalizePositions(
  norm: { x: number; y: number }[], width: number, height: number, padding: number,
): { x: number; y: number }[] {
  const usableW = width - 2 * padding;
  const usableH = height - 2 * padding;
  const scale = Math.min(usableW, usableH);
  const offsetX = padding + (usableW - scale) / 2;
  const offsetY = padding + (usableH - scale) / 2;
  return norm.map(p => ({
    x: offsetX + p.x * scale,
    y: offsetY + p.y * scale,
  }));
}

/** Clear the layout cache (e.g. when model changes externally). */
export function clearLayoutCache() {
  cachedLayoutKey = '';
  cachedNormPositions = [];
  globalLabelPositions.clear();
  globalPixelPositions.clear();
  lastLayoutWidth = 0;
  lastLayoutHeight = 0;
  lastLayoutPadding = 0;
}

/**
 * Global label→normalized-position map.
 * Populated the first time drawNetwork computes a layout (typically the single model).
 * Reused by group networks (same full label set) to keep identical node positions.
 * NOT used by clique subgraphs (fewer labels → compute fresh layout).
 */
const globalLabelPositions: Map<string, { x: number; y: number }> = new Map();

/**
 * Pixel-exact positions from the primary model's last drawNetwork render
 * (after spacing adjustment).  Used by diff/perm networks to get identical
 * node placement without normalization distortion.
 */
const globalPixelPositions: Map<string, { x: number; y: number }> = new Map();

/** Dimensions of the viewBox used when globalPixelPositions were computed. */
let lastLayoutWidth = 0;
let lastLayoutHeight = 0;
let lastLayoutPadding = 0;

/** Get the global normalized position for a label, if available. */
export function getGlobalLabelPositions(): Map<string, { x: number; y: number }> {
  return globalLabelPositions;
}

/**
 * Return the exact graphWidth, graphHeight, and padding used by the last
 * primary drawNetwork call.  Diff/perm renderers use these for their SVG
 * viewBox so that pixel positions from resolvePositions map correctly.
 */
export function getLastLayoutDimensions(): { width: number; height: number; padding: number } {
  return { width: lastLayoutWidth, height: lastLayoutHeight, padding: lastLayoutPadding };
}

/**
 * Return pixel-exact positions matching the primary network's layout.
 * Callers must use getLastLayoutDimensions() for their SVG viewBox so
 * the coordinates map correctly.  Falls back to circular layout in the
 * stored viewBox dimensions.
 */
export function resolvePositions(labels: string[]): { x: number; y: number }[] {
  const n = labels.length;
  if (globalPixelPositions.size > 0 && labels.every(l => globalPixelPositions.has(l))) {
    return labels.map(l => ({ ...globalPixelPositions.get(l)! }));
  }
  // Fallback: circular layout in the stored (or default) viewBox
  const graphW = lastLayoutWidth || 800;
  const graphH = lastLayoutHeight || 600;
  const padding = lastLayoutPadding || 50;
  return circularLayout(n, graphW / 2, graphH / 2, Math.min(graphW, graphH) / 2 - padding);
}

// ═══════════════════════════════════════════════════════════
//  Core drawing (shared between renderNetwork and renderNetworkIntoGroup)
// ═══════════════════════════════════════════════════════════

function drawNetwork(
  rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  model: TNA,
  settings: NetworkSettings,
  graphWidth: number,
  graphHeight: number,
  comm?: CommunityResult,
  enableTooltips = true,
  centData?: CentralityResult,
) {
  const n = model.labels.length;
  const weights = model.weights;

  // Auto-scale visuals for large (SNA-scale) networks
  if (n > 20) {
    settings = {
      ...settings,
      nodeRadius: Math.round(settings.nodeRadius * 0.7),
      nodeSizeMin: Math.round(settings.nodeSizeMin * 0.7),
      nodeSizeMax: Math.round(settings.nodeSizeMax * 0.7),
      edgeWidthMin: settings.edgeWidthMin * 0.7,
      edgeWidthMax: settings.edgeWidthMax * 0.7,
      arrowSize: Math.round(settings.arrowSize * 0.7),
      showNodeLabels: false,
    };
  }

  const nodeRadius = settings.nodeRadius;

  // ─── Pre-compute per-node radii (needed for padding before layout) ───
  let nodeRadii: number[] | null = null;
  if (settings.nodeSizeBy && centData) {
    const vals = centData.measures[settings.nodeSizeBy as keyof typeof centData.measures] as Float64Array | undefined;
    if (vals && vals.length === n) {
      const minV = Math.min(...Array.from(vals));
      const maxV = Math.max(...Array.from(vals));
      const range = maxV - minV || 1;
      nodeRadii = Array.from(vals, v =>
        settings.nodeSizeMin + ((v - minV) / range) * (settings.nodeSizeMax - settings.nodeSizeMin),
      );
    }
  }
  const maxNodeRadius = nodeRadii ? Math.max(...nodeRadii) : nodeRadius;
  const selfLoopExtent = settings.showSelfLoops ? (maxNodeRadius * 0.7 * 2 + 6) : 0;
  const padding = maxNodeRadius + Math.max(settings.graphPadding, selfLoopExtent);

  // ─── Layout (with position caching) ───
  const layoutSeed = settings.layoutSeed ?? 42;
  // Auto-switch circular → fcose for large graphs (SNA scale)
  const effectiveLayout = (settings.layout === 'circular' && n > 20) ? 'fcose' : settings.layout;
  const key = layoutCacheKey(model, effectiveLayout, layoutSeed);
  let positions: { x: number; y: number }[];
  let usedGlobalPositions = false;

  if (key === cachedLayoutKey && cachedNormPositions.length === n) {
    // Reuse cached positions — just rescale to current dimensions/padding
    positions = denormalizePositions(cachedNormPositions, graphWidth, graphHeight, padding);
  } else if (globalLabelPositions.size > 0 && model.labels.length === globalLabelPositions.size && model.labels.every(l => globalLabelPositions.has(l))) {
    // Reuse global label positions for full models (group networks with same labels).
    // Subgraphs (cliques) have fewer labels and must compute their own layout.
    const norm = model.labels.map(l => globalLabelPositions.get(l)!);
    positions = denormalizePositions(norm, graphWidth, graphHeight, padding);
    usedGlobalPositions = true;
  } else {
    // Compute fresh layout
    const cyLayouts: CytoscapeLayoutName[] = ['concentric', 'fcose', 'dagre', 'cola', 'euler', 'avsdf'];
    if (cyLayouts.includes(effectiveLayout as CytoscapeLayoutName)) {
      positions = cytoscapeLayout(
        effectiveLayout as CytoscapeLayoutName,
        n, weights, graphWidth, graphHeight, padding, layoutSeed,
      );
    } else {
      switch (effectiveLayout) {
        case 'spring':
          positions = springLayout(n, weights, graphWidth, graphHeight, padding, layoutSeed, nodeRadius);
          break;
        case 'kamada_kawai':
          positions = kamadaKawaiLayout(n, weights, graphWidth, graphHeight, padding);
          break;
        case 'spectral':
          positions = spectralLayout(n, weights, graphWidth, graphHeight, padding, layoutSeed);
          break;
        case 'fruchterman_reingold':
          positions = fruchtermanReingoldLayout(n, weights, graphWidth, graphHeight, padding, layoutSeed, nodeRadius);
          break;
        case 'forceatlas2':
          positions = forceAtlas2Layout(n, weights, graphWidth, graphHeight, padding, layoutSeed, nodeRadius);
          break;
        case 'fr_shell':
          positions = frShellLayout(n, weights, graphWidth, graphHeight, padding, layoutSeed);
          break;
        case 'circular':
        default: {
          const cx = graphWidth / 2;
          const cy = graphHeight / 2;
          const radius = Math.min(cx, cy) - padding;
          positions = circularLayout(n, cx, cy, radius);
          break;
        }
      }
    }
    // Cache the normalized positions for future visual-only updates
    cachedNormPositions = normalizePositions(positions);
    cachedLayoutKey = key;
    // Populate global label→position map so all views share the same layout
    for (let i = 0; i < n; i++) {
      globalLabelPositions.set(model.labels[i]!, cachedNormPositions[i]!);
    }
  }
  if (usedGlobalPositions) {
    // Also update the per-model cache so visual-only changes don't recompute
    cachedNormPositions = model.labels.map(l => globalLabelPositions.get(l)!);
    cachedLayoutKey = key;
  }

  // Apply spacing: scale positions from centroid
  const spacing = settings.layoutSpacing ?? 1.0;
  if (spacing !== 1.0 && n > 1) {
    let cx = 0, cy = 0;
    for (const p of positions) { cx += p.x; cy += p.y; }
    cx /= n; cy /= n;
    for (const p of positions) {
      p.x = cx + (p.x - cx) * spacing;
      p.y = cy + (p.y - cy) * spacing;
    }
  }

  // Store pixel positions + dimensions for external renderers (diff/perm networks).
  // Only from the primary model (not group sub-models which reuse global positions).
  if (!usedGlobalPositions) {
    globalPixelPositions.clear();
    for (let i = 0; i < n; i++) {
      globalPixelPositions.set(model.labels[i]!, { x: positions[i]!.x, y: positions[i]!.y });
    }
    lastLayoutWidth = graphWidth;
    lastLayoutHeight = graphHeight;
    lastLayoutPadding = padding;
  }

  const nodes: NodeDatum[] = model.labels.map((id, i) => {
    const customColor = settings.nodeColors[id];
    return {
      id, idx: i,
      color: customColor ?? NODE_COLORS[i % NODE_COLORS.length]!,
      x: positions[i]!.x,
      y: positions[i]!.y,
      radius: nodeRadii ? nodeRadii[i]! : nodeRadius,
    };
  });

  if (comm) {
    const methodKey = Object.keys(comm.assignments)[0]!;
    const assign = comm.assignments[methodKey]!;
    nodes.forEach((nd, i) => {
      nd.color = COMMUNITY_COLORS[assign[i]! % COMMUNITY_COLORS.length]!;
    });
  }

  // ─── Build edges ───
  const isUndirected = model.type === 'co-occurrence';
  const edges: EdgeDatum[] = [];
  const seenPairs = new Set<string>();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const w = weights.get(i, j);
      if (w > 0 && w >= settings.edgeThreshold) {
        if (isUndirected) {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (seenPairs.has(key)) continue;
          seenPairs.add(key);
        }
        edges.push({ fromIdx: i, toIdx: j, weight: w });
      }
    }
  }

  const bidir = new Set<string>();
  if (!isUndirected) {
    for (const e of edges) {
      if (edges.find(r => r.fromIdx === e.toIdx && r.toIdx === e.fromIdx)) {
        bidir.add(`${e.fromIdx}-${e.toIdx}`);
      }
    }
  }

  // Per-node geometry helpers (supports variable radii)
  function nodeRimWidth(r: number) { return r * 0.18; }
  function nodeRimRadius(r: number) { return r + nodeRimWidth(r) * 0.7; }
  function nodeOuterRadius(r: number) {
    const rw = nodeRimWidth(r);
    return nodeRimRadius(r) + rw / 2 + Math.max(settings.pieBorderWidth, 0) / 2 + 1;
  }
  // Keep constants for self-loop/padding using the base nodeRadius
  const rimWidth = nodeRimWidth(nodeRadius);
  const rimRadius = nodeRimRadius(nodeRadius);
  const outerRadius = nodeOuterRadius(nodeRadius);

  const maxW = Math.max(...edges.map(e => e.weight), 1e-6);
  const widthScale = d3.scaleLinear().domain([0, maxW]).range([settings.edgeWidthMin, settings.edgeWidthMax]);
  const opacityScale = d3.scaleLinear().domain([0, maxW]).range([settings.edgeOpacityMin, settings.edgeOpacityMax]);

  // ─── Edge dash thresholds ───
  const { edgeDashEnabled, edgeDashDotted, edgeDashDashed } = settings;
  let dashThreshLow = 0, dashThreshHigh = 0;
  if (edgeDashEnabled) {
    const allWeights: number[] = edges.map(e => e.weight);
    if (settings.showSelfLoops) {
      for (let i = 0; i < n; i++) {
        const w = weights.get(i, i);
        if (w >= settings.edgeThreshold) allWeights.push(w);
      }
    }
    const sortedWeights = allWeights.slice().sort((a, b) => a - b);
    const nw = sortedWeights.length;
    dashThreshLow = sortedWeights[Math.floor(nw * 0.25)] ?? 0;
    dashThreshHigh = sortedWeights[Math.floor(nw * 0.50)] ?? 0;
  }

  function getDashArray(weight: number): string | null {
    if (!edgeDashEnabled) return null;
    if (weight <= dashThreshLow) return edgeDashDotted;
    if (weight <= dashThreshHigh) return edgeDashDashed;
    return null;
  }

  // ─── Layer groups (order = z-order: edges → arrows → nodes → labels on top) ───
  const edgeGroup = rootGroup.append('g');
  const arrowGroup = rootGroup.append('g');
  const selfLoopGroup = rootGroup.append('g');
  const selfLoopArrowGroup = rootGroup.append('g');
  const nodeGroup = rootGroup.append('g');
  const edgeLabelGroup = rootGroup.append('g');
  const selfLoopLabelGroup = rootGroup.append('g');

  // ─── Reusable edge drawing (called on initial render + node drag) ───
  function drawEdges() {
    edgeGroup.selectAll('*').remove();
    arrowGroup.selectAll('*').remove();
    edgeLabelGroup.selectAll('*').remove();
    selfLoopGroup.selectAll('*').remove();
    selfLoopArrowGroup.selectAll('*').remove();
    selfLoopLabelGroup.selectAll('*').remove();

    // Self-loops
    if (settings.showSelfLoops) {
      const centX = nodes.reduce((s, nd) => s + nd.x, 0) / nodes.length;
      const centY = nodes.reduce((s, nd) => s + nd.y, 0) / nodes.length;
      for (let i = 0; i < n; i++) {
        const w = weights.get(i, i);
        if (w > 0 && w >= settings.edgeThreshold) {
          renderSelfLoop(selfLoopGroup, selfLoopArrowGroup, selfLoopLabelGroup, nodes[i]!, w, settings, widthScale, opacityScale, centX, centY, nodeOuterRadius(nodes[i]!.radius), getDashArray, isUndirected, nodes[i]!.radius);
        }
      }
    }

    // Edges
    for (const e of edges) {
      const src = nodes[e.fromIdx]!;
      const tgt = nodes[e.toIdx]!;
      const isBidir = bidir.has(`${e.fromIdx}-${e.toIdx}`);
      const curvature = isBidir ? settings.edgeCurvature : 0;
      const effectiveArrow = isUndirected ? 0 : settings.arrowSize;
      const { path, tipX, tipY, tipDx, tipDy, labelX, labelY } = computeEdgePath(
        src.x, src.y, tgt.x, tgt.y, curvature, nodeOuterRadius(src.radius), nodeOuterRadius(tgt.radius), effectiveArrow,
      );
      if (!path) continue;

      const op = opacityScale(e.weight);

      const edgePath = edgeGroup.append('path')
        .attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', settings.edgeColor)
        .attr('stroke-width', widthScale(e.weight))
        .attr('stroke-opacity', op)
        .attr('stroke-linecap', 'round');
      const dash = getDashArray(e.weight);
      if (dash) edgePath.attr('stroke-dasharray', dash);

      if (enableTooltips) {
        edgePath
          .on('mouseover', function (event: MouseEvent) {
            d3.select(this).attr('stroke', '#e15759').attr('stroke-opacity', 0.85);
            const arrow = isUndirected ? '↔' : '→';
            showTooltip(event, `<b>${src.id} ${arrow} ${tgt.id}</b><br>Weight: ${fmtWeight(e.weight)}`);
          })
          .on('mousemove', function (event: MouseEvent) {
            const tt = document.getElementById('tooltip')!;
            tt.style.left = event.clientX + 12 + 'px';
            tt.style.top = event.clientY - 10 + 'px';
          })
          .on('mouseout', function () {
            d3.select(this).attr('stroke', settings.edgeColor).attr('stroke-opacity', op);
            hideTooltip();
          });
      }

      if (!isUndirected) {
        arrowGroup.append('polygon')
          .attr('points', arrowPoly(tipX, tipY, tipDx, tipDy, settings.arrowSize))
          .attr('fill', settings.arrowColor)
          .attr('opacity', Math.min(op + 0.15, 1));
      }

      if (settings.showEdgeLabels) {
        edgeLabelGroup.append('text')
          .attr('x', labelX)
          .attr('y', labelY)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.3em')
          .attr('font-size', `${settings.edgeLabelSize}px`)
          .attr('fill', settings.edgeLabelColor)
          .attr('pointer-events', 'none')
          .style('paint-order', 'stroke')
          .style('stroke', '#ffffff')
          .style('stroke-width', '3px')
          .style('stroke-linejoin', 'round')
          .text(fmtWeight(e.weight));
      }
    }
  }

  drawEdges();

  // ─── Nodes ───
  const nodeEnter = nodeGroup.selectAll('g.node')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${d.x},${d.y})`);

  nodeEnter.append('circle')
    .attr('class', 'node-rim-bg')
    .attr('r', d => nodeRimRadius(d.radius))
    .attr('fill', 'none')
    .attr('stroke', '#e0e0e0')
    .attr('stroke-width', d => nodeRimWidth(d.radius));

  nodeEnter.append('path')
    .attr('class', 'node-rim-arc')
    .attr('fill', 'none')
    .attr('stroke', d => d.color)
    .attr('stroke-width', d => nodeRimWidth(d.radius))
    .attr('stroke-linecap', 'butt')
    .attr('d', d => {
      const rr = nodeRimRadius(d.radius);
      const frac = model.inits[d.idx]!;
      if (frac <= 0) return '';
      if (frac >= 0.9999) {
        return [
          `M 0 ${-rr}`,
          `A ${rr} ${rr} 0 1 1 0 ${rr}`,
          `A ${rr} ${rr} 0 1 1 0 ${-rr}`,
        ].join(' ');
      }
      const angle = frac * 2 * Math.PI;
      const startX = 0;
      const startY = -rr;
      const endX = rr * Math.sin(angle);
      const endY = -rr * Math.cos(angle);
      const largeArc = angle > Math.PI ? 1 : 0;
      return `M ${startX} ${startY} A ${rr} ${rr} 0 ${largeArc} 1 ${endX} ${endY}`;
    });

  if (settings.pieBorderWidth > 0) {
    nodeEnter.append('circle')
      .attr('class', 'node-rim-border-outer')
      .attr('r', d => { const rr = nodeRimRadius(d.radius); const rw = nodeRimWidth(d.radius); return rr + rw / 2; })
      .attr('fill', 'none')
      .attr('stroke', settings.pieBorderColor)
      .attr('stroke-width', settings.pieBorderWidth);
    nodeEnter.append('circle')
      .attr('class', 'node-rim-border-inner')
      .attr('r', d => { const rr = nodeRimRadius(d.radius); const rw = nodeRimWidth(d.radius); return rr - rw / 2; })
      .attr('fill', 'none')
      .attr('stroke', settings.pieBorderColor)
      .attr('stroke-width', settings.pieBorderWidth);
  }

  nodeEnter.append('path')
    .attr('class', 'node-main')
    .attr('d', d => shapePathD(settings.nodeShape, d.radius))
    .attr('fill', d => d.color)
    .attr('stroke', settings.nodeBorderColor)
    .attr('stroke-width', settings.nodeBorderWidth);

  if (settings.showNodeLabels) {
    const labelY = settings.nodeLabelOffset;
    nodeEnter.append('text')
      .attr('class', 'node-label')
      .attr('y', labelY)
      .attr('dy', '0.35em')
      .style('font-size', `${settings.nodeLabelSize}px`)
      .style('fill', settings.nodeLabelColor)
      .style('text-anchor', 'middle')
      .style('pointer-events', 'none')
      .style('paint-order', settings.nodeLabelHalo ? 'stroke' : 'normal')
      .style('stroke', settings.nodeLabelHalo ? settings.nodeLabelHaloColor : 'none')
      .style('stroke-width', settings.nodeLabelHalo ? `${settings.nodeLabelHaloWidth}px` : '0')
      .style('stroke-linejoin', 'round')
      .text(d => d.id);
  }

  if (enableTooltips) {
    nodeEnter
      .on('mouseover', function (event: MouseEvent, d: NodeDatum) {
        d3.select(this).select('.node-main').attr('stroke', '#333').attr('stroke-width', settings.nodeBorderWidth + 0.5);
        showTooltip(event, `<b>${d.id}</b><br>Init prob: ${(model.inits[d.idx]! * 100).toFixed(1)}%`);
      })
      .on('mousemove', function (event: MouseEvent) {
        const tt = document.getElementById('tooltip')!;
        tt.style.left = event.clientX + 12 + 'px';
        tt.style.top = event.clientY - 10 + 'px';
      })
      .on('mouseout', function () {
        d3.select(this).select('.node-main')
          .attr('stroke', settings.nodeBorderColor)
          .attr('stroke-width', settings.nodeBorderWidth);
        hideTooltip();
      });
  }

  // ─── Node drag ───
  if (enableTooltips) {
    const drag = d3.drag<SVGGElement, NodeDatum>()
      .on('start', function () {
        d3.select(this).raise().style('cursor', 'grabbing');
        hideTooltip();
      })
      .on('drag', function (event, d) {
        d.x = event.x;
        d.y = event.y;
        d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
        drawEdges();
      })
      .on('end', function () {
        d3.select(this).style('cursor', null);
      });
    nodeEnter.call(drag);
    nodeEnter.style('cursor', 'grab');
  }
}

// ═══════════════════════════════════════════════════════════
//  Main render (creates SVG element and delegates to drawNetwork)
// ═══════════════════════════════════════════════════════════

export function renderNetwork(
  container: HTMLElement, model: TNA, settings: NetworkSettings, comm?: CommunityResult, centData?: CentralityResult,
) {
  const rect = container.getBoundingClientRect();
  const graphWidth = Math.max(rect.width, 400);
  const graphHeight = Math.max(rect.height - 30, 350);

  container.innerHTML = '';
  const svg = d3.select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${graphWidth} ${graphHeight}`)
    .attr('width', '100%')
    .attr('height', '100%')
    .style('min-height', '300px')
    .style('cursor', 'grab');

  const rootGroup = svg.append('g') as d3.Selection<SVGGElement, unknown, null, undefined>;
  drawNetwork(rootGroup, model, settings, graphWidth, graphHeight, comm, true, centData);

  // Pan & zoom
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.2, 8])
    .on('zoom', (event) => {
      rootGroup.attr('transform', event.transform);
    });
  svg.call(zoom);
  // Double-click resets zoom
  svg.on('dblclick.zoom', () => {
    svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
  });
}

/**
 * Render a network into an existing SVG <g> element.
 * Used by the combined canvas mode to compose multiple networks into one SVG.
 * Tooltips are disabled since the layout is for static export.
 */
export function renderNetworkIntoGroup(
  gEl: SVGGElement, model: TNA, settings: NetworkSettings,
  width: number, height: number, comm?: CommunityResult, centData?: CentralityResult,
) {
  const g = d3.select(gEl) as d3.Selection<SVGGElement, unknown, null, undefined>;
  drawNetwork(g, model, settings, width, height, comm, false, centData);
}

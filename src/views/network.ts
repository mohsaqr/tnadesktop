/**
 * Network graph visualization with configurable layout, edges, and self-loops.
 */
import * as d3 from 'd3';
import type { TNA, CommunityResult } from 'tnaj';
import type { NetworkSettings } from '../main';
import { showTooltip, hideTooltip } from '../main';
import { NODE_COLORS, COMMUNITY_COLORS } from './colors';

interface NodeDatum {
  id: string;
  idx: number;
  color: string;
  x: number;
  y: number;
}

interface EdgeDatum {
  fromIdx: number;
  toIdx: number;
  weight: number;
}

// ═══════════════════════════════════════════════════════════
//  Layout algorithms
// ═══════════════════════════════════════════════════════════

function rescalePositions(
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
  for (const p of positions) {
    p.x = padding + ((p.x - minX) / rangeX) * usableW;
    p.y = padding + ((p.y - minY) / rangeY) * usableH;
  }
}

function circularLayout(
  n: number, cx: number, cy: number, radius: number,
): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

function springLayout(
  n: number, weights: { get(i: number, j: number): number },
  width: number, height: number, padding: number,
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

  const nodes = Array.from({ length: n }, (_, i) => ({ index: i, x: 0, y: 0 }));

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((_d, i) => i).distance(100).strength((d: any) => d.weight))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(padding * 0.5))
    .stop();

  for (let i = 0; i < 300; i++) sim.tick();

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
  width: number, height: number, padding: number,
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
  function randomVec(): number[] {
    const v = Array.from({ length: n }, () => Math.random() - 0.5);
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

// ═══════════════════════════════════════════════════════════
//  Edge path helpers
// ═══════════════════════════════════════════════════════════

function computeEdgePath(
  sx: number, sy: number, tx: number, ty: number,
  curvature: number, outerRadius: number, arrowSize: number,
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
  const startX = sx + (sdx / slen) * outerRadius;
  const startY = sy + (sdy / slen) * outerRadius;

  const edx = tx - mx;
  const edy = ty - my;
  const elen = Math.sqrt(edx * edx + edy * edy);
  const eux = edx / elen;
  const euy = edy / elen;

  // Arrow tip sits at the outer radius; edge path ends at the arrow base
  const tipX = tx - eux * outerRadius;
  const tipY = ty - euy * outerRadius;
  const endX = tx - eux * (outerRadius + arrowSize);
  const endY = ty - euy * (outerRadius + arrowSize);

  const t = 0.55;
  const labelX = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * mx + t * t * endX;
  const labelY = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * my + t * t * endY;

  return {
    path: `M${startX},${startY} Q${mx},${my} ${endX},${endY}`,
    tipX, tipY, tipDx: eux, tipDy: euy, labelX, labelY,
  };
}

function arrowPoly(
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
) {
  const loopR = settings.nodeRadius * 0.7; // visible loop
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
      .text(weight.toFixed(2).replace(/^0\./, '.'));
  }
}

// ═══════════════════════════════════════════════════════════
//  Main render
// ═══════════════════════════════════════════════════════════

export function renderNetwork(
  container: HTMLElement, model: TNA, settings: NetworkSettings, comm?: CommunityResult,
) {
  const rect = container.getBoundingClientRect();
  const graphWidth = Math.max(rect.width, 400);
  const graphHeight = Math.max(rect.height - 30, 350);
  const n = model.labels.length;
  const weights = model.weights;
  const nodeRadius = settings.nodeRadius;
  // Padding: just enough for nodes + self-loops to not clip
  const selfLoopExtent = settings.showSelfLoops ? (nodeRadius * 0.7 * 2 + 6) : 0;
  const padding = nodeRadius + Math.max(settings.graphPadding, selfLoopExtent);

  // ─── Layout ───
  let positions: { x: number; y: number }[];
  switch (settings.layout) {
    case 'spring':
      positions = springLayout(n, weights, graphWidth, graphHeight, padding);
      break;
    case 'kamada_kawai':
      positions = kamadaKawaiLayout(n, weights, graphWidth, graphHeight, padding);
      break;
    case 'spectral':
      positions = spectralLayout(n, weights, graphWidth, graphHeight, padding);
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

  const nodes: NodeDatum[] = model.labels.map((id, i) => {
    const customColor = settings.nodeColors[id];
    return {
      id, idx: i,
      color: customColor ?? NODE_COLORS[i % NODE_COLORS.length]!,
      x: positions[i]!.x,
      y: positions[i]!.y,
    };
  });

  // Apply community colors
  if (comm) {
    const methodKey = Object.keys(comm.assignments)[0]!;
    const assign = comm.assignments[methodKey]!;
    nodes.forEach((nd, i) => {
      nd.color = COMMUNITY_COLORS[assign[i]! % COMMUNITY_COLORS.length]!;
    });
  }

  // ─── Build edges ───
  const edges: EdgeDatum[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const w = weights.get(i, j);
      if (w > 0 && w >= settings.edgeThreshold) edges.push({ fromIdx: i, toIdx: j, weight: w });
    }
  }

  const bidir = new Set<string>();
  for (const e of edges) {
    if (edges.find(r => r.fromIdx === e.toIdx && r.toIdx === e.fromIdx)) {
      bidir.add(`${e.fromIdx}-${e.toIdx}`);
    }
  }

  // ─── Compute effective outer radius (includes donut ring + border) ───
  const rimWidth = nodeRadius * 0.18;
  const rimRadius = nodeRadius + rimWidth * 0.7;
  const outerRadius = rimRadius + rimWidth / 2 + Math.max(settings.pieBorderWidth, 0) / 2 + 1;

  const maxW = Math.max(...edges.map(e => e.weight), 1e-6);
  const widthScale = d3.scaleLinear().domain([0, maxW]).range([settings.edgeWidthMin, settings.edgeWidthMax]);
  const opacityScale = d3.scaleLinear().domain([0, maxW]).range([settings.edgeOpacityMin, settings.edgeOpacityMax]);

  // ─── Edge dash thresholds ───
  const { edgeDashEnabled, edgeDashDotted, edgeDashDashed } = settings;
  let dashThreshLow = 0, dashThreshHigh = 0;
  if (edgeDashEnabled) {
    // Collect all edge weights (including self-loops if shown)
    const allWeights: number[] = edges.map(e => e.weight);
    if (settings.showSelfLoops) {
      for (let i = 0; i < n; i++) {
        const w = weights.get(i, i);
        if (w >= settings.edgeThreshold) allWeights.push(w);
      }
    }
    const sortedWeights = allWeights.slice().sort((a, b) => a - b);
    const nw = sortedWeights.length;
    // Bottom 25% dotted, 25-50% dashed, top 50% solid
    dashThreshLow = sortedWeights[Math.floor(nw * 0.25)] ?? 0;
    dashThreshHigh = sortedWeights[Math.floor(nw * 0.50)] ?? 0;
  }

  function getDashArray(weight: number): string | null {
    if (!edgeDashEnabled) return null;
    if (weight <= dashThreshLow) return edgeDashDotted;
    if (weight <= dashThreshHigh) return edgeDashDashed;
    return null;
  }

  // ─── SVG ───
  container.innerHTML = '';
  const svg = d3.select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${graphWidth} ${graphHeight}`)
    .attr('width', '100%')
    .attr('height', '100%')
    .style('min-height', '300px');

  const edgeGroup = svg.append('g');
  const arrowGroup = svg.append('g');
  const edgeLabelGroup = svg.append('g');
  const nodeGroup = svg.append('g');
  // Self-loop layer ABOVE nodes so donut ring doesn't cover them
  const selfLoopGroup = svg.append('g');
  const selfLoopArrowGroup = svg.append('g');
  const selfLoopLabelGroup = svg.append('g');

  // ─── Self-loops ───
  if (settings.showSelfLoops) {
    // Compute graph centroid for outward direction
    const centX = nodes.reduce((s, nd) => s + nd.x, 0) / nodes.length;
    const centY = nodes.reduce((s, nd) => s + nd.y, 0) / nodes.length;
    for (let i = 0; i < n; i++) {
      const w = weights.get(i, i);
      if (w > 0 && w >= settings.edgeThreshold) {
        renderSelfLoop(selfLoopGroup, selfLoopArrowGroup, selfLoopLabelGroup, nodes[i]!, w, settings, widthScale, opacityScale, centX, centY, outerRadius, getDashArray);
      }
    }
  }

  // ─── Edges ───
  for (const e of edges) {
    const src = nodes[e.fromIdx]!;
    const tgt = nodes[e.toIdx]!;
    const isBidir = bidir.has(`${e.fromIdx}-${e.toIdx}`);
    const curvature = isBidir ? settings.edgeCurvature : 0;
    const { path, tipX, tipY, tipDx, tipDy, labelX, labelY } = computeEdgePath(
      src.x, src.y, tgt.x, tgt.y, curvature, outerRadius, settings.arrowSize,
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
    edgePath
      .on('mouseover', function (event: MouseEvent) {
        d3.select(this).attr('stroke', '#e15759').attr('stroke-opacity', 0.85);
        showTooltip(event, `<b>${src.id} → ${tgt.id}</b><br>Weight: ${e.weight.toFixed(4)}`);
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

    arrowGroup.append('polygon')
      .attr('points', arrowPoly(tipX, tipY, tipDx, tipDy, settings.arrowSize))
      .attr('fill', settings.arrowColor)
      .attr('opacity', Math.min(op + 0.15, 1));

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
        .text(e.weight.toFixed(2).replace(/^0\./, '.'));
    }
  }

  // ─── Nodes ───
  const nodeEnter = nodeGroup.selectAll('g.node')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${d.x},${d.y})`);

  // Donut ring: background track (light gray full circle)
  nodeEnter.append('circle')
    .attr('class', 'node-rim-bg')
    .attr('r', rimRadius)
    .attr('fill', 'none')
    .attr('stroke', '#e0e0e0')
    .attr('stroke-width', rimWidth);

  // Donut ring: filled arc proportional to init probability
  nodeEnter.append('path')
    .attr('class', 'node-rim-arc')
    .attr('fill', 'none')
    .attr('stroke', d => d.color)
    .attr('stroke-width', rimWidth)
    .attr('stroke-linecap', 'butt')
    .attr('d', d => {
      const frac = model.inits[d.idx]!; // 0–1
      if (frac <= 0) return '';
      if (frac >= 0.9999) {
        return [
          `M 0 ${-rimRadius}`,
          `A ${rimRadius} ${rimRadius} 0 1 1 0 ${rimRadius}`,
          `A ${rimRadius} ${rimRadius} 0 1 1 0 ${-rimRadius}`,
        ].join(' ');
      }
      const angle = frac * 2 * Math.PI;
      const startX = 0;
      const startY = -rimRadius;
      const endX = rimRadius * Math.sin(angle);
      const endY = -rimRadius * Math.cos(angle);
      const largeArc = angle > Math.PI ? 1 : 0;
      return `M ${startX} ${startY} A ${rimRadius} ${rimRadius} 0 ${largeArc} 1 ${endX} ${endY}`;
    });

  // Pie border: optional stroke around the donut ring
  if (settings.pieBorderWidth > 0) {
    // Outer border
    nodeEnter.append('circle')
      .attr('class', 'node-rim-border-outer')
      .attr('r', rimRadius + rimWidth / 2)
      .attr('fill', 'none')
      .attr('stroke', settings.pieBorderColor)
      .attr('stroke-width', settings.pieBorderWidth);
    // Inner border
    nodeEnter.append('circle')
      .attr('class', 'node-rim-border-inner')
      .attr('r', rimRadius - rimWidth / 2)
      .attr('fill', 'none')
      .attr('stroke', settings.pieBorderColor)
      .attr('stroke-width', settings.pieBorderWidth);
  }

  // Main node circle
  nodeEnter.append('circle')
    .attr('class', 'node-main')
    .attr('r', nodeRadius)
    .attr('fill', d => d.color)
    .attr('stroke', settings.nodeBorderColor)
    .attr('stroke-width', settings.nodeBorderWidth);

  // Node labels with optional offset and halo
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

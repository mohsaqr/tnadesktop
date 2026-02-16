/**
 * Network graph visualization (circular layout with curved edges).
 * Extracted from the tnaj demo.
 */
import * as d3 from 'd3';
import type { TNA, CommunityResult } from 'tnaj';
import { showTooltip, hideTooltip } from '../main';
import { NODE_COLORS, COMMUNITY_COLORS } from './colors';

const NODE_R = 26;

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

function computeEdgePath(
  sx: number, sy: number, tx: number, ty: number, curvature: number,
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
  const startX = sx + (sdx / slen) * NODE_R;
  const startY = sy + (sdy / slen) * NODE_R;

  const edx = tx - mx;
  const edy = ty - my;
  const elen = Math.sqrt(edx * edx + edy * edy);
  const eux = edx / elen;
  const euy = edy / elen;

  const tipX = tx - eux * NODE_R;
  const tipY = ty - euy * NODE_R;
  const endX = tx - eux * (NODE_R + 8);
  const endY = ty - euy * (NODE_R + 8);

  const t = 0.55;
  const labelX = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * mx + t * t * endX;
  const labelY = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * my + t * t * endY;

  return {
    path: `M${startX},${startY} Q${mx},${my} ${endX},${endY}`,
    tipX, tipY, tipDx: eux, tipDy: euy, labelX, labelY,
  };
}

function arrowPoly(tipX: number, tipY: number, dx: number, dy: number): string {
  const len = 7;
  const halfW = 3.5;
  const baseX = tipX - dx * len;
  const baseY = tipY - dy * len;
  const lx = baseX - dy * halfW;
  const ly = baseY + dx * halfW;
  const rx = baseX + dy * halfW;
  const ry = baseY - dx * halfW;
  return `${tipX},${tipY} ${lx},${ly} ${rx},${ry}`;
}

export function renderNetwork(container: HTMLElement, model: TNA, comm?: CommunityResult) {
  const rect = container.getBoundingClientRect();
  const graphWidth = Math.max(rect.width, 400);
  const graphHeight = Math.max(rect.height - 30, 350);
  const n = model.labels.length;
  const weights = model.weights;

  // Layout
  const cx = graphWidth / 2;
  const cy = graphHeight / 2;
  const radius = Math.min(cx, cy) - NODE_R - 30;

  const nodes: NodeDatum[] = model.labels.map((id, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      id, idx: i,
      color: NODE_COLORS[i % NODE_COLORS.length]!,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
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

  // Build edges
  const edges: EdgeDatum[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const w = weights.get(i, j);
      if (w >= 0.05) edges.push({ fromIdx: i, toIdx: j, weight: w });
    }
  }

  const bidir = new Set<string>();
  for (const e of edges) {
    if (edges.find(r => r.fromIdx === e.toIdx && r.toIdx === e.fromIdx)) {
      bidir.add(`${e.fromIdx}-${e.toIdx}`);
    }
  }

  const maxW = Math.max(...edges.map(e => e.weight), 1e-6);
  const widthScale = d3.scaleLinear().domain([0, maxW]).range([0.6, 2.8]);
  const opacityScale = d3.scaleLinear().domain([0, maxW]).range([0.2, 0.55]);

  const EDGE_COLOR = '#4a7fba';
  const ARROW_COLOR = '#3a6a9f';

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

  // Edges
  for (const e of edges) {
    const src = nodes[e.fromIdx]!;
    const tgt = nodes[e.toIdx]!;
    const isBidir = bidir.has(`${e.fromIdx}-${e.toIdx}`);
    const curvature = isBidir ? 22 : 0;
    const { path, tipX, tipY, tipDx, tipDy, labelX, labelY } = computeEdgePath(
      src.x, src.y, tgt.x, tgt.y, curvature,
    );
    if (!path) continue;

    const op = opacityScale(e.weight);

    edgeGroup.append('path')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', EDGE_COLOR)
      .attr('stroke-width', widthScale(e.weight))
      .attr('stroke-opacity', op)
      .attr('stroke-linecap', 'round')
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
        d3.select(this).attr('stroke', EDGE_COLOR).attr('stroke-opacity', op);
        hideTooltip();
      });

    arrowGroup.append('polygon')
      .attr('points', arrowPoly(tipX, tipY, tipDx, tipDy))
      .attr('fill', ARROW_COLOR)
      .attr('opacity', op + 0.15);

    edgeLabelGroup.append('text')
      .attr('x', labelX)
      .attr('y', labelY)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('font-size', '7px')
      .attr('fill', '#556')
      .attr('pointer-events', 'none')
      .text(e.weight.toFixed(2).replace(/^0\./, '.'));
  }

  // Nodes
  const nodeEnter = nodeGroup.selectAll('g.node')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${d.x},${d.y})`);

  nodeEnter.append('circle')
    .attr('r', NODE_R)
    .attr('fill', d => d.color)
    .attr('stroke', '#fff')
    .attr('stroke-width', 2.5);

  nodeEnter.append('text')
    .attr('class', 'node-label')
    .attr('dy', '0.35em')
    .text(d => d.id);

  nodeEnter
    .on('mouseover', function (event: MouseEvent, d: NodeDatum) {
      d3.select(this).select('circle').attr('stroke', '#333').attr('stroke-width', 3);
      showTooltip(event, `<b>${d.id}</b><br>Init prob: ${model.inits[d.idx]!.toFixed(4)}`);
    })
    .on('mousemove', function (event: MouseEvent) {
      const tt = document.getElementById('tooltip')!;
      tt.style.left = event.clientX + 12 + 'px';
      tt.style.top = event.clientY - 10 + 'px';
    })
    .on('mouseout', function () {
      d3.select(this).select('circle').attr('stroke', '#fff').attr('stroke-width', 2.5);
      hideTooltip();
    });
}

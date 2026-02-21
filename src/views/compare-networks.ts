/**
 * Compare network properties across groups.
 * Layout: combined diff networks, heatmaps, and comparison table.
 * No permutation — that's in the Permutation tab.
 */
import * as d3 from 'd3';
import type { GroupTNA, TNA } from 'tnaj';
import { summary } from 'tnaj';
import { showTooltip, hideTooltip } from '../main';
import { state } from '../main';
import { addPanelDownloadButtons } from './export';
import { resolvePositions, getLastLayoutDimensions, rescalePositions, computeEdgePath, arrowPoly, fmtWeight, fmtNum } from './network';
import { NODE_COLORS } from './colors';
import { createViewToggle } from './dashboard';

interface GroupMetrics {
  group: string;
  nStates: number;
  nEdges: number;
  density: number;
  meanWeight: number;
  maxWeight: number;
  hasSelfLoops: boolean;
  reciprocity: number;
}

function computeMetrics(model: TNA, groupName: string): GroupMetrics {
  const s = summary(model) as any;
  const n = model.labels.length;

  let mutual = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (model.weights.get(i, j) > 0) {
        total++;
        if (model.weights.get(j, i) > 0) mutual++;
      }
    }
  }

  return {
    group: groupName,
    nStates: s.nStates,
    nEdges: s.nEdges,
    density: s.density,
    meanWeight: s.meanWeight,
    maxWeight: s.maxWeight,
    hasSelfLoops: s.hasSelfLoops,
    reciprocity: total > 0 ? mutual / total : 0,
  };
}

export function renderCompareNetworksTab(
  container: HTMLElement,
  fullModel: GroupTNA,
) {
  const groupNames = Object.keys(fullModel.models);
  if (groupNames.length < 2) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">Need at least 2 groups to compare networks.</div>';
    return;
  }

  const metrics = groupNames.map(g => computeMetrics(fullModel.models[g]!, g));

  // Generate all pairs
  const pairs: [string, string][] = [];
  for (let i = 0; i < groupNames.length; i++) {
    for (let j = i + 1; j < groupNames.length; j++) {
      pairs.push([groupNames[i]!, groupNames[j]!]);
    }
  }

  createViewToggle(container,
    (fig) => {
      const nPairs = pairs.length;
      const cols = nPairs <= 2 ? nPairs : nPairs <= 4 ? 2 : Math.ceil(Math.sqrt(nPairs));
      const rows = Math.ceil(nPairs / cols);

      // ── Combined Difference Networks (single SVG canvas) ──
      const cellW = 500;
      const baseDims = getLastLayoutDimensions();
      const cellH = Math.min(baseDims.height || 400, 400);
      const labelH = 24;
      const legendH = 28;
      const totalW = cols * cellW;
      const totalH = rows * (cellH + labelH) + legendH;

      const diffPanel = document.createElement('div');
      diffPanel.className = 'panel';
      diffPanel.innerHTML = `<div class="panel-title">Difference Networks</div>`;
      addPanelDownloadButtons(diffPanel, { image: true, filename: 'compare-diff-networks' });

      const svgNS = 'http://www.w3.org/2000/svg';
      const svgEl = document.createElementNS(svgNS, 'svg');
      svgEl.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
      svgEl.setAttribute('width', '100%');
      svgEl.style.minHeight = '300px';
      svgEl.style.background = '#fff';
      diffPanel.appendChild(svgEl);
      fig.appendChild(diffPanel);

      // ── Combined Heatmaps (single panel, CSS grid inside) ──
      const heatPanel = document.createElement('div');
      heatPanel.className = 'panel';
      heatPanel.style.marginTop = '16px';
      heatPanel.innerHTML = `<div class="panel-title">Weight Difference Heatmaps</div>`;
      addPanelDownloadButtons(heatPanel, { image: true, filename: 'compare-heatmaps' });

      const heatGrid = document.createElement('div');
      if (nPairs > 1) {
        heatGrid.style.display = 'grid';
        heatGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        heatGrid.style.gap = '12px';
      }

      const heatContainers: { el: HTMLElement; g1: string; g2: string }[] = [];
      for (const [g1, g2] of pairs) {
        const wrapper = document.createElement('div');
        const title = document.createElement('div');
        title.style.textAlign = 'center';
        title.style.fontSize = '11px';
        title.style.fontWeight = '600';
        title.style.color = '#555';
        title.style.marginBottom = '4px';
        title.textContent = `${g1} vs ${g2}`;
        wrapper.appendChild(title);
        const heatEl = document.createElement('div');
        wrapper.appendChild(heatEl);
        heatGrid.appendChild(wrapper);
        heatContainers.push({ el: heatEl, g1, g2 });
      }
      heatPanel.appendChild(heatGrid);
      fig.appendChild(heatPanel);

      // Render after layout
      requestAnimationFrame(() => {
        // Diff networks into combined SVG
        let idx = 0;
        for (const [g1, g2] of pairs) {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const x = col * cellW;
          const y = row * (cellH + labelH);

          const label = document.createElementNS(svgNS, 'text');
          label.setAttribute('x', String(x + cellW / 2));
          label.setAttribute('y', String(y + 16));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('font-size', '13');
          label.setAttribute('font-weight', '700');
          label.setAttribute('fill', '#555');
          label.textContent = `${g1} vs ${g2}`;
          svgEl.appendChild(label);

          const gEl = document.createElementNS(svgNS, 'g') as SVGGElement;
          gEl.setAttribute('transform', `translate(${x}, ${y + labelH})`);
          svgEl.appendChild(gEl);

          renderDiffNetworkIntoGroup(gEl, fullModel.models[g1]!, fullModel.models[g2]!, g1, g2, cellW, cellH);
          idx++;
        }

        // Shared legend at bottom
        const ly = totalH - legendH + 4;
        const leg = d3.select(svgEl);
        leg.append('rect').attr('x', 10).attr('y', ly).attr('width', 14).attr('height', 4).attr('fill', DIFF_POS).attr('rx', 2);
        leg.append('text').attr('x', 28).attr('y', ly + 4).attr('font-size', '10px').attr('fill', '#555').text('A > B');
        leg.append('rect').attr('x', 80).attr('y', ly).attr('width', 14).attr('height', 4).attr('fill', DIFF_NEG).attr('rx', 2);
        leg.append('text').attr('x', 98).attr('y', ly + 4).attr('font-size', '10px').attr('fill', '#555').text('A < B');

        // Heatmaps
        for (const { el, g1, g2 } of heatContainers) {
          renderDiffHeatmap(el, fullModel.models[g1]!, fullModel.models[g2]!, g1, g2);
        }
      });
    },
    (tbl) => {
      // Network Properties table
      const propsPanel = document.createElement('div');
      propsPanel.className = 'panel';
      propsPanel.innerHTML = `<div class="panel-title">Network Properties</div>`;

      let propsHtml = '<table class="preview-table" style="font-size:12px"><thead><tr>';
      propsHtml += '<th>Group</th><th>States</th><th>Edges</th><th>Density</th><th>Mean Weight</th><th>Max Weight</th><th>Reciprocity</th><th>Self-loops</th>';
      propsHtml += '</tr></thead><tbody>';
      for (const m of metrics) {
        propsHtml += '<tr>';
        propsHtml += `<td style="font-weight:600">${m.group}</td>`;
        propsHtml += `<td>${m.nStates}</td>`;
        propsHtml += `<td>${m.nEdges}</td>`;
        propsHtml += `<td>${fmtNum(m.density, 3)}</td>`;
        propsHtml += `<td>${fmtNum(m.meanWeight)}</td>`;
        propsHtml += `<td>${fmtNum(m.maxWeight)}</td>`;
        propsHtml += `<td>${fmtNum(m.reciprocity, 3)}</td>`;
        propsHtml += `<td>${m.hasSelfLoops ? 'Yes' : 'No'}</td>`;
        propsHtml += '</tr>';
      }
      propsHtml += '</tbody></table>';
      propsPanel.innerHTML += propsHtml;
      addPanelDownloadButtons(propsPanel, { csv: true, filename: 'compare-properties' });
      tbl.appendChild(propsPanel);

      // Transition weights table
      const weightsPanel = document.createElement('div');
      weightsPanel.className = 'panel';
      weightsPanel.style.marginTop = '16px';
      weightsPanel.style.overflow = 'auto';
      weightsPanel.style.maxHeight = '600px';
      weightsPanel.innerHTML = `<div class="panel-title">Transition Weights</div>`;

      let wHtml = '<table class="preview-table" style="font-size:11px"><thead><tr>';
      wHtml += '<th>From</th><th>To</th>';
      for (const g of groupNames) wHtml += `<th>${g}</th>`;
      if (groupNames.length === 2) wHtml += '<th>Diff</th>';
      wHtml += '</tr></thead><tbody>';

      const labels = fullModel.models[groupNames[0]!]!.labels;
      for (let i = 0; i < labels.length; i++) {
        for (let j = 0; j < labels.length; j++) {
          const vals = groupNames.map(g => fullModel.models[g]!.weights.get(i, j));
          if (vals.every(v => v === 0)) continue;
          wHtml += `<tr><td>${labels[i]}</td><td>${labels[j]}</td>`;
          for (const v of vals) wHtml += `<td>${fmtNum(v)}</td>`;
          if (groupNames.length === 2) {
            const diff = vals[0]! - vals[1]!;
            const color = diff > 0 ? '#28a745' : diff < 0 ? '#dc3545' : '#333';
            wHtml += `<td style="color:${color};font-weight:600">${diff > 0 ? '+' : ''}${fmtNum(diff)}</td>`;
          }
          wHtml += '</tr>';
        }
      }
      wHtml += '</tbody></table>';
      weightsPanel.innerHTML += wHtml;
      addPanelDownloadButtons(weightsPanel, { csv: true, filename: 'compare-weights' });
      tbl.appendChild(weightsPanel);
    },
    'cmp-net',
  );
}

// ═══════════════════════════════════════════════════════════
//  Diff Heatmap
// ═══════════════════════════════════════════════════════════

function renderDiffHeatmap(
  container: HTMLElement, modelA: TNA, modelB: TNA,
  nameA: string, nameB: string,
) {
  const labels = modelA.labels;
  const n = labels.length;

  const rect = container.getBoundingClientRect();
  const size = Math.min(Math.max(rect.width, 300), 500);
  const margin = { top: 10, right: 10, bottom: 60, left: 60 };
  const innerW = size - margin.left - margin.right;
  const innerH = size - margin.top - margin.bottom;
  const cellW = innerW / n;
  const cellH = innerH / n;

  const diffs: number[][] = [];
  let maxAbs = 0;
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const d = modelA.weights.get(i, j) - modelB.weights.get(i, j);
      row.push(d);
      if (Math.abs(d) > maxAbs) maxAbs = Math.abs(d);
    }
    diffs.push(row);
  }
  if (maxAbs === 0) maxAbs = 1;

  const colorScale = d3.scaleDiverging(d3.interpolateRdBu).domain([maxAbs, 0, -maxAbs]);

  d3.select(container).selectAll('*').remove();
  const svg = d3.select(container)
    .append('svg')
    .attr('width', size)
    .attr('height', size);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const val = diffs[i]![j]!;
      g.append('rect')
        .attr('x', j * cellW)
        .attr('y', i * cellH)
        .attr('width', cellW - 1)
        .attr('height', cellH - 1)
        .attr('fill', colorScale(val))
        .attr('stroke', '#ddd')
        .attr('stroke-width', 0.5)
        .on('mouseover', function (event: MouseEvent) {
          d3.select(this).attr('stroke', '#333').attr('stroke-width', 2);
          showTooltip(event,
            `<b>${labels[i]} → ${labels[j]}</b><br>` +
            `${nameA}: ${fmtNum(modelA.weights.get(i, j))}<br>` +
            `${nameB}: ${fmtNum(modelB.weights.get(i, j))}<br>` +
            `Diff: ${fmtNum(val)}`);
        })
        .on('mousemove', function (event: MouseEvent) {
          const tt = document.getElementById('tooltip')!;
          tt.style.left = event.clientX + 12 + 'px';
          tt.style.top = event.clientY - 10 + 'px';
        })
        .on('mouseout', function () {
          d3.select(this).attr('stroke', '#ddd').attr('stroke-width', 0.5);
          hideTooltip();
        });

      if (cellW > 25 && cellH > 14 && Math.abs(val) > 0.001) {
        g.append('text')
          .attr('x', j * cellW + cellW / 2)
          .attr('y', i * cellH + cellH / 2)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('font-size', '8px')
          .attr('fill', Math.abs(val) > maxAbs * 0.6 ? '#fff' : '#333')
          .attr('pointer-events', 'none')
          .text(fmtNum(val, 3));
      }
    }
  }

  for (let i = 0; i < n; i++) {
    g.append('text')
      .attr('x', i * cellW + cellW / 2)
      .attr('y', innerH + 12)
      .attr('text-anchor', 'end')
      .attr('font-size', '9px')
      .attr('fill', '#555')
      .attr('transform', `rotate(-40, ${i * cellW + cellW / 2}, ${innerH + 12})`)
      .text(labels[i]!);
    g.append('text')
      .attr('x', -6)
      .attr('y', i * cellH + cellH / 2)
      .attr('text-anchor', 'end')
      .attr('dy', '0.35em')
      .attr('font-size', '9px')
      .attr('fill', '#555')
      .text(labels[i]!);
  }
}

// ═══════════════════════════════════════════════════════════
//  Difference Network — renders into a <g> element
// ═══════════════════════════════════════════════════════════

const DIFF_POS = '#28a745';
const DIFF_NEG = '#dc3545';

function renderDiffNetworkIntoGroup(
  gEl: SVGGElement, modelA: TNA, modelB: TNA,
  nameA: string, nameB: string,
  width: number, height: number,
) {
  const g = d3.select(gEl) as d3.Selection<SVGGElement, unknown, null, undefined>;
  const labels = modelA.labels;
  const n = labels.length;
  const threshold = state.networkSettings.edgeThreshold;
  const nodeRadius = 18;
  const padding = 35;

  interface DiffEdge { from: number; to: number; diff: number; }
  const edges: DiffEdge[] = [];
  let maxAbs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = modelA.weights.get(i, j) - modelB.weights.get(i, j);
      if (Math.abs(d) > threshold) {
        edges.push({ from: i, to: j, diff: d });
        if (Math.abs(d) > maxAbs) maxAbs = Math.abs(d);
      }
    }
  }
  if (maxAbs === 0) maxAbs = 1;

  // Get positions and rescale to this cell
  const positions = resolvePositions(labels);
  rescalePositions(positions, width, height, padding);

  const rimWidth = nodeRadius * 0.18;
  const rimRadius = nodeRadius + rimWidth * 0.7;
  const outerRadius = rimRadius + rimWidth / 2 + 2;
  const arrowSize = 6;

  const widthScale = d3.scaleLinear().domain([0, maxAbs]).range([0.8, 3.5]);
  const opacityScale = d3.scaleLinear().domain([0, maxAbs]).range([0.4, 0.9]);

  const bidir = new Set<string>();
  for (const e of edges) {
    if (edges.find(r => r.from === e.to && r.to === e.from)) {
      bidir.add(`${e.from}-${e.to}`);
    }
  }

  const edgeGroup = g.append('g');
  const arrowGroup = g.append('g');
  const edgeLabelGroup = g.append('g');
  const nodeGroup = g.append('g');

  for (const e of edges) {
    const src = positions[e.from]!;
    const tgt = positions[e.to]!;
    const isBidir = bidir.has(`${e.from}-${e.to}`);
    const curvature = isBidir ? 20 : 0;
    const color = e.diff > 0 ? DIFF_POS : DIFF_NEG;
    const absDiff = Math.abs(e.diff);
    const op = opacityScale(absDiff);

    const { path, tipX, tipY, tipDx, tipDy, labelX, labelY } = computeEdgePath(
      src.x, src.y, tgt.x, tgt.y, curvature, outerRadius, outerRadius, arrowSize,
    );
    if (!path) continue;

    const edgePath = edgeGroup.append('path')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', widthScale(absDiff))
      .attr('stroke-opacity', op)
      .attr('stroke-linecap', 'round');

    edgePath
      .on('mouseover', function (event: MouseEvent) {
        d3.select(this).attr('stroke-opacity', 1).attr('stroke-width', widthScale(absDiff) + 1);
        showTooltip(event,
          `<b>${labels[e.from]} → ${labels[e.to]}</b><br>` +
          `${nameA}: ${fmtNum(modelA.weights.get(e.from, e.to))}<br>` +
          `${nameB}: ${fmtNum(modelB.weights.get(e.from, e.to))}<br>` +
          `Diff: <span style="color:${color};font-weight:600">${e.diff > 0 ? '+' : ''}${fmtNum(e.diff)}</span>`);
      })
      .on('mousemove', function (event: MouseEvent) {
        const tt = document.getElementById('tooltip')!;
        tt.style.left = event.clientX + 12 + 'px';
        tt.style.top = event.clientY - 10 + 'px';
      })
      .on('mouseout', function () {
        d3.select(this).attr('stroke-opacity', op).attr('stroke-width', widthScale(absDiff));
        hideTooltip();
      });

    arrowGroup.append('polygon')
      .attr('points', arrowPoly(tipX, tipY, tipDx, tipDy, arrowSize))
      .attr('fill', color)
      .attr('opacity', Math.min(op + 0.15, 1));

    edgeLabelGroup.append('text')
      .attr('x', labelX)
      .attr('y', labelY)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('font-size', '8px')
      .attr('fill', color)
      .attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .style('paint-order', 'stroke')
      .style('stroke', '#ffffff')
      .style('stroke-width', '3px')
      .style('stroke-linejoin', 'round')
      .text((e.diff > 0 ? '+' : '') + fmtWeight(e.diff));
  }

  const nodeEnter = nodeGroup.selectAll('g.node')
    .data(labels.map((id, i) => ({ id, idx: i, x: positions[i]!.x, y: positions[i]!.y })))
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${d.x},${d.y})`);

  nodeEnter.append('circle')
    .attr('r', nodeRadius)
    .attr('fill', (_d, i) => NODE_COLORS[i % NODE_COLORS.length]!)
    .attr('stroke', '#999')
    .attr('stroke-width', 1.5);

  nodeEnter.append('text')
    .attr('dy', '0.35em')
    .attr('text-anchor', 'middle')
    .attr('font-size', '9px')
    .attr('fill', '#000')
    .attr('pointer-events', 'none')
    .style('paint-order', 'stroke')
    .style('stroke', '#fff')
    .style('stroke-width', '3px')
    .style('stroke-linejoin', 'round')
    .text(d => d.id);
}

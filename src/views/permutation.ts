/**
 * Permutation test tab: compare edge weights between all group pairs.
 * Shows significant-edges-only networks (combined canvas), heatmaps,
 * and table with p-values, effect sizes, and significance stars.
 */
import * as d3 from 'd3';
import type { TNA, GroupTNA } from 'tnaj';
import { showTooltip, hideTooltip } from '../main';
import { state } from '../main';
import { permutationTest } from '../analysis/permutation';
import type { PermutationResult, PermutationOptions } from '../analysis/permutation';
import { addPanelDownloadButtons } from './export';
import { resolvePositions, getLastLayoutDimensions, rescalePositions, computeEdgePath, arrowPoly, fmtWeight, fmtNum } from './network';
import { NODE_COLORS } from './colors';
import { createViewToggle } from './dashboard';

function sigStars(p: number): string {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

export function renderPermutationTab(
  container: HTMLElement,
  fullModel: GroupTNA,
) {
  const groupNames = Object.keys(fullModel.models);
  if (groupNames.length < 2) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">Need at least 2 groups for permutation test.</div>';
    return;
  }

  // Generate all pairs
  const pairs: [string, string][] = [];
  for (let i = 0; i < groupNames.length; i++) {
    for (let j = i + 1; j < groupNames.length; j++) {
      pairs.push([groupNames[i]!, groupNames[j]!]);
    }
  }

  const grid = document.createElement('div');
  grid.className = 'panels-grid';

  // Controls (no pair selector — all pairs run automatically)
  const controls = document.createElement('div');
  controls.className = 'panel';
  controls.style.padding = '12px 16px';
  controls.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Iterations:</label>
        <select id="perm-iter" style="font-size:12px">
          <option value="500">500</option>
          <option value="1000" selected>1000</option>
          <option value="2000">2000</option>
          <option value="5000">5000</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Significance:</label>
        <select id="perm-level" style="font-size:12px">
          <option value="0.01">0.01</option>
          <option value="0.05" selected>0.05</option>
          <option value="0.10">0.10</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Adjustment:</label>
        <select id="perm-adjust" style="font-size:12px">
          <option value="none" selected>None</option>
          <option value="bonferroni">Bonferroni</option>
          <option value="holm">Holm</option>
          <option value="fdr">FDR (BH)</option>
        </select>
      </div>
      <button id="run-permutation" class="btn-primary" style="font-size:12px;padding:6px 16px">Run All Tests (${pairs.length} pair${pairs.length > 1 ? 's' : ''})</button>
    </div>
  `;
  grid.appendChild(controls);

  // Results container
  const resultsDiv = document.createElement('div');
  resultsDiv.id = 'perm-results';
  resultsDiv.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">Click "Run All Tests" to compare all group pairs.</div>';
  grid.appendChild(resultsDiv);
  container.appendChild(grid);

  // Wire run button
  setTimeout(() => {
    document.getElementById('run-permutation')?.addEventListener('click', () => {
      const iter = parseInt((document.getElementById('perm-iter') as HTMLSelectElement).value);
      const level = parseFloat((document.getElementById('perm-level') as HTMLSelectElement).value);
      const adjust = (document.getElementById('perm-adjust') as HTMLSelectElement).value as PermutationOptions['adjust'];

      const resultsEl = document.getElementById('perm-results')!;
      resultsEl.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px"><div class="spinner" style="margin:0 auto 12px"></div>Running permutation tests...</div>';

      setTimeout(() => {
        try {
          const allResults: { g1: string; g2: string; result: PermutationResult }[] = [];
          for (const [g1, g2] of pairs) {
            const modelX = fullModel.models[g1]!;
            const modelY = fullModel.models[g2]!;
            allResults.push({ g1, g2, result: permutationTest(modelX, modelY, { iter, level, adjust, seed: 42 }) });
          }
          renderAllPermutationResults(resultsEl, allResults, fullModel);
        } catch (err) {
          resultsEl.innerHTML = `<div class="panel error-banner">Error: ${(err as Error).message}</div>`;
        }
      }, 50);
    });
  }, 0);
}

function renderAllPermutationResults(
  container: HTMLElement,
  allResults: { g1: string; g2: string; result: PermutationResult }[],
  fullModel: GroupTNA,
) {
  container.innerHTML = '';
  const nPairs = allResults.length;

  createViewToggle(container,
    (fig) => {
      // ── Combined Significant-Edges Networks (single SVG canvas) ──
      const cols = nPairs <= 2 ? nPairs : nPairs <= 4 ? 2 : Math.ceil(Math.sqrt(nPairs));
      const rows = Math.ceil(nPairs / cols);
      const cellW = 500;
      const baseDims = getLastLayoutDimensions();
      const cellH = Math.min(baseDims.height || 400, 400);
      const labelH = 24;
      const legendH = 28;
      const totalW = cols * cellW;
      const totalH = rows * (cellH + labelH) + legendH;

      const netPanel = document.createElement('div');
      netPanel.className = 'panel';
      netPanel.innerHTML = `<div class="panel-title">Significant Differences</div>`;
      addPanelDownloadButtons(netPanel, { image: true, filename: 'permutation-networks' });

      const svgNS = 'http://www.w3.org/2000/svg';
      const svgEl = document.createElementNS(svgNS, 'svg');
      svgEl.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
      svgEl.setAttribute('width', '100%');
      svgEl.style.minHeight = '300px';
      svgEl.style.background = '#fff';
      netPanel.appendChild(svgEl);
      fig.appendChild(netPanel);

      // ── Combined Heatmaps (single panel, CSS grid) ──
      const heatPanel = document.createElement('div');
      heatPanel.className = 'panel';
      heatPanel.style.marginTop = '16px';
      heatPanel.innerHTML = `<div class="panel-title">Significance Heatmaps</div>`;
      addPanelDownloadButtons(heatPanel, { image: true, filename: 'permutation-heatmaps' });

      const heatGrid = document.createElement('div');
      if (nPairs > 1) {
        heatGrid.style.display = 'grid';
        heatGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        heatGrid.style.gap = '12px';
      }

      const heatContainers: { el: HTMLElement; idx: number }[] = [];
      for (let pi = 0; pi < nPairs; pi++) {
        const { g1, g2 } = allResults[pi]!;
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
        heatContainers.push({ el: heatEl, idx: pi });
      }
      heatPanel.appendChild(heatGrid);
      fig.appendChild(heatPanel);

      // Render after layout
      requestAnimationFrame(() => {
        // Networks into combined SVG
        for (let pi = 0; pi < nPairs; pi++) {
          const { g1, g2, result } = allResults[pi]!;
          const col = pi % cols;
          const row = Math.floor(pi / cols);
          const x = col * cellW;
          const y = row * (cellH + labelH);

          const sigCount = result.edgeStats.filter(e => e.pValue < result.level).length;

          const label = document.createElementNS(svgNS, 'text');
          label.setAttribute('x', String(x + cellW / 2));
          label.setAttribute('y', String(y + 16));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('font-size', '13');
          label.setAttribute('font-weight', '700');
          label.setAttribute('fill', '#555');
          label.textContent = `${g1} vs ${g2} (${sigCount} sig.)`;
          svgEl.appendChild(label);

          const gEl = document.createElementNS(svgNS, 'g') as SVGGElement;
          gEl.setAttribute('transform', `translate(${x}, ${y + labelH})`);
          svgEl.appendChild(gEl);

          const modelA = fullModel.models[g1]!;
          const modelB = fullModel.models[g2]!;
          renderSigNetworkIntoGroup(gEl, result, modelA, modelB, g1, g2, cellW, cellH);
        }

        // Shared legend
        const ly = totalH - legendH + 4;
        const leg = d3.select(svgEl);
        leg.append('rect').attr('x', 10).attr('y', ly).attr('width', 14).attr('height', 4).attr('fill', DIFF_POS).attr('rx', 2);
        leg.append('text').attr('x', 28).attr('y', ly + 4).attr('font-size', '10px').attr('fill', '#555').text('A > B');
        leg.append('rect').attr('x', 80).attr('y', ly).attr('width', 14).attr('height', 4).attr('fill', DIFF_NEG).attr('rx', 2);
        leg.append('text').attr('x', 98).attr('y', ly + 4).attr('font-size', '10px').attr('fill', '#555').text('A < B');
        leg.append('text').attr('x', 150).attr('y', ly + 4).attr('font-size', '9px').attr('fill', '#555')
          .text('* p<.05  ** p<.01  *** p<.001');

        // Heatmaps
        for (const { el, idx: pi } of heatContainers) {
          renderSigHeatmap(el, allResults[pi]!.result);
        }
      });
    },
    (tbl) => {
      // ── Combined table for all pairs ──
      for (let pi = 0; pi < nPairs; pi++) {
        const { g1, g2, result } = allResults[pi]!;
        const modelA = fullModel.models[g1]!;
        const modelB = fullModel.models[g2]!;
        const sigCount = result.edgeStats.filter(e => e.pValue < result.level).length;

        const tablePanel = document.createElement('div');
        tablePanel.className = 'panel';
        if (pi > 0) tablePanel.style.marginTop = '16px';
        tablePanel.style.maxHeight = '600px';
        tablePanel.style.overflow = 'auto';
        tablePanel.innerHTML = `<div class="panel-title">Permutation: ${g1} vs ${g2} (${sigCount} significant, p &lt; ${result.level})</div>`;

        let tableHtml = '<table class="preview-table" style="font-size:11px"><thead><tr>';
        tableHtml += `<th>From</th><th>To</th><th>${g1}</th><th>${g2}</th><th>Diff</th><th>Effect Size</th><th>p-value</th><th>Sig</th>`;
        tableHtml += '</tr></thead><tbody>';

        const sorted = [...result.edgeStats].sort((a, b) => a.pValue - b.pValue);
        for (const e of sorted) {
          const sig = e.pValue < result.level;
          const rowStyle = sig ? 'background:#fff3cd' : '';
          const stars = sigStars(e.pValue);
          const diffColor = e.diffTrue > 0 ? '#28a745' : e.diffTrue < 0 ? '#dc3545' : '#333';
          const fromIdx = result.labels.indexOf(e.from);
          const toIdx = result.labels.indexOf(e.to);
          const wA = fromIdx >= 0 && toIdx >= 0 ? modelA.weights.get(fromIdx, toIdx) : 0;
          const wB = fromIdx >= 0 && toIdx >= 0 ? modelB.weights.get(fromIdx, toIdx) : 0;
          tableHtml += `<tr style="${rowStyle}">`;
          tableHtml += `<td>${e.from}</td><td>${e.to}</td>`;
          tableHtml += `<td>${fmtNum(wA)}</td>`;
          tableHtml += `<td>${fmtNum(wB)}</td>`;
          tableHtml += `<td style="color:${diffColor};font-weight:600">${e.diffTrue > 0 ? '+' : ''}${fmtNum(e.diffTrue)}</td>`;
          tableHtml += `<td>${isNaN(e.effectSize) ? 'N/A' : fmtNum(e.effectSize, 3)}</td>`;
          tableHtml += `<td>${fmtNum(e.pValue, 4)}</td>`;
          tableHtml += `<td style="text-align:center;font-weight:600">${stars}</td>`;
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';
        tablePanel.innerHTML += tableHtml;
        addPanelDownloadButtons(tablePanel, { csv: true, filename: `permutation-${g1}-vs-${g2}` });
        tbl.appendChild(tablePanel);
      }
    },
    'perm-res',
  );
}

// ═══════════════════════════════════════════════════════════
//  Significant-edges-only network — renders into a <g> element
// ═══════════════════════════════════════════════════════════

const DIFF_POS = '#28a745';
const DIFF_NEG = '#dc3545';

function renderSigNetworkIntoGroup(
  gEl: SVGGElement,
  result: PermutationResult,
  modelA: TNA,
  modelB: TNA,
  nameA: string,
  nameB: string,
  width: number,
  height: number,
) {
  const g = d3.select(gEl) as d3.Selection<SVGGElement, unknown, null, undefined>;
  const { labels, nStates: n, diffSig, pValues } = result;
  const nodeRadius = 18;
  const padding = 35;

  interface SigEdge { from: number; to: number; diff: number; pValue: number; }
  const edges: SigEdge[] = [];
  let maxAbs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const idx = i * n + j;
      const diff = diffSig[idx]!;
      if (diff === 0) continue;
      edges.push({ from: i, to: j, diff, pValue: pValues[idx]! });
      if (Math.abs(diff) > maxAbs) maxAbs = Math.abs(diff);
    }
  }
  if (maxAbs === 0) maxAbs = 1;

  // Get positions and rescale to this cell
  const positions = resolvePositions(labels);
  rescalePositions(positions, width, height, padding);

  if (edges.length === 0) {
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#888')
      .text(`No significant differences at p < ${result.level}`);
    return;
  }

  const rimWidth = nodeRadius * 0.18;
  const rimRadius = nodeRadius + rimWidth * 0.7;
  const outerRadius = rimRadius + rimWidth / 2 + 2;
  const arrowSize = 6;

  const widthScale = d3.scaleLinear().domain([0, maxAbs]).range([1, 4]);
  const opacityScale = d3.scaleLinear().domain([0, maxAbs]).range([0.5, 0.95]);

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
    const sw = widthScale(absDiff);

    const { path, tipX, tipY, tipDx, tipDy, labelX, labelY } = computeEdgePath(
      src.x, src.y, tgt.x, tgt.y, curvature, outerRadius, outerRadius, arrowSize,
    );
    if (!path) continue;

    const edgePath = edgeGroup.append('path')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', sw)
      .attr('stroke-opacity', op)
      .attr('stroke-linecap', 'round');

    edgePath
      .on('mouseover', function (event: MouseEvent) {
        d3.select(this).attr('stroke-opacity', 1).attr('stroke-width', sw + 1);
        showTooltip(event,
          `<b>${labels[e.from]} → ${labels[e.to]}</b><br>` +
          `${nameA}: ${fmtNum(modelA.weights.get(e.from, e.to))}<br>` +
          `${nameB}: ${fmtNum(modelB.weights.get(e.from, e.to))}<br>` +
          `Diff: <span style="color:${color};font-weight:600">${e.diff > 0 ? '+' : ''}${fmtNum(e.diff)}</span><br>` +
          `p = ${fmtNum(e.pValue, 4)} ${sigStars(e.pValue)}`);
      })
      .on('mousemove', function (event: MouseEvent) {
        const tt = document.getElementById('tooltip')!;
        tt.style.left = event.clientX + 12 + 'px';
        tt.style.top = event.clientY - 10 + 'px';
      })
      .on('mouseout', function () {
        d3.select(this).attr('stroke-opacity', op).attr('stroke-width', sw);
        hideTooltip();
      });

    arrowGroup.append('polygon')
      .attr('points', arrowPoly(tipX, tipY, tipDx, tipDy, arrowSize))
      .attr('fill', color)
      .attr('opacity', Math.min(op + 0.15, 1));

    const stars = sigStars(e.pValue);
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
      .text((e.diff > 0 ? '+' : '') + fmtWeight(e.diff) + stars);
  }

  // Nodes
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

// ═══════════════════════════════════════════════════════════
//  Significant-only heatmap
// ═══════════════════════════════════════════════════════════

function renderSigHeatmap(container: HTMLElement, result: PermutationResult) {
  const { labels, nStates: a, diffSig, diffTrue, pValues } = result;
  const rect = container.getBoundingClientRect();
  const size = Math.min(Math.max(rect.width, 300), 500);
  const margin = { top: 10, right: 10, bottom: 60, left: 60 };
  const innerW = size - margin.left - margin.right;
  const innerH = size - margin.top - margin.bottom;
  const cellW = innerW / a;
  const cellH = innerH / a;

  let maxAbs = 0;
  for (let i = 0; i < a * a; i++) {
    const v = Math.abs(diffSig[i]!);
    if (v > maxAbs) maxAbs = v;
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

  for (let i = 0; i < a; i++) {
    for (let j = 0; j < a; j++) {
      const idx = i * a + j;
      const val = diffSig[idx]!;
      const pVal = pValues[idx]!;
      g.append('rect')
        .attr('x', j * cellW)
        .attr('y', i * cellH)
        .attr('width', cellW - 1)
        .attr('height', cellH - 1)
        .attr('fill', val === 0 ? '#f5f5f5' : colorScale(val))
        .attr('stroke', '#ddd')
        .attr('stroke-width', 0.5)
        .on('mouseover', function (event: MouseEvent) {
          d3.select(this).attr('stroke', '#333').attr('stroke-width', 2);
          showTooltip(event,
            `<b>${labels[i]} → ${labels[j]}</b><br>` +
            `Diff: ${fmtNum(diffTrue[idx]!)}<br>` +
            `p = ${fmtNum(pVal, 4)} ${sigStars(pVal)}<br>` +
            `${val !== 0 ? 'Significant' : 'Not significant'}`);
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

      if (val !== 0 && cellW > 20 && cellH > 14) {
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

  for (let i = 0; i < a; i++) {
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

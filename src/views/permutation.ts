/**
 * Permutation test tab: compare edge weights between two groups.
 * Only visible when a GroupTNA is loaded.
 */
import * as d3 from 'd3';
import type { TNA, GroupTNA } from 'tnaj';
import { showTooltip, hideTooltip } from '../main';
import { permutationTest } from '../analysis/permutation';
import type { PermutationResult, PermutationOptions } from '../analysis/permutation';
import { addPanelDownloadButtons } from './export';
import { fmtNum } from './network';
import { createViewToggle } from './dashboard';

export function renderPermutationTab(
  container: HTMLElement,
  fullModel: GroupTNA,
) {
  const groupNames = Object.keys(fullModel.models);
  if (groupNames.length < 2) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">Need at least 2 groups for permutation test.</div>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'panels-grid';

  // Controls
  const controls = document.createElement('div');
  controls.className = 'panel';
  controls.style.padding = '12px 16px';
  controls.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Group 1:</label>
        <select id="perm-group1" style="font-size:12px">
          ${groupNames.map((g, i) => `<option value="${g}" ${i === 0 ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Group 2:</label>
        <select id="perm-group2" style="font-size:12px">
          ${groupNames.map((g, i) => `<option value="${g}" ${i === 1 ? 'selected' : ''}>${g}</option>`).join('')}
        </select>
      </div>
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
      <button id="run-permutation" class="btn-primary" style="font-size:12px;padding:6px 16px">Run Test</button>
    </div>
  `;
  grid.appendChild(controls);

  // Results container
  const resultsDiv = document.createElement('div');
  resultsDiv.id = 'perm-results';
  resultsDiv.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">Click "Run Test" to compare two groups.</div>';
  grid.appendChild(resultsDiv);
  container.appendChild(grid);

  // Wire run button
  setTimeout(() => {
    document.getElementById('run-permutation')?.addEventListener('click', () => {
      const g1 = (document.getElementById('perm-group1') as HTMLSelectElement).value;
      const g2 = (document.getElementById('perm-group2') as HTMLSelectElement).value;
      if (g1 === g2) {
        alert('Please select two different groups.');
        return;
      }
      const iter = parseInt((document.getElementById('perm-iter') as HTMLSelectElement).value);
      const level = parseFloat((document.getElementById('perm-level') as HTMLSelectElement).value);
      const adjust = (document.getElementById('perm-adjust') as HTMLSelectElement).value as PermutationOptions['adjust'];

      const modelX = fullModel.models[g1]!;
      const modelY = fullModel.models[g2]!;

      const resultsEl = document.getElementById('perm-results')!;
      resultsEl.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px"><div class="spinner" style="margin:0 auto 12px"></div>Running permutation test...</div>';

      // Run async to keep UI responsive
      setTimeout(() => {
        try {
          const result = permutationTest(modelX, modelY, { iter, level, adjust, seed: 42 });
          renderPermutationResults(resultsEl, result, g1, g2);
        } catch (err) {
          resultsEl.innerHTML = `<div class="panel error-banner">Error: ${(err as Error).message}</div>`;
        }
      }, 50);
    });
  }, 0);
}

function renderPermutationResults(
  container: HTMLElement,
  result: PermutationResult,
  group1: string,
  group2: string,
) {
  container.innerHTML = '';

  const sigCount = result.edgeStats.filter(e => e.pValue < result.level).length;

  createViewToggle(container,
    (fig) => {
      const heatPanel = document.createElement('div');
      heatPanel.className = 'panel';
      heatPanel.innerHTML = `<div class="panel-title">Significant Differences Heatmap: ${group1} vs ${group2} (${sigCount} significant)</div><div id="viz-perm-heatmap" style="width:100%"></div>`;
      addPanelDownloadButtons(heatPanel, { image: true, filename: 'permutation-heatmap' });
      fig.appendChild(heatPanel);

      requestAnimationFrame(() => {
        const el = document.getElementById('viz-perm-heatmap');
        if (el) renderDiffHeatmap(el, result);
      });
    },
    (tbl) => {
      const tablePanel = document.createElement('div');
      tablePanel.className = 'panel';
      tablePanel.style.maxHeight = '600px';
      tablePanel.style.overflow = 'auto';
      tablePanel.innerHTML = `<div class="panel-title">Edge Differences: ${group1} vs ${group2} (${sigCount} significant)</div>`;

      let tableHtml = '<table class="preview-table" style="font-size:11px"><thead><tr>';
      tableHtml += '<th>From</th><th>To</th><th>Diff</th><th>Effect Size</th><th>p-value</th><th>Sig</th>';
      tableHtml += '</tr></thead><tbody>';

      const sorted = [...result.edgeStats].sort((a, b) => a.pValue - b.pValue);
      for (const e of sorted) {
        const sig = e.pValue < result.level;
        const rowStyle = sig ? 'background:#fff3cd' : '';
        tableHtml += `<tr style="${rowStyle}">`;
        tableHtml += `<td>${e.from}</td><td>${e.to}</td>`;
        tableHtml += `<td>${fmtNum(e.diffTrue)}</td>`;
        tableHtml += `<td>${isNaN(e.effectSize) ? 'N/A' : fmtNum(e.effectSize, 3)}</td>`;
        tableHtml += `<td>${fmtNum(e.pValue)}</td>`;
        tableHtml += `<td style="text-align:center">${sig ? '***' : ''}</td>`;
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';
      tablePanel.innerHTML += tableHtml;
      addPanelDownloadButtons(tablePanel, { csv: true, filename: 'permutation-results' });
      tbl.appendChild(tablePanel);
    },
    'perm-res',
  );
}

function renderDiffHeatmap(container: HTMLElement, result: PermutationResult) {
  const { labels, nStates: a, diffSig } = result;
  const rect = container.getBoundingClientRect();
  const size = Math.min(Math.max(rect.width, 300), 500);
  const margin = { top: 10, right: 10, bottom: 60, left: 60 };
  const innerW = size - margin.left - margin.right;
  const innerH = size - margin.top - margin.bottom;
  const cellW = innerW / a;
  const cellH = innerH / a;

  // Find max absolute diff for color scale
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
      const val = diffSig[i * a + j]!;
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
          const pIdx = i * a + j;
          showTooltip(event,
            `<b>${labels[i]} → ${labels[j]}</b><br>` +
            `Diff: ${fmtNum(result.diffTrue[pIdx]!)}<br>` +
            `p: ${fmtNum(result.pValues[pIdx]!)}<br>` +
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

      // Show value in cell if significant
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

  // Axis labels
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

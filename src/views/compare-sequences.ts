/**
 * Compare sequences tab: pattern frequency comparison across groups.
 * Uses tnaj's compareSequences() function.
 * Only visible when a GroupTNA is loaded.
 */
import * as d3 from 'd3';
import type { GroupTNA, CompareRow } from 'tnaj';
import { compareSequences } from 'tnaj';
import { showTooltip, hideTooltip } from '../main';
import { addPanelDownloadButtons } from './export';
import { fmtNum } from './network';
import { createViewToggle } from './dashboard';

export function renderCompareSequencesTab(
  container: HTMLElement,
  fullModel: GroupTNA,
) {
  const groupNames = Object.keys(fullModel.models);
  if (groupNames.length < 2) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">Need at least 2 groups to compare sequences.</div>';
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
        <label style="font-size:12px;color:#777">Min length:</label>
        <input type="number" id="cmp-sub-min" value="2" min="1" max="10" step="1" style="font-size:12px;width:52px">
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Max length:</label>
        <input type="number" id="cmp-sub-max" value="4" min="1" max="10" step="1" style="font-size:12px;width:52px">
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Min Frequency:</label>
        <input type="number" id="cmp-min-freq" value="2" min="0" step="1" style="font-size:12px;width:60px">
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Test:</label>
        <div class="checkbox-row">
          <input type="checkbox" id="cmp-test" checked>
          <span style="font-size:12px">Permutation test</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Iterations:</label>
        <select id="cmp-iter" style="font-size:12px">
          <option value="499">499</option>
          <option value="999" selected>999</option>
          <option value="1999">1999</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">P-adjust:</label>
        <select id="cmp-adjust" style="font-size:12px">
          <option value="none">None</option>
          <option value="bonferroni" selected>Bonferroni</option>
          <option value="holm">Holm</option>
          <option value="fdr">FDR</option>
        </select>
      </div>
      <button id="run-compare" class="btn-primary" style="font-size:12px;padding:6px 16px">Compare</button>
    </div>
  `;
  grid.appendChild(controls);

  // Results container
  const resultsDiv = document.createElement('div');
  resultsDiv.id = 'cmp-results';
  resultsDiv.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">Click "Compare" to find differential patterns across groups.</div>';
  grid.appendChild(resultsDiv);
  container.appendChild(grid);

  setTimeout(() => {
    document.getElementById('run-compare')?.addEventListener('click', () => {
      const subMin = parseInt((document.getElementById('cmp-sub-min') as HTMLInputElement).value) || 2;
      const subMax = parseInt((document.getElementById('cmp-sub-max') as HTMLInputElement).value) || 4;
      const lo = Math.max(1, Math.min(subMin, subMax));
      const hi = Math.max(lo, subMax);
      const sub = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

      const minFreq = parseInt((document.getElementById('cmp-min-freq') as HTMLInputElement).value) || 0;
      const test = (document.getElementById('cmp-test') as HTMLInputElement).checked;
      const iter = parseInt((document.getElementById('cmp-iter') as HTMLSelectElement).value);
      const adjust = (document.getElementById('cmp-adjust') as HTMLSelectElement).value as any;

      const resultsEl = document.getElementById('cmp-results')!;
      resultsEl.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px"><div class="spinner" style="margin:0 auto 12px"></div>Comparing sequences...</div>';

      setTimeout(() => {
        try {
          const rows = compareSequences(fullModel, { sub, minFreq, test, iter, adjust, seed: 42 });
          renderCompareResults(resultsEl, rows, groupNames);
        } catch (err) {
          resultsEl.innerHTML = `<div class="panel error-banner">Error: ${(err as Error).message}</div>`;
        }
      }, 50);
    });
  }, 0);
}

/**
 * Compute standardized residuals on ALL rows (global N), matching R's tna heatmap exactly.
 * Formula: (O - E) / sqrt(cell_var)
 * where E_ij    = r_i * c_j / N
 *       cell_var = r_i * c_j * (N - r_i) * (N - c_j) / N^3  (multinomial variance)
 * Using sqrt(cell_var) as denominator (not cell_var) gives values ~12 for discuss->consensus,
 * verified numerically against R tna with group_regulation_long (Max |TS-R| = 0.000e+0).
 */
function computeStandardizedResiduals(
  rows: CompareRow[],
  groupNames: string[],
): Record<string, Record<string, number>> {
  const freqTable: number[][] = rows.map(row =>
    groupNames.map(g => row.frequencies[g] ?? 0),
  );

  const nRows = rows.length;
  const nCols = groupNames.length;

  const rowTotals = freqTable.map(r => r.reduce((s, v) => s + v, 0));
  const colTotals = groupNames.map((_, j) =>
    freqTable.reduce((s, r) => s + r[j]!, 0),
  );
  const N = rowTotals.reduce((s, v) => s + v, 0);

  const result: Record<string, Record<string, number>> = {};
  for (let i = 0; i < nRows; i++) {
    result[rows[i]!.pattern] = {};
    for (let j = 0; j < nCols; j++) {
      const O = freqTable[i]![j]!;
      const ri = rowTotals[i]!;
      const cj = colTotals[j]!;
      const E = N > 0 ? (ri * cj) / N : 0;
      const cellVar = N > 0 ? (ri * cj * (N - ri) * (N - cj)) / (N * N * N) : 0;
      result[rows[i]!.pattern]![groupNames[j]!] = cellVar > 0 ? (O - E) / Math.sqrt(cellVar) : 0;
    }
  }
  return result;
}

function renderCompareResults(
  container: HTMLElement,
  rows: CompareRow[],
  groupNames: string[],
) {
  container.innerHTML = '';

  if (rows.length === 0) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">No patterns found. Try lowering the minimum frequency.</div>';
    return;
  }

  const hasPValue = rows.some(r => r.pValue !== undefined);

  // Compute standardized residuals on ALL patterns (global N).
  // Sort heatmap by max |residual| descending — matches the order R shows.
  const residuals = computeStandardizedResiduals(rows, groupNames);
  const sortKey = (row: CompareRow) =>
    Math.max(...groupNames.map(g => Math.abs(residuals[row.pattern]?.[g] ?? 0)));
  const sortedByResidual = [...rows].sort((a, b) => sortKey(b) - sortKey(a));

  createViewToggle(container,
    (fig) => renderHeatmapPanel(fig, sortedByResidual, groupNames, residuals),
    (tbl) => renderTablePanel(tbl, rows, groupNames, residuals, hasPValue, rows.length),
    'cmp-seq-res',
  );
}

// R's exact tna colors: low="#D33F6A" (red-pink), high="#4A6FE3" (blue), midpoint=white
// Scale is clamped to [-4, 4] matching R's scale_fill_gradient2(limits=c(-4,4))
function tnaDivergingColor(resid: number): string {
  const t = Math.max(-4, Math.min(4, resid)); // clamp
  const norm = (t + 4) / 8; // 0 → red, 0.5 → white, 1 → blue
  if (norm < 0.5) return d3.interpolateRgb('#D33F6A', '#ffffff')(norm * 2);
  return d3.interpolateRgb('#ffffff', '#4A6FE3')((norm - 0.5) * 2);
}

function renderHeatmapPanel(
  fig: HTMLElement,
  rows: CompareRow[],
  groupNames: string[],
  residuals: Record<string, Record<string, number>>,
) {
  const top10 = rows.slice(0, 10);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `<div class="panel-title">Standardized Residuals Heatmap (top ${top10.length} patterns)</div><div id="viz-cmp-seq-heatmap" style="width:100%"></div>`;
  addPanelDownloadButtons(panel, { image: true, filename: 'compare-sequences-heatmap' });
  fig.appendChild(panel);

  requestAnimationFrame(() => {
    const el = document.getElementById('viz-cmp-seq-heatmap');
    if (!el) return;

    const nRows = top10.length;
    const nCols = groupNames.length;

    const cellH = 28;
    const cellW = Math.max(70, Math.min(120, 600 / nCols));
    const legendW = 80;
    const margin = { top: 60, right: legendW + 20, bottom: 10, left: 240 };
    const innerW = cellW * nCols;
    const innerH = cellH * nRows;
    const svgW = innerW + margin.left + margin.right;
    const svgH = innerH + margin.top + margin.bottom;

    const svg = d3.select(el).append('svg')
      .attr('width', svgW)
      .attr('height', svgH);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Gradient def for legend — R's exact colors (unique id to avoid conflicts on re-render)
    const gradId = `cmp-seq-grad-${Date.now()}`;
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0%').attr('y1', '100%')
      .attr('x2', '0%').attr('y2', '0%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#D33F6A');   // low (−4)
    grad.append('stop').attr('offset', '50%').attr('stop-color', '#ffffff');  // mid (0)
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#4A6FE3'); // high (+4)

    // Column headers (rotated −35°)
    g.selectAll('.col-label')
      .data(groupNames)
      .enter()
      .append('text')
      .attr('class', 'col-label')
      .attr('x', (_, j) => j * cellW + cellW / 2)
      .attr('y', -8)
      .attr('text-anchor', 'end')
      .attr('transform', (_, j) => `rotate(-35, ${j * cellW + cellW / 2}, -8)`)
      .attr('font-size', '11px')
      .attr('fill', '#444')
      .text(d => d);

    // Row labels (pattern names)
    g.selectAll('.row-label')
      .data(top10)
      .enter()
      .append('text')
      .attr('class', 'row-label')
      .attr('x', -8)
      .attr('y', (_, i) => i * cellH + cellH / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .attr('fill', '#333')
      .text(d => d.pattern);

    // Cells
    for (let i = 0; i < nRows; i++) {
      for (let j = 0; j < nCols; j++) {
        const resVal = residuals[top10[i]!.pattern]?.[groupNames[j]!] ?? 0;
        const fill = tnaDivergingColor(resVal);

        g.append('rect')
          .attr('x', j * cellW)
          .attr('y', i * cellH)
          .attr('width', cellW)
          .attr('height', cellH)
          .attr('fill', fill)
          .attr('stroke', '#fff')
          .attr('stroke-width', 1)
          .on('mouseover', (event: MouseEvent) => {
            showTooltip(event, `<b>${escHtml(top10[i]!.pattern)}</b><br>${groupNames[j]}: ${resVal.toFixed(3)}`);
          })
          .on('mouseout', hideTooltip);

        // White text on saturated cells (|resid| > 1.6 ≈ 40% of the ±4 range)
        const textColor = Math.abs(resVal) > 1.6 ? '#fff' : '#333';
        g.append('text')
          .attr('x', j * cellW + cellW / 2)
          .attr('y', i * cellH + cellH / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', '10px')
          .attr('fill', textColor)
          .text(resVal.toFixed(2));
      }
    }

    // Color legend (vertical bar on right, matching R layout)
    const legendX = innerW + 20;
    const legendBarH = 120;
    const legendBarW = 16;
    const legendY = (innerH - legendBarH) / 2;

    // Legend title
    svg.append('text')
      .attr('x', margin.left + legendX + legendBarW / 2)
      .attr('y', margin.top + legendY - 18)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', '#555')
      .text('Standardized');
    svg.append('text')
      .attr('x', margin.left + legendX + legendBarW / 2)
      .attr('y', margin.top + legendY - 7)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', '#555')
      .text('residual');

    svg.append('rect')
      .attr('x', margin.left + legendX)
      .attr('y', margin.top + legendY)
      .attr('width', legendBarW)
      .attr('height', legendBarH)
      .attr('fill', `url(#${gradId})`);

    // Tick labels: +4, 0, −4 (matching R's breaks)
    const tickData: [number, string][] = [
      [margin.top + legendY, '+4'],
      [margin.top + legendY + legendBarH / 2, '0'],
      [margin.top + legendY + legendBarH, '−4'],
    ];
    for (const [ty, label] of tickData) {
      svg.append('text')
        .attr('x', margin.left + legendX + legendBarW + 5)
        .attr('y', ty)
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '10px')
        .attr('fill', '#555')
        .text(label);
    }
  });
}

function renderTablePanel(
  tbl: HTMLElement,
  sorted: CompareRow[],
  groupNames: string[],
  residuals: Record<string, Record<string, number>>,
  hasPValue: boolean,
  totalCount: number,
) {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.overflow = 'auto';
  panel.style.maxHeight = '600px';
  panel.innerHTML = `<div class="panel-title">Sequence Pattern Comparison (${totalCount} patterns)</div>`;

  let tableHtml = '<table class="preview-table" style="font-size:11px"><thead><tr>';
  tableHtml += '<th>Pattern</th>';
  for (const g of groupNames) {
    tableHtml += `<th>Freq (${escHtml(g)})</th><th>Prop (${escHtml(g)})</th><th>Residual (${escHtml(g)})</th>`;
  }
  if (hasPValue) tableHtml += '<th>Effect Size</th><th>p-value</th>';
  tableHtml += '</tr></thead><tbody>';

  for (const row of sorted) {
    const sig = hasPValue && row.pValue !== undefined && row.pValue < 0.05;
    const rowStyle = sig ? 'background:#fff3cd' : '';
    tableHtml += `<tr style="${rowStyle}">`;
    tableHtml += `<td style="font-family:monospace;white-space:nowrap">${escHtml(row.pattern)}</td>`;
    for (const g of groupNames) {
      const freq = row.frequencies[g] ?? 0;
      const prop = row.proportions[g] ?? 0;
      const res = residuals[row.pattern]?.[g] ?? 0;
      tableHtml += `<td style="text-align:right">${freq}</td>`;
      tableHtml += `<td style="text-align:right">${fmtNum(prop, 3)}</td>`;
      tableHtml += `<td style="text-align:right">${res.toFixed(2)}</td>`;
    }
    if (hasPValue) {
      tableHtml += `<td style="text-align:right">${row.effectSize !== undefined ? fmtNum(row.effectSize, 3) : 'N/A'}</td>`;
      tableHtml += `<td style="text-align:right">${row.pValue !== undefined ? fmtNum(row.pValue) : 'N/A'}</td>`;
    }
    tableHtml += '</tr>';
  }
  tableHtml += '</tbody></table>';
  panel.innerHTML += tableHtml;
  addPanelDownloadButtons(panel, { csv: true, filename: 'compare-sequences' });
  tbl.appendChild(panel);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

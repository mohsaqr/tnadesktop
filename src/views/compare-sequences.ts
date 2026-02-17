/**
 * Compare sequences tab: pattern frequency comparison across groups.
 * Uses tnaj's compareSequences() function.
 * Only visible when a GroupTNA is loaded.
 */
import * as d3 from 'd3';
import type { GroupTNA, CompareRow } from 'tnaj';
import { compareSequences } from 'tnaj';
import { showTooltip, hideTooltip } from '../main';

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
      const minFreq = parseInt((document.getElementById('cmp-min-freq') as HTMLInputElement).value) || 0;
      const test = (document.getElementById('cmp-test') as HTMLInputElement).checked;
      const iter = parseInt((document.getElementById('cmp-iter') as HTMLSelectElement).value);
      const adjust = (document.getElementById('cmp-adjust') as HTMLSelectElement).value as any;

      const resultsEl = document.getElementById('cmp-results')!;
      resultsEl.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px"><div class="spinner" style="margin:0 auto 12px"></div>Comparing sequences...</div>';

      setTimeout(() => {
        try {
          const rows = compareSequences(fullModel, { minFreq, test, iter, adjust, seed: 42 });
          renderCompareResults(resultsEl, rows, groupNames);
        } catch (err) {
          resultsEl.innerHTML = `<div class="panel error-banner">Error: ${(err as Error).message}</div>`;
        }
      }, 50);
    });
  }, 0);
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

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.overflow = 'auto';
  panel.style.maxHeight = '600px';

  const hasPValue = rows.some(r => r.pValue !== undefined);
  panel.innerHTML = `<div class="panel-title">Sequence Pattern Comparison (${rows.length} patterns)</div>`;

  let tableHtml = '<table class="preview-table" style="font-size:11px"><thead><tr>';
  tableHtml += '<th>Pattern</th>';
  for (const g of groupNames) {
    tableHtml += `<th>Freq (${g})</th><th>Prop (${g})</th>`;
  }
  if (hasPValue) {
    tableHtml += '<th>Effect Size</th><th>p-value</th>';
  }
  tableHtml += '</tr></thead><tbody>';

  // Sort by p-value if available, else by total frequency
  const sorted = [...rows].sort((a, b) => {
    if (hasPValue && a.pValue !== undefined && b.pValue !== undefined) {
      return a.pValue - b.pValue;
    }
    const totalA = Object.values(a.frequencies).reduce((s, v) => s + v, 0);
    const totalB = Object.values(b.frequencies).reduce((s, v) => s + v, 0);
    return totalB - totalA;
  });

  for (const row of sorted) {
    const sig = hasPValue && row.pValue !== undefined && row.pValue < 0.05;
    const rowStyle = sig ? 'background:#fff3cd' : '';
    tableHtml += `<tr style="${rowStyle}">`;
    tableHtml += `<td style="font-family:monospace;white-space:nowrap">${escHtml(row.pattern)}</td>`;
    for (const g of groupNames) {
      const freq = row.frequencies[g] ?? 0;
      const prop = row.proportions[g] ?? 0;
      tableHtml += `<td style="text-align:right">${freq}</td>`;
      tableHtml += `<td style="text-align:right">${prop.toFixed(3)}</td>`;
    }
    if (hasPValue) {
      tableHtml += `<td style="text-align:right">${row.effectSize !== undefined ? row.effectSize.toFixed(3) : 'N/A'}</td>`;
      tableHtml += `<td style="text-align:right">${row.pValue !== undefined ? row.pValue.toFixed(4) : 'N/A'}</td>`;
    }
    tableHtml += '</tr>';
  }
  tableHtml += '</tbody></table>';
  panel.innerHTML += tableHtml;

  container.appendChild(panel);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

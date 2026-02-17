/**
 * Bootstrap tab: assess edge weight stability via resampling.
 */
import type { TNA } from 'tnaj';
import type { NetworkSettings } from '../main';
import { showTooltip, hideTooltip } from '../main';
import { bootstrapTna } from '../analysis/bootstrap';
import type { BootstrapResult, BootstrapOptions } from '../analysis/bootstrap';
import { renderNetwork } from './network';

export function renderBootstrapTab(
  container: HTMLElement,
  model: TNA,
  networkSettings: NetworkSettings,
  idSuffix = '',
) {
  const grid = document.createElement('div');
  grid.className = 'panels-grid';

  // Controls
  const controls = document.createElement('div');
  controls.className = 'panel';
  controls.style.padding = '12px 16px';
  controls.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Iterations:</label>
        <select id="boot-iter${idSuffix}" style="font-size:12px">
          <option value="500">500</option>
          <option value="1000" selected>1000</option>
          <option value="2000">2000</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Significance:</label>
        <select id="boot-level${idSuffix}" style="font-size:12px">
          <option value="0.01">0.01</option>
          <option value="0.05" selected>0.05</option>
          <option value="0.10">0.10</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Method:</label>
        <select id="boot-method${idSuffix}" style="font-size:12px">
          <option value="stability" selected>Stability</option>
          <option value="threshold">Threshold</option>
        </select>
      </div>
      <button id="run-bootstrap${idSuffix}" class="btn-primary" style="font-size:12px;padding:6px 16px">Run Bootstrap</button>
    </div>
  `;
  grid.appendChild(controls);

  const resultsDiv = document.createElement('div');
  resultsDiv.id = `boot-results${idSuffix}`;
  resultsDiv.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">Click "Run Bootstrap" to assess edge stability.</div>';
  grid.appendChild(resultsDiv);
  container.appendChild(grid);

  setTimeout(() => {
    document.getElementById(`run-bootstrap${idSuffix}`)?.addEventListener('click', () => {
      const iter = parseInt((document.getElementById(`boot-iter${idSuffix}`) as HTMLSelectElement).value);
      const level = parseFloat((document.getElementById(`boot-level${idSuffix}`) as HTMLSelectElement).value);
      const method = (document.getElementById(`boot-method${idSuffix}`) as HTMLSelectElement).value as BootstrapOptions['method'];

      const resultsEl = document.getElementById(`boot-results${idSuffix}`)!;
      resultsEl.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px"><div class="spinner" style="margin:0 auto 12px"></div>Running bootstrap...</div>';

      setTimeout(() => {
        try {
          const result = bootstrapTna(model, { iter, level, method, seed: 42 });
          renderBootstrapResults(resultsEl, result, networkSettings, idSuffix);
        } catch (err) {
          resultsEl.innerHTML = `<div class="panel error-banner">Error: ${(err as Error).message}</div>`;
        }
      }, 50);
    });
  }, 0);
}

function renderBootstrapResults(
  container: HTMLElement,
  result: BootstrapResult,
  networkSettings: NetworkSettings,
  idSuffix = '',
) {
  container.innerHTML = '';

  const sigCount = result.edges.filter(e => e.significant).length;
  const totalEdges = result.edges.length;

  const resultGrid = document.createElement('div');
  resultGrid.style.display = 'grid';
  resultGrid.style.gridTemplateColumns = '1fr 1fr';
  resultGrid.style.gap = '16px';

  // Edge stats table
  const tablePanel = document.createElement('div');
  tablePanel.className = 'panel';
  tablePanel.style.maxHeight = '500px';
  tablePanel.style.overflow = 'auto';
  tablePanel.innerHTML = `<div class="panel-title">Bootstrap Results: ${sigCount}/${totalEdges} edges significant (${result.method}, ${result.iter} iterations)</div>`;

  let tableHtml = '<table class="preview-table" style="font-size:11px"><thead><tr>';
  tableHtml += '<th>From</th><th>To</th><th>Weight</th><th>p-value</th><th>CI Lower</th><th>CI Upper</th><th>Sig</th>';
  tableHtml += '</tr></thead><tbody>';

  const sorted = [...result.edges].sort((a, b) => a.pValue - b.pValue);
  for (const e of sorted) {
    const rowStyle = e.significant ? 'background:#d4edda' : '';
    tableHtml += `<tr style="${rowStyle}">`;
    tableHtml += `<td>${e.from}</td><td>${e.to}</td>`;
    tableHtml += `<td>${e.weight.toFixed(4)}</td>`;
    tableHtml += `<td>${e.pValue.toFixed(4)}</td>`;
    tableHtml += `<td>${e.ciLower.toFixed(4)}</td>`;
    tableHtml += `<td>${e.ciUpper.toFixed(4)}</td>`;
    tableHtml += `<td style="text-align:center">${e.significant ? 'Yes' : ''}</td>`;
    tableHtml += '</tr>';
  }
  tableHtml += '</tbody></table>';
  tablePanel.innerHTML += tableHtml;
  resultGrid.appendChild(tablePanel);

  // Bootstrap network (significant edges only)
  const h = networkSettings.networkHeight;
  const netPanel = document.createElement('div');
  netPanel.className = 'panel';
  netPanel.style.minHeight = `${h + 40}px`;
  netPanel.innerHTML = `
    <div class="panel-title">Significant Edges Network</div>
    <div id="viz-boot-network${idSuffix}" style="width:100%;height:${h}px"></div>
  `;
  resultGrid.appendChild(netPanel);

  container.appendChild(resultGrid);

  requestAnimationFrame(() => {
    const el = document.getElementById(`viz-boot-network${idSuffix}`);
    if (el) {
      const bootSettings = { ...networkSettings, edgeThreshold: 0 };
      renderNetwork(el, result.model, bootSettings);
    }
  });
}

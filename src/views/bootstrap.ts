/**
 * Bootstrap tab: assess edge weight stability via resampling.
 */
import type { TNA } from 'tnaj';
import type { NetworkSettings } from '../main';
import { bootstrapTna } from '../analysis/bootstrap';
import type { BootstrapResult, BootstrapOptions } from '../analysis/bootstrap';
import { renderNetwork, fmtNum } from './network';
import { addPanelDownloadButtons } from './export';
import { renderForestPlot } from './chart-utils';

/** Show bootstrap settings modal, run on confirm, call back with result. */
function showBootstrapModal(
  onRun: (opts: { iter: number; level: number; method: 'stability' | 'threshold'; consistencyRange: [number, number] }) => void,
) {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="width:460px">
      <h3>Bootstrap Validation</h3>
      <span class="cluster-info-badge">Assess edge weight stability via resampling</span>
      <div class="cluster-modal-body">
        <div class="cluster-form-row">
          <label>Method</label>
          <select id="bm-method">
            <option value="stability" selected>Stability</option>
            <option value="threshold">Threshold</option>
          </select>
        </div>
        <div class="cluster-form-row">
          <label>Iterations</label>
          <select id="bm-iter">
            <option value="500">500</option>
            <option value="1000" selected>1000</option>
            <option value="2000">2000</option>
            <option value="5000">5000</option>
          </select>
        </div>
        <div class="cluster-form-row">
          <label>Significance</label>
          <select id="bm-level">
            <option value="0.01">0.01</option>
            <option value="0.05" selected>0.05</option>
            <option value="0.10">0.10</option>
          </select>
        </div>
        <div class="cluster-form-row">
          <label>Consistency Range</label>
          <div style="display:flex;gap:8px;align-items:center;flex:1;max-width:200px">
            <input type="number" id="bm-range-low" value="0.75" min="0" max="1" step="0.05" style="width:70px">
            <span style="color:#888">to</span>
            <input type="number" id="bm-range-high" value="1.25" min="1" max="2" step="0.05" style="width:70px">
          </div>
        </div>
        <div id="bm-error" style="display:none"></div>
      </div>
      <div class="cluster-modal-actions">
        <button class="modal-close" id="bm-cancel">Cancel</button>
        <button class="btn-primary" id="bm-run" style="font-size:13px;padding:8px 24px">Run Bootstrap</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById('bm-cancel')!.addEventListener('click', () => overlay.remove());

  document.getElementById('bm-run')!.addEventListener('click', () => {
    const iter = parseInt((document.getElementById('bm-iter') as HTMLSelectElement).value);
    const level = parseFloat((document.getElementById('bm-level') as HTMLSelectElement).value);
    const method = (document.getElementById('bm-method') as HTMLSelectElement).value as 'stability' | 'threshold';
    const rangeLow = parseFloat((document.getElementById('bm-range-low') as HTMLInputElement).value) || 0.75;
    const rangeHigh = parseFloat((document.getElementById('bm-range-high') as HTMLInputElement).value) || 1.25;
    overlay.remove();
    onRun({ iter, level, method, consistencyRange: [rangeLow, rangeHigh] });
  });
}

export { showBootstrapModal };

export function renderBootstrapTab(
  container: HTMLElement,
  model: TNA,
  networkSettings: NetworkSettings,
  idSuffix = '',
  onResult?: (result: BootstrapResult) => void,
) {
  const grid = document.createElement('div');
  grid.className = 'panels-grid';

  const resultsDiv = document.createElement('div');
  resultsDiv.id = `boot-results${idSuffix}`;
  resultsDiv.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px"><div class="spinner" style="margin:0 auto 12px"></div>Waiting for settings...</div>';
  grid.appendChild(resultsDiv);
  container.appendChild(grid);

  function runBootstrap() {
    showBootstrapModal((opts) => {
      const resultsEl = document.getElementById(`boot-results${idSuffix}`)!;
      resultsEl.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px"><div class="spinner" style="margin:0 auto 12px"></div>Running bootstrap...</div>';

      setTimeout(() => {
        try {
          const result = bootstrapTna(model, { ...opts, seed: 42 });
          renderBootstrapResults(resultsEl, result, networkSettings, idSuffix, runBootstrap);
          if (onResult) onResult(result);
        } catch (err) {
          resultsEl.innerHTML = `<div class="panel error-banner">Error: ${(err as Error).message}</div>`;
        }
      }, 50);
    });
  }

  // Show modal immediately
  setTimeout(runBootstrap, 0);
}

export function renderBootstrapResults(
  container: HTMLElement,
  result: BootstrapResult,
  networkSettings: NetworkSettings,
  idSuffix = '',
  onRerun?: () => void,
) {
  container.innerHTML = '';

  const sigCount = result.edges.filter(e => e.significant).length;
  const totalEdges = result.edges.length;
  const summary = `${sigCount}/${totalEdges} edges significant (${result.method}, ${result.iter} iter)`;

  // Flat 3-tab toggle: Network / Forest Plot / Table + Re-run button
  const toggleBar = document.createElement('div');
  toggleBar.className = 'panel';
  toggleBar.style.cssText = 'padding:8px 16px;display:flex;align-items:center;justify-content:space-between';
  toggleBar.innerHTML = `
    <div class="view-toggle">
      <button class="toggle-btn active" id="boot-toggle-net${idSuffix}">Network</button>
      <button class="toggle-btn" id="boot-toggle-forest${idSuffix}">Forest Plot</button>
      <button class="toggle-btn" id="boot-toggle-table${idSuffix}">Table</button>
    </div>
    <button class="btn-primary" id="boot-rerun${idSuffix}" style="font-size:12px;padding:6px 16px">Re-run\u2026</button>
  `;
  container.appendChild(toggleBar);

  const viewContainer = document.createElement('div');
  container.appendChild(viewContainer);
  let currentView: 'network' | 'forest' | 'table' = 'network';

  function renderNetworkView() {
    viewContainer.innerHTML = '';
    const h = networkSettings.networkHeight;
    const netPanel = document.createElement('div');
    netPanel.className = 'panel';
    netPanel.style.minHeight = `${h + 40}px`;
    netPanel.innerHTML = `
      <div class="panel-title">Significant Edges Network: ${summary}</div>
      <div id="viz-boot-network${idSuffix}" style="width:100%;height:${h}px"></div>
    `;
    addPanelDownloadButtons(netPanel, { image: true, filename: `bootstrap-network${idSuffix}` });
    viewContainer.appendChild(netPanel);
    requestAnimationFrame(() => {
      const el = document.getElementById(`viz-boot-network${idSuffix}`);
      if (el) {
        const bootSettings = { ...networkSettings, edgeThreshold: 0 };
        renderNetwork(el, result.model, bootSettings);
      }
    });
  }

  let forestThreshold = 0;

  function renderForestView() {
    viewContainer.innerHTML = '';
    // Threshold filter control
    const filterBar = document.createElement('div');
    filterBar.style.cssText = 'margin:8px 0;display:flex;align-items:center;gap:8px;font-size:12px';
    filterBar.innerHTML = `<label style="display:flex;align-items:center;gap:6px;color:#555"><input type="checkbox" id="boot-forest-filter${idSuffix}" ${forestThreshold > 0 ? 'checked' : ''}> Hide edges below</label><input type="number" id="boot-forest-threshold${idSuffix}" value="${forestThreshold || 0.05}" min="0" max="1" step="0.01" style="width:60px;font-size:12px;padding:2px 4px" ${forestThreshold > 0 ? '' : 'disabled'}>`;
    viewContainer.appendChild(filterBar);

    const panel = document.createElement('div');
    panel.className = 'panel';
    const sorted = [...result.edges].sort((a, b) => b.weight - a.weight);
    const filtered = forestThreshold > 0 ? sorted.filter(e => e.weight >= forestThreshold) : sorted;
    const shown = filtered.slice(0, Math.min(1000, filtered.length));
    const rows = shown.map(e => ({
      label: `${e.from} \u2192 ${e.to}`,
      estimate: e.bootstrapMean,
      originalWeight: e.weight,
      ciLower: e.ciLower,
      ciUpper: e.ciUpper,
      significant: e.significant,
    }));
    const rowH = 22;
    const plotH = Math.max(140, rows.length * rowH + 60);
    const filterNote = forestThreshold > 0 ? ` (hiding < ${forestThreshold})` : '';
    panel.innerHTML = `<div class="panel-title">Bootstrap Forest Plot: ${shown.length} edges${filterNote} (${result.method}, ${result.iter} iter) \u2014 <span style="color:#4e79a7">\u25cf</span> bootstrap mean, <span style="color:#e15759">\u25c6</span> original weight</div><div id="viz-boot-forest${idSuffix}" style="width:100%;height:${plotH}px"></div>`;
    addPanelDownloadButtons(panel, { image: true, filename: `bootstrap-forest${idSuffix}` });
    viewContainer.appendChild(panel);
    requestAnimationFrame(() => {
      const el = document.getElementById(`viz-boot-forest${idSuffix}`);
      if (el) renderForestPlot(el, rows, { xLabel: 'Edge Weight', height: plotH });
    });

    // Wire filter controls
    setTimeout(() => {
      const cb = document.getElementById(`boot-forest-filter${idSuffix}`) as HTMLInputElement;
      const inp = document.getElementById(`boot-forest-threshold${idSuffix}`) as HTMLInputElement;
      cb?.addEventListener('change', () => {
        inp.disabled = !cb.checked;
        forestThreshold = cb.checked ? (parseFloat(inp.value) || 0.05) : 0;
        renderForestView();
      });
      inp?.addEventListener('change', () => {
        if (cb.checked) {
          forestThreshold = parseFloat(inp.value) || 0.05;
          renderForestView();
        }
      });
    }, 0);
  }

  function renderTableView() {
    viewContainer.innerHTML = '';
    const tablePanel = document.createElement('div');
    tablePanel.className = 'panel';
    tablePanel.style.maxHeight = '600px';
    tablePanel.style.overflow = 'auto';
    tablePanel.innerHTML = `<div class="panel-title">Bootstrap Results: ${summary}</div>`;

    let tableHtml = '<table class="preview-table" style="font-size:11px"><thead><tr>';
    tableHtml += '<th>From</th><th>To</th><th>Weight</th><th>p-value</th><th>CI Lower</th><th>CI Upper</th><th>Sig</th>';
    tableHtml += '</tr></thead><tbody>';

    const sorted = [...result.edges].sort((a, b) => a.pValue - b.pValue);
    for (const e of sorted) {
      const rowStyle = e.significant ? 'background:#d4edda' : '';
      tableHtml += `<tr style="${rowStyle}">`;
      tableHtml += `<td>${e.from}</td><td>${e.to}</td>`;
      tableHtml += `<td>${fmtNum(e.weight)}</td>`;
      tableHtml += `<td>${fmtNum(e.pValue)}</td>`;
      tableHtml += `<td>${fmtNum(e.ciLower)}</td>`;
      tableHtml += `<td>${fmtNum(e.ciUpper)}</td>`;
      tableHtml += `<td style="text-align:center">${e.significant ? 'Yes' : ''}</td>`;
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table>';
    tablePanel.innerHTML += tableHtml;
    addPanelDownloadButtons(tablePanel, { csv: true, filename: `bootstrap-results${idSuffix}` });
    viewContainer.appendChild(tablePanel);
  }

  renderNetworkView();

  setTimeout(() => {
    const netBtn = document.getElementById(`boot-toggle-net${idSuffix}`);
    const forestBtn = document.getElementById(`boot-toggle-forest${idSuffix}`);
    const tableBtn = document.getElementById(`boot-toggle-table${idSuffix}`);
    const allBtns = [netBtn, forestBtn, tableBtn];

    function activate(btn: HTMLElement | null, view: 'network' | 'forest' | 'table', renderFn: () => void) {
      btn?.addEventListener('click', () => {
        if (currentView === view) return;
        currentView = view;
        allBtns.forEach(b => b?.classList.remove('active'));
        btn!.classList.add('active');
        renderFn();
      });
    }

    activate(netBtn, 'network', renderNetworkView);
    activate(forestBtn, 'forest', renderForestView);
    activate(tableBtn, 'table', renderTableView);

    if (onRerun) {
      document.getElementById(`boot-rerun${idSuffix}`)?.addEventListener('click', onRerun);
    }
  }, 0);
}

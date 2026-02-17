/**
 * Cliques tab: find cliques in the TNA network with configurable size and threshold.
 * Renders a grid of mini-networks for each clique found.
 */
import * as d3 from 'd3';
import type { TNA, CliqueResult } from 'tnaj';
import { cliques, createTNA } from 'tnaj';
import type { NetworkSettings } from '../main';
import { renderNetwork } from './network';
import { NODE_COLORS } from './colors';
import { addPanelDownloadButtons } from './export';

export function renderCliquesTab(
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
        <label style="font-size:12px;color:#777">Min Size:</label>
        <select id="clique-size${idSuffix}" style="font-size:12px">
          ${[2, 3, 4, 5, 6, 7, 8].map(s =>
            `<option value="${s}" ${s === 3 ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Threshold:</label>
        <input type="range" id="clique-threshold${idSuffix}" min="0" max="0.5" step="0.01" value="0.05" style="width:120px">
        <span id="clique-threshold-val${idSuffix}" style="font-size:12px;color:#555">0.05</span>
      </div>
      <span id="clique-count${idSuffix}" style="font-size:12px;color:#888;margin-left:12px"></span>
    </div>
  `;
  grid.appendChild(controls);

  // Clique results container
  const resultsDiv = document.createElement('div');
  resultsDiv.id = `clique-results${idSuffix}`;
  grid.appendChild(resultsDiv);
  container.appendChild(grid);

  function renderCliques() {
    const size = parseInt((document.getElementById(`clique-size${idSuffix}`) as HTMLSelectElement).value);
    const threshold = parseFloat((document.getElementById(`clique-threshold${idSuffix}`) as HTMLInputElement).value);
    const results = cliques(model, { size, threshold }) as CliqueResult;
    const countEl = document.getElementById(`clique-count${idSuffix}`);
    const resultsEl = document.getElementById(`clique-results${idSuffix}`);
    if (!resultsEl) return;
    resultsEl.innerHTML = '';

    const nCliques = results.labels.length;
    if (countEl) countEl.textContent = `${nCliques} clique${nCliques !== 1 ? 's' : ''} found`;

    if (nCliques === 0) {
      resultsEl.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">No cliques found with these settings. Try lowering the threshold or reducing the minimum size.</div>';
      return;
    }

    // Grid of mini-networks
    const cliqueGrid = document.createElement('div');
    cliqueGrid.style.display = 'grid';
    cliqueGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(320px, 1fr))';
    cliqueGrid.style.gap = '12px';

    for (let c = 0; c < nCliques; c++) {
      const cliqueLabels = results.labels[c]!;
      const cliqueWeights = results.weights[c]!;

      // Build a mini TNA for this clique
      const inits = new Float64Array(cliqueLabels.length).fill(1 / cliqueLabels.length);
      const miniModel = createTNA(cliqueWeights, inits, cliqueLabels, null, 'matrix', []);

      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.innerHTML = `
        <div class="panel-title" style="font-size:12px">Clique ${c + 1}: ${cliqueLabels.join(', ')}</div>
        <div id="viz-clique-${c}${idSuffix}" style="width:100%;height:250px"></div>
      `;
      addPanelDownloadButtons(panel, { image: true, filename: `clique-${c + 1}${idSuffix}` });
      cliqueGrid.appendChild(panel);
    }

    resultsEl.appendChild(cliqueGrid);

    // Render mini networks
    requestAnimationFrame(() => {
      for (let c = 0; c < nCliques; c++) {
        const el = document.getElementById(`viz-clique-${c}${idSuffix}`);
        if (!el) continue;
        const cliqueLabels = results.labels[c]!;
        const cliqueWeights = results.weights[c]!;
        const inits = new Float64Array(cliqueLabels.length).fill(1 / cliqueLabels.length);
        const miniModel = createTNA(cliqueWeights, inits, cliqueLabels, null, 'matrix', []);

        const miniSettings: NetworkSettings = {
          ...networkSettings,
          networkHeight: 250,
          nodeRadius: 25,
          nodeLabelSize: 8,
          edgeLabelSize: 6,
          edgeThreshold: 0,
          layout: 'circular',
          graphPadding: 10,
          showSelfLoops: false,
        };
        renderNetwork(el, miniModel, miniSettings);
      }
    });
  }

  // Wire events
  setTimeout(() => {
    document.getElementById(`clique-size${idSuffix}`)?.addEventListener('change', renderCliques);
    const thresholdSlider = document.getElementById(`clique-threshold${idSuffix}`) as HTMLInputElement | null;
    if (thresholdSlider) {
      thresholdSlider.addEventListener('input', () => {
        document.getElementById(`clique-threshold-val${idSuffix}`)!.textContent = parseFloat(thresholdSlider.value).toFixed(2);
        renderCliques();
      });
    }
  }, 0);

  // Initial render
  requestAnimationFrame(renderCliques);
}

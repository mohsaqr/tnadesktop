/**
 * Edge betweenness tab: table + network visualization of betweenness weights.
 */
import * as d3 from 'd3';
import type { TNA } from 'tnaj';
import { betweennessNetwork } from 'tnaj';
import type { NetworkSettings } from '../main';
import { showTooltip, hideTooltip } from '../main';
import { renderNetwork } from './network';
import { addPanelDownloadButtons } from './export';

export function renderBetweennessTab(
  container: HTMLElement,
  model: TNA,
  networkSettings: NetworkSettings,
  idSuffix = '',
) {
  const bModel = betweennessNetwork(model) as TNA;
  const n = bModel.labels.length;

  // Collect edges with betweenness values
  const edges: { from: string; to: string; betweenness: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const w = bModel.weights.get(i, j);
      if (w > 0) {
        edges.push({ from: bModel.labels[i]!, to: bModel.labels[j]!, betweenness: w });
      }
    }
  }
  edges.sort((a, b) => b.betweenness - a.betweenness);

  const grid = document.createElement('div');
  grid.className = 'panels-grid row-2';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = '16px';

  // Table panel
  const tablePanel = document.createElement('div');
  tablePanel.className = 'panel';
  tablePanel.style.maxHeight = `${networkSettings.networkHeight + 40}px`;
  tablePanel.style.overflow = 'auto';
  tablePanel.innerHTML = `<div class="panel-title">Edge Betweenness Values</div>`;

  let tableHtml = '<table class="preview-table" style="font-size:12px"><thead><tr>';
  tableHtml += '<th>From</th><th>To</th><th>Betweenness</th>';
  tableHtml += '</tr></thead><tbody>';
  for (const e of edges) {
    tableHtml += `<tr><td>${e.from}</td><td>${e.to}</td><td>${e.betweenness.toFixed(4)}</td></tr>`;
  }
  tableHtml += '</tbody></table>';
  tablePanel.innerHTML += tableHtml;
  addPanelDownloadButtons(tablePanel, { csv: true, filename: `betweenness-table${idSuffix}` });
  grid.appendChild(tablePanel);

  // Network panel (using betweenness weights)
  const h = networkSettings.networkHeight;
  const netPanel = document.createElement('div');
  netPanel.className = 'panel';
  netPanel.style.minHeight = `${h + 40}px`;
  netPanel.innerHTML = `
    <div class="panel-title">Betweenness Network</div>
    <div id="viz-betweenness-network${idSuffix}" style="width:100%;height:${h}px"></div>
  `;
  addPanelDownloadButtons(netPanel, { image: true, filename: `betweenness-network${idSuffix}` });
  grid.appendChild(netPanel);

  container.appendChild(grid);

  requestAnimationFrame(() => {
    const el = document.getElementById(`viz-betweenness-network${idSuffix}`);
    if (el) {
      // Use a modified settings with lower threshold for betweenness network
      const bSettings = { ...networkSettings, edgeThreshold: 0 };
      renderNetwork(el, bModel, bSettings);
    }
  });
}

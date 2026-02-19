/**
 * Edge betweenness: separate network and table rendering functions.
 */
import type { TNA } from 'tnaj';
import { betweennessNetwork } from 'tnaj';
import type { NetworkSettings } from '../main';
import { renderNetwork, fmtNum } from './network';
import { addPanelDownloadButtons } from './export';

/** Compute betweenness model and edge list (shared by both views). */
function prepareBetweenness(model: TNA) {
  const bModel = betweennessNetwork(model) as TNA;
  const n = bModel.labels.length;
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
  return { bModel, edges };
}

/** Render just the betweenness network graph. */
export function renderBetweennessNetwork(
  container: HTMLElement,
  model: TNA,
  networkSettings: NetworkSettings,
  idSuffix = '',
) {
  const { bModel } = prepareBetweenness(model);
  const h = networkSettings.networkHeight;
  const netPanel = document.createElement('div');
  netPanel.className = 'panel';
  netPanel.style.minHeight = `${h + 40}px`;
  netPanel.innerHTML = `
    <div class="panel-title">Betweenness Network</div>
    <div id="viz-betweenness-network${idSuffix}" style="width:100%;height:${h}px"></div>
  `;
  addPanelDownloadButtons(netPanel, { image: true, filename: `betweenness-network${idSuffix}` });
  container.appendChild(netPanel);

  requestAnimationFrame(() => {
    const el = document.getElementById(`viz-betweenness-network${idSuffix}`);
    if (el) {
      const bSettings = { ...networkSettings, edgeThreshold: 0 };
      renderNetwork(el, bModel, bSettings);
    }
  });
}

/** Render just the edge betweenness values table. */
export function renderBetweennessTable(
  container: HTMLElement,
  model: TNA,
  idSuffix = '',
) {
  const { edges } = prepareBetweenness(model);
  const tablePanel = document.createElement('div');
  tablePanel.className = 'panel';
  tablePanel.style.maxHeight = '600px';
  tablePanel.style.overflow = 'auto';
  tablePanel.innerHTML = `<div class="panel-title">Edge Betweenness Values</div>`;

  let tableHtml = '<table class="preview-table" style="font-size:12px"><thead><tr>';
  tableHtml += '<th>From</th><th>To</th><th>Betweenness</th>';
  tableHtml += '</tr></thead><tbody>';
  for (const e of edges) {
    tableHtml += `<tr><td>${e.from}</td><td>${e.to}</td><td>${fmtNum(e.betweenness)}</td></tr>`;
  }
  tableHtml += '</tbody></table>';
  tablePanel.innerHTML += tableHtml;
  addPanelDownloadButtons(tablePanel, { csv: true, filename: `betweenness-table${idSuffix}` });
  container.appendChild(tablePanel);
}

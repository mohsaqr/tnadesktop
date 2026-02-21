/**
 * Sequence indices tab: per-sequence metrics and summary statistics.
 */
import * as d3 from 'd3';
import type { TNA } from 'tnaj';
import { computeSequenceIndices, summarizeIndices } from '../analysis/indices';
import type { SequenceIndex, IndicesSummary } from '../analysis/indices';
import { addPanelDownloadButtons } from './export';
import { fmtNum } from './network';
import { createViewToggle } from './dashboard';

export const metricDefs: { key: keyof SequenceIndex; label: string }[] = [
  { key: 'entropy', label: 'Shannon Entropy' },
  { key: 'turbulence', label: 'Turbulence' },
  { key: 'normalizedEntropy', label: 'Normalized Entropy' },
  { key: 'selfLoopRate', label: 'Self-Loop Rate' },
  { key: 'gini', label: 'Gini Coefficient' },
  { key: 'persistence', label: 'State Persistence' },
  { key: 'transitionDiversity', label: 'Transition Diversity' },
  { key: 'integrativeComplexity', label: 'Integrative Complexity' },
  { key: 'routine', label: 'Routine Index' },
];

/** Original combined view (kept for multi-group card usage). */
export function renderIndicesTab(
  container: HTMLElement,
  model: TNA,
  idSuffix = '',
) {
  if (!model.data) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">No sequence data available for index computation.</div>';
    return;
  }

  const indices = computeSequenceIndices(model.data);
  const summaries = summarizeIndices(indices);

  createViewToggle(container,
    (fig) => {
      const chartGrid = document.createElement('div');
      chartGrid.style.display = 'grid';
      chartGrid.style.gridTemplateColumns = '1fr 1fr';
      chartGrid.style.gap = '16px';

      for (const def of metricDefs) {
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = `<div class="panel-title">${def.label}</div><div id="viz-idx-${def.key}${idSuffix}" style="width:100%"></div>`;
        addPanelDownloadButtons(panel, { image: true, filename: `index-${def.key}${idSuffix}` });
        chartGrid.appendChild(panel);
      }
      fig.appendChild(chartGrid);

      requestAnimationFrame(() => {
        for (const def of metricDefs) {
          const el = document.getElementById(`viz-idx-${def.key}${idSuffix}`);
          if (el) {
            const vals = indices.map(idx => idx[def.key] as number);
            renderIndexHistogram(el, vals, def.label);
          }
        }
      });
    },
    (tbl) => {
      renderSummaryTable(tbl, indices, summaries, idSuffix);
    },
    `idx${idSuffix}`,
  );
}

/** Histograms-only sub-view for secondary tabs. */
export function renderIdxHistView(
  container: HTMLElement,
  model: TNA,
  idSuffix = '',
) {
  if (!model.data) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">No sequence data available.</div>';
    return;
  }

  const indices = computeSequenceIndices(model.data);

  createViewToggle(container,
    (fig) => {
      // Card/Combined toggle
      const toggleBar = document.createElement('div');
      toggleBar.style.marginBottom = '8px';
      toggleBar.innerHTML = `<div class="view-toggle"><button class="toggle-btn" id="idx-hist-toggle-card${idSuffix}">Card View</button><button class="toggle-btn active" id="idx-hist-toggle-combined${idSuffix}">Combined</button></div>`;
      fig.appendChild(toggleBar);

      const outerWrapper = document.createElement('div');
      outerWrapper.style.maxWidth = '900px';
      outerWrapper.style.margin = '0 auto';
      const viewContainer = document.createElement('div');
      outerWrapper.appendChild(viewContainer);
      fig.appendChild(outerWrapper);

      let currentView: 'card' | 'combined' = 'combined';

      function renderCardView() {
        viewContainer.innerHTML = '';
        const chartGrid = document.createElement('div');
        chartGrid.style.display = 'grid';
        chartGrid.style.gridTemplateColumns = '1fr 1fr';
        chartGrid.style.gap = '16px';

        for (const def of metricDefs) {
          const panel = document.createElement('div');
          panel.className = 'panel';
          panel.innerHTML = `<div class="panel-title">${def.label}</div><div id="viz-idx-${def.key}${idSuffix}" style="width:100%"></div>`;
          addPanelDownloadButtons(panel, { image: true, filename: `index-${def.key}${idSuffix}` });
          chartGrid.appendChild(panel);
        }
        viewContainer.appendChild(chartGrid);

        requestAnimationFrame(() => {
          for (const def of metricDefs) {
            const el = document.getElementById(`viz-idx-${def.key}${idSuffix}`);
            if (el) {
              const vals = indices.map(idx => idx[def.key] as number);
              renderIndexHistogram(el, vals, def.label);
            }
          }
        });
      }

      function renderCombinedView() {
        viewContainer.innerHTML = '';
        const panel = document.createElement('div');
        panel.className = 'panel';
        const innerGrid = document.createElement('div');
        innerGrid.style.display = 'grid';
        innerGrid.style.gridTemplateColumns = '1fr 1fr';
        innerGrid.style.gap = '16px';

        for (const def of metricDefs) {
          const cell = document.createElement('div');
          cell.innerHTML = `<div class="panel-title">${def.label}</div><div id="viz-idx-${def.key}${idSuffix}" style="width:100%"></div>`;
          innerGrid.appendChild(cell);
        }
        panel.appendChild(innerGrid);
        addPanelDownloadButtons(panel, { image: true, filename: `indices-histograms${idSuffix}` });
        viewContainer.appendChild(panel);

        requestAnimationFrame(() => {
          for (const def of metricDefs) {
            const el = document.getElementById(`viz-idx-${def.key}${idSuffix}`);
            if (el) {
              const vals = indices.map(idx => idx[def.key] as number);
              renderIndexHistogram(el, vals, def.label);
            }
          }
        });
      }

      renderCombinedView();

      setTimeout(() => {
        document.getElementById(`idx-hist-toggle-card${idSuffix}`)?.addEventListener('click', () => {
          if (currentView === 'card') return;
          currentView = 'card';
          document.getElementById(`idx-hist-toggle-card${idSuffix}`)!.classList.add('active');
          document.getElementById(`idx-hist-toggle-combined${idSuffix}`)!.classList.remove('active');
          renderCardView();
        });
        document.getElementById(`idx-hist-toggle-combined${idSuffix}`)?.addEventListener('click', () => {
          if (currentView === 'combined') return;
          currentView = 'combined';
          document.getElementById(`idx-hist-toggle-combined${idSuffix}`)!.classList.add('active');
          document.getElementById(`idx-hist-toggle-card${idSuffix}`)!.classList.remove('active');
          renderCombinedView();
        });
      }, 0);
    },
    (tbl) => {
      const wrapper = document.createElement('div');
      wrapper.style.maxWidth = '900px';
      wrapper.style.margin = '0 auto';
      // Per-sequence detail table
      const detailPanel = document.createElement('div');
      detailPanel.className = 'panel';
      detailPanel.style.maxHeight = '500px';
      detailPanel.style.overflow = 'auto';
      detailPanel.innerHTML = `<div class="panel-title">Per-Sequence Indices</div>`;

      let detailHtml = '<table class="preview-table" style="font-size:11px"><thead><tr>';
      detailHtml += '<th>Seq</th><th>Length</th><th>States</th><th>Entropy</th><th>Norm. Entropy</th><th>Transitions</th><th>Turbulence</th><th>Self-Loop Rate</th><th>Gini</th><th>Persistence</th><th>Trans. Diversity</th><th>Integ. Complexity</th><th>Routine</th>';
      detailHtml += '</tr></thead><tbody>';
      const maxShow = Math.min(indices.length, 200);
      for (let i = 0; i < maxShow; i++) {
        const idx = indices[i]!;
        detailHtml += '<tr>';
        detailHtml += `<td>${idx.id + 1}</td>`;
        detailHtml += `<td>${idx.length}</td>`;
        detailHtml += `<td>${idx.nUniqueStates}</td>`;
        detailHtml += `<td>${fmtNum(idx.entropy, 3)}</td>`;
        detailHtml += `<td>${fmtNum(idx.normalizedEntropy, 3)}</td>`;
        detailHtml += `<td>${idx.complexity}</td>`;
        detailHtml += `<td>${fmtNum(idx.turbulence, 3)}</td>`;
        detailHtml += `<td>${fmtNum(idx.selfLoopRate, 3)}</td>`;
        detailHtml += `<td>${fmtNum(idx.gini, 3)}</td>`;
        detailHtml += `<td>${idx.persistence}</td>`;
        detailHtml += `<td>${fmtNum(idx.transitionDiversity, 3)}</td>`;
        detailHtml += `<td>${fmtNum(idx.integrativeComplexity, 3)}</td>`;
        detailHtml += `<td>${fmtNum(idx.routine, 3)}</td>`;
        detailHtml += '</tr>';
      }
      if (indices.length > maxShow) {
        detailHtml += `<tr><td colspan="13" style="text-align:center;color:#888;font-style:italic">... ${indices.length - maxShow} more sequences</td></tr>`;
      }
      detailHtml += '</tbody></table>';
      detailPanel.innerHTML += detailHtml;
      addPanelDownloadButtons(detailPanel, { csv: true, filename: `indices-detail${idSuffix}` });
      wrapper.appendChild(detailPanel);
      tbl.appendChild(wrapper);
    },
    `idx-hist${idSuffix}`,
  );
}

/** Summary-only sub-view for secondary tabs. */
export function renderIdxSummaryView(
  container: HTMLElement,
  model: TNA,
  idSuffix = '',
) {
  if (!model.data) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">No sequence data available.</div>';
    return;
  }

  const indices = computeSequenceIndices(model.data);
  const summaries = summarizeIndices(indices);

  const wrapper = document.createElement('div');
  wrapper.style.maxWidth = '800px';
  wrapper.style.margin = '0 auto';
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `<div class="panel-title">Sequence Index Summary (${indices.length} sequences)</div>`;

  let summaryHtml = '<table class="preview-table" style="font-size:12px"><thead><tr>';
  summaryHtml += '<th>Metric</th><th>Mean</th><th>SD</th><th>Median</th><th>Min</th><th>Max</th>';
  summaryHtml += '</tr></thead><tbody>';
  for (const s of summaries) {
    summaryHtml += '<tr>';
    summaryHtml += `<td style="font-weight:600">${s.metric}</td>`;
    summaryHtml += `<td>${fmtNum(s.mean, 3)}</td>`;
    summaryHtml += `<td>${fmtNum(s.sd, 3)}</td>`;
    summaryHtml += `<td>${fmtNum(s.median, 3)}</td>`;
    summaryHtml += `<td>${fmtNum(s.min, 3)}</td>`;
    summaryHtml += `<td>${fmtNum(s.max, 3)}</td>`;
    summaryHtml += '</tr>';
  }
  summaryHtml += '</tbody></table>';
  panel.innerHTML += summaryHtml;
  addPanelDownloadButtons(panel, { csv: true, filename: `indices-summary${idSuffix}` });
  wrapper.appendChild(panel);
  container.appendChild(wrapper);
}

function renderSummaryTable(tbl: HTMLElement, indices: SequenceIndex[], summaries: IndicesSummary[], idSuffix: string) {
  const summaryPanel = document.createElement('div');
  summaryPanel.className = 'panel';
  summaryPanel.innerHTML = `<div class="panel-title">Sequence Index Summary (${indices.length} sequences)</div>`;

  let summaryHtml = '<table class="preview-table" style="font-size:12px"><thead><tr>';
  summaryHtml += '<th>Metric</th><th>Mean</th><th>SD</th><th>Median</th><th>Min</th><th>Max</th>';
  summaryHtml += '</tr></thead><tbody>';
  for (const s of summaries) {
    summaryHtml += '<tr>';
    summaryHtml += `<td style="font-weight:600">${s.metric}</td>`;
    summaryHtml += `<td>${fmtNum(s.mean, 3)}</td>`;
    summaryHtml += `<td>${fmtNum(s.sd, 3)}</td>`;
    summaryHtml += `<td>${fmtNum(s.median, 3)}</td>`;
    summaryHtml += `<td>${fmtNum(s.min, 3)}</td>`;
    summaryHtml += `<td>${fmtNum(s.max, 3)}</td>`;
    summaryHtml += '</tr>';
  }
  summaryHtml += '</tbody></table>';
  summaryPanel.innerHTML += summaryHtml;
  addPanelDownloadButtons(summaryPanel, { csv: true, filename: `indices-summary${idSuffix}` });
  tbl.appendChild(summaryPanel);

  // Per-sequence detail table
  const detailPanel = document.createElement('div');
  detailPanel.className = 'panel';
  detailPanel.style.maxHeight = '500px';
  detailPanel.style.overflow = 'auto';
  detailPanel.style.marginTop = '16px';
  detailPanel.innerHTML = `<div class="panel-title">Per-Sequence Indices</div>`;

  let detailHtml = '<table class="preview-table" style="font-size:11px"><thead><tr>';
  detailHtml += '<th>Seq</th><th>Length</th><th>States</th><th>Entropy</th><th>Norm. Entropy</th><th>Transitions</th><th>Turbulence</th><th>Self-Loop Rate</th><th>Gini</th><th>Persistence</th><th>Trans. Diversity</th><th>Integ. Complexity</th><th>Routine</th>';
  detailHtml += '</tr></thead><tbody>';
  const maxShow = Math.min(indices.length, 200);
  for (let i = 0; i < maxShow; i++) {
    const idx = indices[i]!;
    detailHtml += '<tr>';
    detailHtml += `<td>${idx.id + 1}</td>`;
    detailHtml += `<td>${idx.length}</td>`;
    detailHtml += `<td>${idx.nUniqueStates}</td>`;
    detailHtml += `<td>${fmtNum(idx.entropy, 3)}</td>`;
    detailHtml += `<td>${fmtNum(idx.normalizedEntropy, 3)}</td>`;
    detailHtml += `<td>${idx.complexity}</td>`;
    detailHtml += `<td>${fmtNum(idx.turbulence, 3)}</td>`;
    detailHtml += `<td>${fmtNum(idx.selfLoopRate, 3)}</td>`;
    detailHtml += '</tr>';
  }
  if (indices.length > maxShow) {
    detailHtml += `<tr><td colspan="13" style="text-align:center;color:#888;font-style:italic">... ${indices.length - maxShow} more sequences</td></tr>`;
  }
  detailHtml += '</tbody></table>';
  detailPanel.innerHTML += detailHtml;
  addPanelDownloadButtons(detailPanel, { csv: true, filename: `indices-detail${idSuffix}` });
  tbl.appendChild(detailPanel);
}

function renderIndexHistogram(container: HTMLElement, values: number[], label: string) {
  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 250);
  const height = 180;
  const margin = { top: 10, right: 20, bottom: 30, left: 50 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  d3.select(container).selectAll('*').remove();
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const extent = d3.extent(values) as [number, number];
  const x = d3.scaleLinear()
    .domain([extent[0], extent[1]])
    .range([0, innerW])
    .nice();

  const bins = d3.bin()
    .domain(x.domain() as [number, number])
    .thresholds(x.ticks(20))(values);

  const maxBin = d3.max(bins, b => b.length) ?? 1;
  const y = d3.scaleLinear()
    .domain([0, maxBin])
    .range([innerH, 0]);

  g.selectAll('rect')
    .data(bins)
    .enter()
    .append('rect')
    .attr('x', d => x(d.x0!) + 1)
    .attr('width', d => Math.max(0, x(d.x1!) - x(d.x0!) - 1))
    .attr('y', d => y(d.length))
    .attr('height', d => innerH - y(d.length))
    .attr('fill', '#4e79a7')
    .attr('opacity', 0.7);

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(5))
    .selectAll('text').attr('font-size', '10px');

  g.append('g')
    .call(d3.axisLeft(y).ticks(5))
    .selectAll('text').attr('font-size', '10px');
}

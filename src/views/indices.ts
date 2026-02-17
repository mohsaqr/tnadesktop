/**
 * Sequence indices tab: per-sequence metrics and summary statistics.
 */
import * as d3 from 'd3';
import type { TNA } from 'tnaj';
import { computeSequenceIndices, summarizeIndices } from '../analysis/indices';
import type { SequenceIndex, IndicesSummary } from '../analysis/indices';

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

  const grid = document.createElement('div');
  grid.className = 'panels-grid';

  // Summary statistics table
  const summaryPanel = document.createElement('div');
  summaryPanel.className = 'panel';
  summaryPanel.innerHTML = `<div class="panel-title">Sequence Index Summary (${indices.length} sequences)</div>`;

  let summaryHtml = '<table class="preview-table" style="font-size:12px"><thead><tr>';
  summaryHtml += '<th>Metric</th><th>Mean</th><th>SD</th><th>Median</th><th>Min</th><th>Max</th>';
  summaryHtml += '</tr></thead><tbody>';
  for (const s of summaries) {
    summaryHtml += '<tr>';
    summaryHtml += `<td style="font-weight:600">${s.metric}</td>`;
    summaryHtml += `<td>${s.mean.toFixed(3)}</td>`;
    summaryHtml += `<td>${s.sd.toFixed(3)}</td>`;
    summaryHtml += `<td>${s.median.toFixed(3)}</td>`;
    summaryHtml += `<td>${s.min.toFixed(3)}</td>`;
    summaryHtml += `<td>${s.max.toFixed(3)}</td>`;
    summaryHtml += '</tr>';
  }
  summaryHtml += '</tbody></table>';
  summaryPanel.innerHTML += summaryHtml;
  grid.appendChild(summaryPanel);

  // Histograms for key metrics
  const chartGrid = document.createElement('div');
  chartGrid.style.display = 'grid';
  chartGrid.style.gridTemplateColumns = '1fr 1fr';
  chartGrid.style.gap = '16px';

  const metricDefs: { key: keyof SequenceIndex; label: string }[] = [
    { key: 'entropy', label: 'Shannon Entropy' },
    { key: 'turbulence', label: 'Turbulence' },
    { key: 'normalizedEntropy', label: 'Normalized Entropy' },
    { key: 'selfLoopRate', label: 'Self-Loop Rate' },
  ];

  for (const def of metricDefs) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<div class="panel-title">${def.label}</div><div id="viz-idx-${def.key}${idSuffix}" style="width:100%"></div>`;
    chartGrid.appendChild(panel);
  }

  grid.appendChild(chartGrid);

  // Per-sequence table (scrollable)
  const detailPanel = document.createElement('div');
  detailPanel.className = 'panel';
  detailPanel.style.maxHeight = '400px';
  detailPanel.style.overflow = 'auto';
  detailPanel.innerHTML = `<div class="panel-title">Per-Sequence Indices</div>`;

  let detailHtml = '<table class="preview-table" style="font-size:11px"><thead><tr>';
  detailHtml += '<th>Seq</th><th>Length</th><th>States</th><th>Entropy</th><th>Norm. Entropy</th><th>Transitions</th><th>Turbulence</th><th>Self-Loop Rate</th>';
  detailHtml += '</tr></thead><tbody>';
  const maxShow = Math.min(indices.length, 200);
  for (let i = 0; i < maxShow; i++) {
    const idx = indices[i]!;
    detailHtml += '<tr>';
    detailHtml += `<td>${idx.id + 1}</td>`;
    detailHtml += `<td>${idx.length}</td>`;
    detailHtml += `<td>${idx.nUniqueStates}</td>`;
    detailHtml += `<td>${idx.entropy.toFixed(3)}</td>`;
    detailHtml += `<td>${idx.normalizedEntropy.toFixed(3)}</td>`;
    detailHtml += `<td>${idx.complexity}</td>`;
    detailHtml += `<td>${idx.turbulence.toFixed(3)}</td>`;
    detailHtml += `<td>${idx.selfLoopRate.toFixed(3)}</td>`;
    detailHtml += '</tr>';
  }
  if (indices.length > maxShow) {
    detailHtml += `<tr><td colspan="8" style="text-align:center;color:#888;font-style:italic">... ${indices.length - maxShow} more sequences</td></tr>`;
  }
  detailHtml += '</tbody></table>';
  detailPanel.innerHTML += detailHtml;
  grid.appendChild(detailPanel);

  container.appendChild(grid);

  // Render histograms
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

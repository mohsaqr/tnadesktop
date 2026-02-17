/**
 * Compare network properties across groups.
 * Simple metric comparison: density, mean weight, etc.
 * Only visible when a GroupTNA is loaded.
 */
import * as d3 from 'd3';
import type { GroupTNA, TNA } from 'tnaj';
import { summary } from 'tnaj';
import { showTooltip, hideTooltip } from '../main';
import { addPanelDownloadButtons, downloadSvgFromElement, downloadPngFromElement } from './export';

interface GroupMetrics {
  group: string;
  nStates: number;
  nEdges: number;
  density: number;
  meanWeight: number;
  maxWeight: number;
  hasSelfLoops: boolean;
  reciprocity: number;
}

function computeMetrics(model: TNA, groupName: string): GroupMetrics {
  const s = summary(model) as any;
  const n = model.labels.length;

  // Compute reciprocity: fraction of edges where both i->j and j->i exist
  let mutual = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (model.weights.get(i, j) > 0) {
        total++;
        if (model.weights.get(j, i) > 0) mutual++;
      }
    }
  }

  return {
    group: groupName,
    nStates: s.nStates,
    nEdges: s.nEdges,
    density: s.density,
    meanWeight: s.meanWeight,
    maxWeight: s.maxWeight,
    hasSelfLoops: s.hasSelfLoops,
    reciprocity: total > 0 ? mutual / total : 0,
  };
}

export function renderCompareNetworksTab(
  container: HTMLElement,
  fullModel: GroupTNA,
) {
  const groupNames = Object.keys(fullModel.models);
  if (groupNames.length < 2) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">Need at least 2 groups to compare networks.</div>';
    return;
  }

  const metrics = groupNames.map(g => computeMetrics(fullModel.models[g]!, g));

  const grid = document.createElement('div');
  grid.className = 'panels-grid';

  // Summary table
  const tablePanel = document.createElement('div');
  tablePanel.className = 'panel';
  tablePanel.innerHTML = `<div class="panel-title">Network Properties by Group</div>`;

  let tableHtml = '<table class="preview-table" style="font-size:12px"><thead><tr>';
  tableHtml += '<th>Group</th><th>States</th><th>Edges</th><th>Density</th><th>Mean Weight</th><th>Max Weight</th><th>Reciprocity</th><th>Self-loops</th>';
  tableHtml += '</tr></thead><tbody>';
  for (const m of metrics) {
    tableHtml += '<tr>';
    tableHtml += `<td style="font-weight:600">${m.group}</td>`;
    tableHtml += `<td>${m.nStates}</td>`;
    tableHtml += `<td>${m.nEdges}</td>`;
    tableHtml += `<td>${m.density.toFixed(3)}</td>`;
    tableHtml += `<td>${m.meanWeight.toFixed(4)}</td>`;
    tableHtml += `<td>${m.maxWeight.toFixed(4)}</td>`;
    tableHtml += `<td>${m.reciprocity.toFixed(3)}</td>`;
    tableHtml += `<td>${m.hasSelfLoops ? 'Yes' : 'No'}</td>`;
    tableHtml += '</tr>';
  }
  tableHtml += '</tbody></table>';
  tablePanel.innerHTML += tableHtml;
  addPanelDownloadButtons(tablePanel, { csv: true, filename: 'compare-networks-table' });
  grid.appendChild(tablePanel);

  // Bar chart comparing key metrics across groups
  const chartGrid = document.createElement('div');
  chartGrid.style.display = 'grid';
  chartGrid.style.gridTemplateColumns = '1fr 1fr';
  chartGrid.style.gap = '16px';

  const metricDefs = [
    { key: 'density', label: 'Density', fmt: (v: number) => v.toFixed(3) },
    { key: 'meanWeight', label: 'Mean Weight', fmt: (v: number) => v.toFixed(4) },
    { key: 'nEdges', label: 'Number of Edges', fmt: (v: number) => String(v) },
    { key: 'reciprocity', label: 'Reciprocity', fmt: (v: number) => v.toFixed(3) },
  ];

  for (const def of metricDefs) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<div class="panel-title">${def.label}</div><div id="viz-cmp-${def.key}" style="width:100%"></div>`;
    addPanelDownloadButtons(panel, { image: true, filename: `compare-${def.key}` });
    chartGrid.appendChild(panel);
  }

  grid.appendChild(chartGrid);

  // Difference heatmap for a selected group pair
  const heatPanel = document.createElement('div');
  heatPanel.className = 'panel';
  heatPanel.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <div class="panel-title" style="margin-bottom:0;flex:0 0 auto">Weight Difference Heatmap</div>
      <span class="panel-download-btns" style="flex:0 0 auto"><button class="panel-dl-btn" id="dl-heatmap-svg">SVG</button><button class="panel-dl-btn" id="dl-heatmap-png">PNG</button></span>
      <select id="cmp-heat-g1" style="font-size:12px">
        ${groupNames.map((g, i) => `<option value="${g}" ${i === 0 ? 'selected' : ''}>${g}</option>`).join('')}
      </select>
      <span style="color:#888">vs</span>
      <select id="cmp-heat-g2" style="font-size:12px">
        ${groupNames.map((g, i) => `<option value="${g}" ${i === 1 ? 'selected' : ''}>${g}</option>`).join('')}
      </select>
    </div>
    <div id="viz-cmp-heatmap" style="width:100%"></div>
  `;
  grid.appendChild(heatPanel);

  container.appendChild(grid);

  // Render charts
  requestAnimationFrame(() => {
    for (const def of metricDefs) {
      const el = document.getElementById(`viz-cmp-${def.key}`);
      if (el) renderGroupBarChart(el, metrics, def.key as keyof GroupMetrics, def.label, def.fmt);
    }
    renderDiffHeatmap(
      document.getElementById('viz-cmp-heatmap')!,
      fullModel.models[groupNames[0]!]!,
      fullModel.models[groupNames[1]!]!,
    );
  });

  // Wire heatmap download buttons + pair selectors
  setTimeout(() => {
    document.getElementById('dl-heatmap-svg')?.addEventListener('click', () => {
      const el = document.getElementById('viz-cmp-heatmap');
      if (el) downloadSvgFromElement(el, 'compare-heatmap');
    });
    document.getElementById('dl-heatmap-png')?.addEventListener('click', () => {
      const el = document.getElementById('viz-cmp-heatmap');
      if (el) downloadPngFromElement(el, 'compare-heatmap');
    });
    const wireHeatmap = () => {
      const g1 = (document.getElementById('cmp-heat-g1') as HTMLSelectElement).value;
      const g2 = (document.getElementById('cmp-heat-g2') as HTMLSelectElement).value;
      const el = document.getElementById('viz-cmp-heatmap');
      if (el && g1 !== g2) {
        renderDiffHeatmap(el, fullModel.models[g1]!, fullModel.models[g2]!);
      }
    };
    document.getElementById('cmp-heat-g1')?.addEventListener('change', wireHeatmap);
    document.getElementById('cmp-heat-g2')?.addEventListener('change', wireHeatmap);
  }, 0);
}

const GROUP_COLORS = ['#4e79a7', '#e15759', '#59a14f', '#edc948', '#b07aa1', '#76b7b2', '#f28e2b', '#ff9da7'];

function renderGroupBarChart(
  container: HTMLElement,
  metrics: GroupMetrics[],
  key: keyof GroupMetrics,
  label: string,
  fmt: (v: number) => string,
) {
  const data = metrics.map((m, i) => ({
    group: m.group,
    value: m[key] as number,
    color: GROUP_COLORS[i % GROUP_COLORS.length]!,
  }));

  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 300);
  const height = 180;
  const margin = { top: 10, right: 40, bottom: 30, left: 60 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  d3.select(container).selectAll('*').remove();
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const y = d3.scaleBand()
    .domain(data.map(d => d.group))
    .range([0, innerH])
    .padding(0.25);

  const maxVal = Math.max(...data.map(d => d.value), 1e-6);
  const x = d3.scaleLinear()
    .domain([0, maxVal * 1.15])
    .range([0, innerW]);

  g.selectAll('rect')
    .data(data)
    .enter()
    .append('rect')
    .attr('y', d => y(d.group)!)
    .attr('width', d => x(d.value))
    .attr('height', y.bandwidth())
    .attr('fill', d => d.color)
    .attr('rx', 3);

  g.selectAll('.val-label')
    .data(data)
    .enter()
    .append('text')
    .attr('y', d => y(d.group)! + y.bandwidth() / 2)
    .attr('x', d => x(d.value) + 5)
    .attr('dy', '0.35em')
    .attr('font-size', '10px')
    .attr('fill', '#666')
    .text(d => fmt(d.value));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).tickSize(0).tickPadding(6))
    .selectAll('text').attr('font-size', '10px');
}

function renderDiffHeatmap(container: HTMLElement, modelA: TNA, modelB: TNA) {
  const labels = modelA.labels;
  const n = labels.length;

  const rect = container.getBoundingClientRect();
  const size = Math.min(Math.max(rect.width, 300), 500);
  const margin = { top: 10, right: 10, bottom: 60, left: 60 };
  const innerW = size - margin.left - margin.right;
  const innerH = size - margin.top - margin.bottom;
  const cellW = innerW / n;
  const cellH = innerH / n;

  const diffs: number[][] = [];
  let maxAbs = 0;
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const d = modelA.weights.get(i, j) - modelB.weights.get(i, j);
      row.push(d);
      if (Math.abs(d) > maxAbs) maxAbs = Math.abs(d);
    }
    diffs.push(row);
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

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const val = diffs[i]![j]!;
      g.append('rect')
        .attr('x', j * cellW)
        .attr('y', i * cellH)
        .attr('width', cellW - 1)
        .attr('height', cellH - 1)
        .attr('fill', colorScale(val))
        .attr('stroke', '#ddd')
        .attr('stroke-width', 0.5)
        .on('mouseover', function (event: MouseEvent) {
          d3.select(this).attr('stroke', '#333').attr('stroke-width', 2);
          showTooltip(event,
            `<b>${labels[i]} → ${labels[j]}</b><br>` +
            `A: ${modelA.weights.get(i, j).toFixed(4)}<br>` +
            `B: ${modelB.weights.get(i, j).toFixed(4)}<br>` +
            `Diff: ${val.toFixed(4)}`);
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

      if (cellW > 25 && cellH > 14 && Math.abs(val) > 0.001) {
        g.append('text')
          .attr('x', j * cellW + cellW / 2)
          .attr('y', i * cellH + cellH / 2)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('font-size', '8px')
          .attr('fill', Math.abs(val) > maxAbs * 0.6 ? '#fff' : '#333')
          .attr('pointer-events', 'none')
          .text(val.toFixed(3));
      }
    }
  }

  // Axis labels
  for (let i = 0; i < n; i++) {
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

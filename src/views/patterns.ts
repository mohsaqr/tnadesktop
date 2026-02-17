/**
 * Pattern discovery tab: extract and display n-gram patterns from sequences.
 */
import * as d3 from 'd3';
import type { TNA } from 'tnaj';
import { extractPatterns } from '../analysis/patterns';
import type { PatternResult } from '../analysis/patterns';
import { showTooltip, hideTooltip } from '../main';

export function renderPatternsTab(
  container: HTMLElement,
  model: TNA,
  idSuffix = '',
) {
  if (!model.data) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">No sequence data available for pattern extraction.</div>';
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
        <label style="font-size:12px;color:#777">Min n-gram:</label>
        <select id="pat-min-n${idSuffix}" style="font-size:12px">
          <option value="2" selected>2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Max n-gram:</label>
        <select id="pat-max-n${idSuffix}" style="font-size:12px">
          <option value="2">2</option>
          <option value="3" selected>3</option>
          <option value="4">4</option>
          <option value="5">5</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Min count:</label>
        <input type="number" id="pat-min-count${idSuffix}" value="2" min="1" max="100" style="font-size:12px;width:50px">
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:12px;color:#777">Min support:</label>
        <input type="number" id="pat-min-support${idSuffix}" value="0" min="0" max="1" step="0.05" style="font-size:12px;width:60px">
      </div>
      <button id="run-patterns${idSuffix}" class="btn-primary" style="font-size:12px;padding:6px 16px">Extract Patterns</button>
    </div>
  `;
  grid.appendChild(controls);

  const resultsDiv = document.createElement('div');
  resultsDiv.id = `pattern-results${idSuffix}`;
  grid.appendChild(resultsDiv);
  container.appendChild(grid);

  // Run initial extraction
  const runExtraction = () => {
    const minN = parseInt((document.getElementById(`pat-min-n${idSuffix}`) as HTMLSelectElement).value);
    const maxN = parseInt((document.getElementById(`pat-max-n${idSuffix}`) as HTMLSelectElement).value);
    const minCount = parseInt((document.getElementById(`pat-min-count${idSuffix}`) as HTMLInputElement).value);
    const minSupport = parseFloat((document.getElementById(`pat-min-support${idSuffix}`) as HTMLInputElement).value);

    const results = extractPatterns(model.data!, { minN, maxN, minCount, minSupport });
    renderPatternResults(resultsDiv, results, idSuffix);
  };

  setTimeout(() => {
    document.getElementById(`run-patterns${idSuffix}`)?.addEventListener('click', runExtraction);
    runExtraction(); // auto-run with defaults
  }, 0);
}

function renderPatternResults(container: HTMLElement, results: PatternResult[], idSuffix = '') {
  container.innerHTML = '';

  if (results.length === 0) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">No patterns found with current settings. Try lowering min count or support.</div>';
    return;
  }

  const resultGrid = document.createElement('div');
  resultGrid.style.display = 'grid';
  resultGrid.style.gridTemplateColumns = '1fr 1fr';
  resultGrid.style.gap = '16px';

  // Table
  const tablePanel = document.createElement('div');
  tablePanel.className = 'panel';
  tablePanel.style.maxHeight = '500px';
  tablePanel.style.overflow = 'auto';
  tablePanel.innerHTML = `<div class="panel-title">Patterns (${results.length} found)</div>`;

  const top = results.slice(0, 100);
  let tableHtml = '<table class="preview-table" style="font-size:11px"><thead><tr>';
  tableHtml += '<th>Pattern</th><th>Count</th><th>Support</th><th>Frequency</th>';
  tableHtml += '</tr></thead><tbody>';
  for (const p of top) {
    tableHtml += `<tr>`;
    tableHtml += `<td style="font-family:monospace;white-space:nowrap">${p.pattern}</td>`;
    tableHtml += `<td>${p.count}</td>`;
    tableHtml += `<td>${(p.support * 100).toFixed(1)}%</td>`;
    tableHtml += `<td>${(p.frequency * 100).toFixed(2)}%</td>`;
    tableHtml += '</tr>';
  }
  if (results.length > 100) {
    tableHtml += `<tr><td colspan="4" style="text-align:center;color:#888;font-style:italic">... ${results.length - 100} more patterns</td></tr>`;
  }
  tableHtml += '</tbody></table>';
  tablePanel.innerHTML += tableHtml;
  resultGrid.appendChild(tablePanel);

  // Bar chart of top 20 patterns
  const chartPanel = document.createElement('div');
  chartPanel.className = 'panel';
  chartPanel.innerHTML = `<div class="panel-title">Top Patterns by Count</div><div id="viz-pattern-chart${idSuffix}" style="width:100%"></div>`;
  resultGrid.appendChild(chartPanel);

  container.appendChild(resultGrid);

  requestAnimationFrame(() => {
    const el = document.getElementById(`viz-pattern-chart${idSuffix}`);
    if (el) renderPatternChart(el, results.slice(0, 20));
  });
}

function renderPatternChart(container: HTMLElement, patterns: PatternResult[]) {
  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 300);
  const barHeight = 22;
  const height = Math.max(patterns.length * barHeight + 40, 100);
  const margin = { top: 10, right: 50, bottom: 30, left: 160 };
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
    .domain(patterns.map(p => p.pattern))
    .range([0, innerH])
    .padding(0.15);

  const maxCount = Math.max(...patterns.map(p => p.count), 1);
  const x = d3.scaleLinear()
    .domain([0, maxCount * 1.1])
    .range([0, innerW]);

  g.selectAll('rect')
    .data(patterns)
    .enter()
    .append('rect')
    .attr('y', d => y(d.pattern)!)
    .attr('width', d => x(d.count))
    .attr('height', y.bandwidth())
    .attr('fill', '#4e79a7')
    .attr('rx', 2);

  g.selectAll('.val-label')
    .data(patterns)
    .enter()
    .append('text')
    .attr('y', d => y(d.pattern)! + y.bandwidth() / 2)
    .attr('x', d => x(d.count) + 5)
    .attr('dy', '0.35em')
    .attr('font-size', '10px')
    .attr('fill', '#666')
    .text(d => String(d.count));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).tickSize(0).tickPadding(6))
    .selectAll('text')
    .attr('font-size', '9px')
    .attr('font-family', 'monospace');

  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(5))
    .selectAll('text').attr('font-size', '10px');
}

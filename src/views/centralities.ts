/**
 * Centrality bar chart visualization.
 */
import * as d3 from 'd3';
import type { CentralityResult, CentralityMeasure } from 'tnaj';
import { showTooltip, hideTooltip } from '../main';
import { NODE_COLORS } from './colors';

export function renderCentralityChart(
  container: HTMLElement,
  cent: CentralityResult,
  measure: CentralityMeasure,
) {
  const values = cent.measures[measure];
  if (!values) return;

  const data = cent.labels.map((label, i) => ({
    label,
    value: values[i]!,
    color: NODE_COLORS[i % NODE_COLORS.length]!,
  })).sort((a, b) => b.value - a.value);

  const maxVal = Math.max(...data.map(d => d.value), 1e-6);

  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 300);
  const height = Math.max(rect.height, 280);
  const margin = { top: 10, right: 50, bottom: 28, left: 85 };
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
    .domain(data.map(d => d.label))
    .range([0, innerH])
    .padding(0.25);

  const x = d3.scaleLinear()
    .domain([0, maxVal * 1.1])
    .range([0, innerW]);

  g.selectAll('rect')
    .data(data)
    .enter()
    .append('rect')
    .attr('y', d => y(d.label)!)
    .attr('width', d => x(d.value))
    .attr('height', y.bandwidth())
    .attr('fill', d => d.color)
    .attr('rx', 4)
    .on('mouseover', function (event: MouseEvent, d) {
      d3.select(this).attr('opacity', 0.8);
      showTooltip(event, `<b>${d.label}</b><br>${measure}: ${d.value.toFixed(4)}`);
    })
    .on('mousemove', function (event: MouseEvent) {
      const tt = document.getElementById('tooltip')!;
      tt.style.left = event.clientX + 12 + 'px';
      tt.style.top = event.clientY - 10 + 'px';
    })
    .on('mouseout', function () {
      d3.select(this).attr('opacity', 1);
      hideTooltip();
    });

  g.selectAll('.val-label')
    .data(data)
    .enter()
    .append('text')
    .attr('y', d => y(d.label)! + y.bandwidth() / 2)
    .attr('x', d => x(d.value) + 5)
    .attr('dy', '0.35em')
    .attr('font-size', '11px')
    .attr('fill', '#666')
    .text(d => d.value.toFixed(3));

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).tickSize(0).tickPadding(8));

  // Measure name label below chart
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height - 4)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('font-weight', '600')
    .attr('fill', '#444')
    .text(measure);
}

/**
 * State frequency bar chart.
 */
import * as d3 from 'd3';
import type { TNA } from 'tnaj';
import { showTooltip, hideTooltip } from '../main';
import { NODE_COLORS } from './colors';

/** Count state occurrences from sequence data, or compute node out-strength from weight matrix. */
export function countStateFrequencies(model: TNA): { label: string; count: number }[] {
  const labels = model.labels;
  const n = labels.length;
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, 0);

  if (model.data) {
    for (const seq of model.data) {
      for (const s of seq) {
        if (s !== null && counts.has(s)) counts.set(s, counts.get(s)! + 1);
      }
    }
  } else {
    // No sequence data (e.g., SNA/edge list mode): compute node out-strength from weight matrix
    for (let i = 0; i < n; i++) {
      let strength = 0;
      for (let j = 0; j < n; j++) {
        strength += model.weights.get(i, j);
      }
      counts.set(labels[i]!, Math.round(strength * 1000) / 1000);
    }
  }
  return labels.map(label => ({ label, count: counts.get(label) ?? 0 }));
}

export function renderFrequencies(container: HTMLElement, model: TNA) {
  const freqs = countStateFrequencies(model);
  const total = freqs.reduce((s, f) => s + f.count, 0);
  const data = freqs.map((f, i) => ({
    label: f.label,
    value: f.count,
    pct: total > 0 ? (f.count / total) * 100 : 0,
    color: NODE_COLORS[i % NODE_COLORS.length]!,
  })).sort((a, b) => b.value - a.value);

  const maxVal = Math.max(...data.map(d => d.value), 1);

  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 400);
  const height = 260;
  const margin = { top: 10, right: 40, bottom: 30, left: 85 };
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
    .padding(0.2);

  const x = d3.scaleLinear()
    .domain([0, maxVal * 1.15])
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
      showTooltip(event, `<b>${d.label}</b><br>Count: ${d.value} (${d.pct.toFixed(1)}%)`);
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
    .text(d => `${d.value} (${d.pct.toFixed(1)}%)`);

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).tickSize(0).tickPadding(8));

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(5).tickSize(3));
}

/** Histogram of transition weight values. */
export function renderWeightHistogram(container: HTMLElement, model: TNA) {
  const n = model.labels.length;
  const weights: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const w = model.weights.get(i, j);
      if (w > 0) weights.push(w);
    }
  }
  if (weights.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:40px">No non-zero weights.</div>';
    return;
  }

  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 400);
  const height = 260;
  const margin = { top: 10, right: 20, bottom: 35, left: 50 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  d3.select(container).selectAll('*').remove();

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([0, d3.max(weights)! * 1.05])
    .range([0, innerW]);

  const bins = d3.bin()
    .domain(x.domain() as [number, number])
    .thresholds(x.ticks(20))(weights);

  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, b => b.length)!])
    .range([innerH, 0]);

  g.selectAll('rect')
    .data(bins)
    .enter()
    .append('rect')
    .attr('x', d => x(d.x0!) + 1)
    .attr('y', d => y(d.length))
    .attr('width', d => Math.max(0, x(d.x1!) - x(d.x0!) - 1))
    .attr('height', d => innerH - y(d.length))
    .attr('fill', '#4e79a7')
    .attr('opacity', 0.75)
    .on('mouseover', function (event: MouseEvent, d) {
      d3.select(this).attr('opacity', 1);
      showTooltip(event,
        `<b>${d.x0!.toFixed(3)} – ${d.x1!.toFixed(3)}</b><br>Count: ${d.length}`);
    })
    .on('mousemove', function (event: MouseEvent) {
      const tt = document.getElementById('tooltip')!;
      tt.style.left = event.clientX + 12 + 'px';
      tt.style.top = event.clientY - 10 + 'px';
    })
    .on('mouseout', function () {
      d3.select(this).attr('opacity', 0.75);
      hideTooltip();
    });

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(8).tickSize(3))
    .selectAll('text').attr('font-size', '10px');

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(5).tickSize(3))
    .selectAll('text').attr('font-size', '10px');

  g.append('text')
    .attr('x', innerW / 2).attr('y', innerH + 30)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px').attr('fill', '#666')
    .text('Edge Weight');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerH / 2).attr('y', -35)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px').attr('fill', '#666')
    .text('Count');
}

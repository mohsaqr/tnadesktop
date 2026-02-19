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

/** Multi-group frequency line chart: one line per group, x=states, y=count. */
export function renderFrequencyLines(
  container: HTMLElement,
  groupData: { groupName: string; freqs: { label: string; count: number }[]; color: string }[],
  nodeLabels: string[],
) {
  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 400);
  const height = 300;
  const margin = { top: 10, right: 20, bottom: 50, left: 60 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  d3.select(container).selectAll('*').remove();
  const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(nodeLabels).range([0, innerW]).padding(0.3);
  const maxVal = Math.max(...groupData.flatMap(gd => gd.freqs.map(f => f.count)), 1);
  const y = d3.scaleLinear().domain([0, maxVal * 1.1]).range([innerH, 0]);

  // Grid lines
  g.selectAll('.grid-line')
    .data(y.ticks(5))
    .enter()
    .append('line')
    .attr('x1', 0).attr('x2', innerW)
    .attr('y1', d => y(d)).attr('y2', d => y(d))
    .attr('stroke', '#eee').attr('stroke-dasharray', '2,2');

  // Lines and dots for each group
  for (const gd of groupData) {
    const lineData = nodeLabels.map(label => {
      const f = gd.freqs.find(fr => fr.label === label);
      return { label, count: f?.count ?? 0 };
    });

    const line = d3.line<{ label: string; count: number }>()
      .x(d => (x(d.label) ?? 0) + x.bandwidth() / 2)
      .y(d => y(d.count));

    g.append('path')
      .datum(lineData)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', gd.color)
      .attr('stroke-width', 2)
      .attr('opacity', 0.8);

    g.selectAll(null)
      .data(lineData)
      .enter()
      .append('circle')
      .attr('cx', d => (x(d.label) ?? 0) + x.bandwidth() / 2)
      .attr('cy', d => y(d.count))
      .attr('r', 4)
      .attr('fill', gd.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .on('mouseover', function (event: MouseEvent, d) {
        d3.select(this).attr('r', 6);
        showTooltip(event, `<b>${d.label}</b><br>${gd.groupName}: ${d.count}`);
      })
      .on('mousemove', function (event: MouseEvent) {
        const tt = document.getElementById('tooltip')!;
        tt.style.left = event.clientX + 12 + 'px';
        tt.style.top = event.clientY - 10 + 'px';
      })
      .on('mouseout', function () {
        d3.select(this).attr('r', 4);
        hideTooltip();
      });
  }

  // Axes
  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickSize(0).tickPadding(6))
    .selectAll('text')
    .attr('font-size', '9px')
    .attr('transform', 'rotate(-30)')
    .attr('text-anchor', 'end');

  g.append('g')
    .call(d3.axisLeft(y).ticks(5))
    .selectAll('text').attr('font-size', '10px');

  // Legend
  groupData.forEach((gd, gi) => {
    svg.append('line')
      .attr('x1', margin.left + gi * 100).attr('y1', height - 6)
      .attr('x2', margin.left + gi * 100 + 16).attr('y2', height - 6)
      .attr('stroke', gd.color).attr('stroke-width', 3);
    svg.append('text')
      .attr('x', margin.left + gi * 100 + 20).attr('y', height - 2)
      .attr('font-size', '10px').attr('fill', '#555')
      .text(gd.groupName);
  });
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

/**
 * Sequence index plot + state distribution over time.
 */
import * as d3 from 'd3';
import type { TNA, SequenceData } from 'tnaj';
import { showTooltip, hideTooltip } from '../main';
import { NODE_COLORS } from './colors';

export function renderSequences(container: HTMLElement, data: SequenceData, model: TNA) {
  const cleaned = data.map(seq => {
    let last = seq.length - 1;
    while (last >= 0 && seq[last] === null) last--;
    return seq.slice(0, last + 1) as string[];
  });

  const maxLen = Math.max(...cleaned.map(s => s.length));
  const labels = model.labels;
  const colorMap = new Map<string, string>();
  labels.forEach((l, i) => { colorMap.set(l, NODE_COLORS[i % NODE_COLORS.length]!); });

  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 500);
  const margin = { top: 10, right: 120, bottom: 30, left: 70 };
  const cellH = Math.min(18, Math.max(4, 400 / cleaned.length));
  const innerH = cleaned.length * cellH;
  const height = innerH + margin.top + margin.bottom;
  const innerW = width - margin.left - margin.right;
  const cellW = innerW / maxLen;

  d3.select(container).selectAll('*').remove();

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  cleaned.forEach((seq, row) => {
    seq.forEach((state, col) => {
      g.append('rect')
        .attr('x', col * cellW)
        .attr('y', row * cellH)
        .attr('width', cellW - 0.5)
        .attr('height', cellH - 1)
        .attr('fill', colorMap.get(state) ?? '#ccc')
        .attr('rx', 1)
        .on('mouseover', function (event: MouseEvent) {
          d3.select(this).attr('stroke', '#333').attr('stroke-width', 1.5);
          showTooltip(event, `<b>${state}</b><br>Seq ${row + 1}, Step ${col + 1}`);
        })
        .on('mousemove', function (event: MouseEvent) {
          const tt = document.getElementById('tooltip')!;
          tt.style.left = event.clientX + 12 + 'px';
          tt.style.top = event.clientY - 10 + 'px';
        })
        .on('mouseout', function () {
          d3.select(this).attr('stroke', 'none');
          hideTooltip();
        });
    });
  });

  // Y axis
  if (cleaned.length <= 60) {
    const yScale = d3.scaleBand()
      .domain(cleaned.map((_, i) => `${i + 1}`))
      .range([0, innerH]);

    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(yScale).tickSize(0).tickPadding(6))
      .selectAll('text').attr('font-size', '10px');
  }

  // X axis
  const xScale = d3.scaleLinear().domain([0, maxLen]).range([0, innerW]);
  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(xScale).ticks(Math.min(maxLen, 10)).tickSize(3))
    .selectAll('text').attr('font-size', '10px');

  g.append('text')
    .attr('x', innerW / 2).attr('y', innerH + 26)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px').attr('fill', '#666')
    .text('Time Step');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerH / 2).attr('y', -50)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px').attr('fill', '#666')
    .text('Sequence');

  // Legend
  const legend = svg.append('g')
    .attr('transform', `translate(${width - margin.right + 10}, ${margin.top})`);

  labels.forEach((label, i) => {
    const ly = i * 16;
    legend.append('rect')
      .attr('x', 0).attr('y', ly)
      .attr('width', 10).attr('height', 10)
      .attr('rx', 2)
      .attr('fill', colorMap.get(label) ?? '#ccc');
    legend.append('text')
      .attr('x', 14).attr('y', ly + 9)
      .attr('font-size', '9px').attr('fill', '#555')
      .text(label);
  });
}

export function renderDistribution(container: HTMLElement, data: SequenceData, model: TNA) {
  const cleaned = data.map(seq => {
    let last = seq.length - 1;
    while (last >= 0 && seq[last] === null) last--;
    return seq.slice(0, last + 1) as string[];
  });

  const maxLen = Math.max(...cleaned.map(s => s.length));
  const labels = model.labels;
  const colorMap = new Map<string, string>();
  labels.forEach((l, i) => { colorMap.set(l, NODE_COLORS[i % NODE_COLORS.length]!); });

  // Compute proportions at each time step
  const proportions: { step: number; state: string; proportion: number; count: number; total: number }[] = [];
  for (let t = 0; t < maxLen; t++) {
    const counts = new Map<string, number>();
    let total = 0;
    for (const seq of cleaned) {
      if (t < seq.length) {
        const s = seq[t]!;
        counts.set(s, (counts.get(s) ?? 0) + 1);
        total++;
      }
    }
    for (const label of labels) {
      const c = counts.get(label) ?? 0;
      const p = total > 0 ? c / total : 0;
      proportions.push({ step: t, state: label, proportion: p, count: c, total });
    }
  }

  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 500);
  const height = 260;
  const margin = { top: 10, right: 120, bottom: 35, left: 55 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  d3.select(container).selectAll('*').remove();

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleBand()
    .domain(Array.from({ length: maxLen }, (_, i) => `${i}`))
    .range([0, innerW])
    .padding(0.05);

  const yScale = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

  for (let t = 0; t < maxLen; t++) {
    let y0 = 0;
    for (const label of labels) {
      const entry = proportions.find(p => p.step === t && p.state === label);
      const p = entry?.proportion ?? 0;
      if (p <= 0) { y0 += p; continue; }

      g.append('rect')
        .attr('x', xScale(`${t}`)!)
        .attr('y', yScale(y0 + p))
        .attr('width', xScale.bandwidth())
        .attr('height', yScale(y0) - yScale(y0 + p))
        .attr('fill', colorMap.get(label) ?? '#ccc')
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.3)
        .on('mouseover', function (event: MouseEvent) {
          d3.select(this).attr('stroke', '#333').attr('stroke-width', 1.5);
          showTooltip(event,
            `<b>${label}</b><br>Step ${t + 1}: ${(p * 100).toFixed(1)}% (${entry?.count}/${entry?.total})`);
        })
        .on('mousemove', function (event: MouseEvent) {
          const tt = document.getElementById('tooltip')!;
          tt.style.left = event.clientX + 12 + 'px';
          tt.style.top = event.clientY - 10 + 'px';
        })
        .on('mouseout', function () {
          d3.select(this).attr('stroke', '#fff').attr('stroke-width', 0.3);
          hideTooltip();
        });

      y0 += p;
    }
  }

  // Axes
  const tickVals = Array.from({ length: maxLen }, (_, i) => `${i}`)
    .filter((_, i) => i % Math.max(1, Math.floor(maxLen / 12)) === 0);

  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(xScale).tickValues(tickVals).tickSize(3))
    .selectAll('text').attr('font-size', '10px');

  g.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format('.0%')).tickSize(3))
    .selectAll('text').attr('font-size', '10px');

  g.append('text')
    .attr('x', innerW / 2).attr('y', innerH + 30)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px').attr('fill', '#666')
    .text('Time Step');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerH / 2).attr('y', -40)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px').attr('fill', '#666')
    .text('Proportion');

  // Legend
  const legend = svg.append('g')
    .attr('transform', `translate(${width - margin.right + 10}, ${margin.top})`);

  labels.forEach((label, i) => {
    const ly = i * 16;
    legend.append('rect')
      .attr('x', 0).attr('y', ly)
      .attr('width', 10).attr('height', 10)
      .attr('rx', 2)
      .attr('fill', colorMap.get(label) ?? '#ccc');
    legend.append('text')
      .attr('x', 14).attr('y', ly + 9)
      .attr('font-size', '9px').attr('fill', '#555')
      .text(label);
  });
}

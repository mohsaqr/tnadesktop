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
  const cellH = Math.min(1, Math.max(0.3, 60 / cleaned.length));
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
        .attr('width', cellW)
        .attr('height', cellH)
        .attr('fill', colorMap.get(state) ?? '#ccc')
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

/** Compute proportions at each time step (shared by stacked and line distribution). */
function computeProportions(data: SequenceData, labels: string[]) {
  const cleaned = data.map(seq => {
    let last = seq.length - 1;
    while (last >= 0 && seq[last] === null) last--;
    return seq.slice(0, last + 1) as string[];
  });
  const maxLen = Math.max(...cleaned.map(s => s.length));
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
  return { proportions, maxLen };
}

/** Line chart variant of state distribution: one line per state, x=time step, y=proportion. */
export function renderDistributionLines(container: HTMLElement, data: SequenceData, model: TNA) {
  const labels = model.labels;
  const colorMap = new Map<string, string>();
  labels.forEach((l, i) => { colorMap.set(l, NODE_COLORS[i % NODE_COLORS.length]!); });

  const { proportions, maxLen } = computeProportions(data, labels);

  const rect = container.getBoundingClientRect();
  const width = Math.max(rect.width, 500);
  const height = 400;
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

  const xScale = d3.scaleLinear().domain([0, maxLen - 1]).range([0, innerW]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

  // Grid lines
  g.selectAll('.grid-line')
    .data(yScale.ticks(5))
    .enter()
    .append('line')
    .attr('x1', 0).attr('x2', innerW)
    .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
    .attr('stroke', '#eee').attr('stroke-dasharray', '2,2');

  // One line per state
  for (const label of labels) {
    const stateData = proportions.filter(p => p.state === label);
    const color = colorMap.get(label) ?? '#ccc';

    const line = d3.line<typeof stateData[0]>()
      .x(d => xScale(d.step))
      .y(d => yScale(d.proportion));

    g.append('path')
      .datum(stateData)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('opacity', 0.8);

    g.selectAll(null)
      .data(stateData)
      .enter()
      .append('circle')
      .attr('cx', d => xScale(d.step))
      .attr('cy', d => yScale(d.proportion))
      .attr('r', maxLen > 30 ? 2 : 3.5)
      .attr('fill', color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.5)
      .on('mouseover', function (event: MouseEvent, d) {
        d3.select(this).attr('r', maxLen > 30 ? 4 : 5);
        showTooltip(event, `<b>${d.state}</b><br>Step ${d.step + 1}: ${(d.proportion * 100).toFixed(1)}% (${d.count}/${d.total})`);
      })
      .on('mousemove', function (event: MouseEvent) {
        const tt = document.getElementById('tooltip')!;
        tt.style.left = event.clientX + 12 + 'px';
        tt.style.top = event.clientY - 10 + 'px';
      })
      .on('mouseout', function () {
        d3.select(this).attr('r', maxLen > 30 ? 2 : 3.5);
        hideTooltip();
      });
  }

  // Axes
  g.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(xScale).ticks(Math.min(maxLen, 12)).tickFormat(d => `${+d + 1}`).tickSize(3))
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

/** Combined multi-group distribution: small multiples grid of stacked bar charts with shared legend. */
export function renderCombinedDistribution(
  container: HTMLElement,
  groups: { name: string; data: SequenceData; model: TNA; color: string }[],
) {
  d3.select(container).selectAll('*').remove();

  const labels = groups[0]?.model.labels ?? [];
  const colorMap = new Map<string, string>();
  labels.forEach((l, i) => { colorMap.set(l, NODE_COLORS[i % NODE_COLORS.length]!); });

  // Compute global maxLen for consistent x-axis
  let globalMaxLen = 0;
  const groupProps: { maxLen: number; proportions: { step: number; state: string; proportion: number; count: number; total: number }[] }[] = [];
  for (const grp of groups) {
    const { proportions, maxLen } = computeProportions(grp.data, labels);
    groupProps.push({ proportions, maxLen });
    if (maxLen > globalMaxLen) globalMaxLen = maxLen;
  }

  const rect = container.getBoundingClientRect();
  const totalWidth = Math.max(rect.width, 500);
  const cols = Math.min(groups.length, 2);
  const panelW = Math.floor(totalWidth / cols) - 12;
  const panelH = 340;
  const margin = { top: 24, right: 20, bottom: 30, left: 50 };
  const innerW = panelW - margin.left - margin.right;
  const innerH = panelH - margin.top - margin.bottom;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px`;
  container.appendChild(wrapper);

  for (let gi = 0; gi < groups.length; gi++) {
    const grp = groups[gi]!;
    const { proportions } = groupProps[gi]!;

    const panelDiv = document.createElement('div');
    wrapper.appendChild(panelDiv);

    const svg = d3.select(panelDiv)
      .append('svg')
      .attr('width', panelW)
      .attr('height', panelH);

    // Group label
    svg.append('text')
      .attr('x', margin.left + innerW / 2).attr('y', 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px').attr('font-weight', '600')
      .attr('fill', grp.color)
      .text(grp.name);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleBand()
      .domain(Array.from({ length: globalMaxLen }, (_, i) => `${i}`))
      .range([0, innerW])
      .padding(0.05);

    const yScale = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);

    // Stacked bars
    for (let t = 0; t < globalMaxLen; t++) {
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
              `<b>${label}</b><br>${grp.name} — Step ${t + 1}: ${(p * 100).toFixed(1)}% (${entry?.count}/${entry?.total})`);
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
    const tickVals = Array.from({ length: globalMaxLen }, (_, i) => `${i}`)
      .filter((_, i) => i % Math.max(1, Math.floor(globalMaxLen / 8)) === 0);

    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).tickValues(tickVals).tickSize(3))
      .selectAll('text').attr('font-size', '9px');

    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format('.0%')).tickSize(3))
      .selectAll('text').attr('font-size', '9px');

    // Y-axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2).attr('y', -36)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px').attr('fill', '#666')
      .text('Proportion');
  }

  // Shared legend below all panels
  const legendDiv = document.createElement('div');
  legendDiv.style.cssText = 'display:flex;align-items:center;gap:16px;justify-content:center;margin-top:8px;flex-wrap:wrap';
  labels.forEach((label) => {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:4px';
    item.innerHTML = `<div style="width:10px;height:10px;border-radius:2px;background:${colorMap.get(label) ?? '#ccc'}"></div><span style="font-size:10px;color:#555">${label}</span>`;
    legendDiv.appendChild(item);
  });
  container.appendChild(legendDiv);
}

/** Combined multi-group sequence index: small multiples grid with shared legend. */
export function renderCombinedSequences(
  container: HTMLElement,
  groups: { name: string; data: SequenceData; model: TNA; color: string }[],
) {
  d3.select(container).selectAll('*').remove();

  const labels = groups[0]?.model.labels ?? [];
  const colorMap = new Map<string, string>();
  labels.forEach((l, i) => { colorMap.set(l, NODE_COLORS[i % NODE_COLORS.length]!); });

  const rect = container.getBoundingClientRect();
  const totalWidth = Math.max(rect.width, 500);
  const cols = Math.min(groups.length, 2);
  const panelW = Math.floor(totalWidth / cols) - 12;
  const margin = { top: 24, right: 20, bottom: 30, left: 50 };
  const innerW = panelW - margin.left - margin.right;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px`;
  container.appendChild(wrapper);

  // Compute global maxLen for consistent x-axis
  let globalMaxLen = 0;
  for (const grp of groups) {
    const cleaned = grp.data.map(seq => {
      let last = seq.length - 1;
      while (last >= 0 && seq[last] === null) last--;
      return seq.slice(0, last + 1) as string[];
    });
    const ml = Math.max(...cleaned.map(s => s.length));
    if (ml > globalMaxLen) globalMaxLen = ml;
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const grp = groups[gi]!;
    const cleaned = grp.data.map(seq => {
      let last = seq.length - 1;
      while (last >= 0 && seq[last] === null) last--;
      return seq.slice(0, last + 1) as string[];
    });
    const maxLen = Math.max(...cleaned.map(s => s.length));

    const cellH = Math.min(1, Math.max(0.3, 60 / cleaned.length));
    const innerH = cleaned.length * cellH;
    const panelH = innerH + margin.top + margin.bottom;
    const cellW = innerW / globalMaxLen;

    const panelDiv = document.createElement('div');
    wrapper.appendChild(panelDiv);

    const svg = d3.select(panelDiv)
      .append('svg')
      .attr('width', panelW)
      .attr('height', panelH);

    // Group label
    svg.append('text')
      .attr('x', margin.left + innerW / 2).attr('y', 14)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px').attr('font-weight', '600')
      .attr('fill', grp.color)
      .text(grp.name);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    cleaned.forEach((seq, row) => {
      seq.forEach((st, col) => {
        g.append('rect')
          .attr('x', col * cellW)
          .attr('y', row * cellH)
          .attr('width', cellW)
          .attr('height', cellH)
          .attr('fill', colorMap.get(st) ?? '#ccc')
          .on('mouseover', function (event: MouseEvent) {
            d3.select(this).attr('stroke', '#333').attr('stroke-width', 1.5);
            showTooltip(event, `<b>${st}</b><br>${grp.name} — Seq ${row + 1}, Step ${col + 1}`);
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

    // X axis
    const xScale = d3.scaleLinear().domain([0, globalMaxLen]).range([0, innerW]);
    g.append('g')
      .attr('class', 'axis')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(globalMaxLen, 8)).tickSize(3))
      .selectAll('text').attr('font-size', '9px');

    // Y axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2).attr('y', -36)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px').attr('fill', '#666')
      .text('Sequence');
  }

  // Shared legend below all panels
  const legendDiv = document.createElement('div');
  legendDiv.style.cssText = 'display:flex;align-items:center;gap:16px;justify-content:center;margin-top:8px;flex-wrap:wrap';
  labels.forEach((label) => {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:4px';
    item.innerHTML = `<div style="width:10px;height:10px;border-radius:2px;background:${colorMap.get(label) ?? '#ccc'}"></div><span style="font-size:10px;color:#555">${label}</span>`;
    legendDiv.appendChild(item);
  });
  container.appendChild(legendDiv);
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
  const height = 585;
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

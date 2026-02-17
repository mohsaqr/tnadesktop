/**
 * Mosaic plot (state associations with standardized residuals).
 */
import * as d3 from 'd3';
import type { TNA } from 'tnaj';
import { showTooltip, hideTooltip } from '../main';

function computeStdRes(tab: number[][]): number[][] {
  const n = tab.length;
  let N = 0;
  const rowSums = new Array(n).fill(0) as number[];
  const colSums = new Array(n).fill(0) as number[];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = tab[i]![j]!;
      rowSums[i] += v;
      colSums[j] += v;
      N += v;
    }
  }
  if (N === 0) return tab.map(r => r.map(() => 0));

  const res: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      const expected = (rowSums[i]! * colSums[j]!) / N;
      const denom = Math.sqrt(
        expected * (1 - rowSums[i]! / N) * (1 - colSums[j]! / N),
      );
      row.push(denom > 1e-12 ? (tab[i]![j]! - expected) / denom : 0);
    }
    res.push(row);
  }
  return res;
}

export function renderMosaic(container: HTMLElement, model: TNA) {
  const labels = model.labels;
  const n = labels.length;
  const weights = model.weights;

  const tab: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      row.push(Math.max(0, weights.get(j, i)));
    }
    tab.push(row);
  }

  const residuals = computeStdRes(tab);

  const rect = container.getBoundingClientRect();
  const size = Math.min(Math.max(rect.width, 300), 450);
  const margin = { top: 10, right: 10, bottom: 50, left: 55 };
  const innerW = size - margin.left - margin.right;
  const innerH = size - margin.top - margin.bottom;

  const rowTotals = tab.map(r => r.reduce((a, b) => a + b, 0));
  const totalSum = rowTotals.reduce((a, b) => a + b, 0);
  const tileWidths = rowTotals.map(r => totalSum > 0 ? r / totalSum : 0);

  const colorScale = d3.scaleDiverging(d3.interpolateRdBu).domain([4, 0, -4]);

  d3.select(container).selectAll('*').remove();

  const svg = d3.select(container)
    .append('svg')
    .attr('width', size)
    .attr('height', size);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  let xStart = 0;
  for (let i = 0; i < n; i++) {
    const w = tileWidths[i]! * innerW;
    if (w < 0.5) { xStart += w; continue; }

    const rowSum = rowTotals[i]!;
    const colProps = rowSum > 0 ? tab[i]!.map(v => v / rowSum) : new Array(n).fill(0);

    let yStart = 0;
    for (let j = 0; j < n; j++) {
      const h = (colProps[j] ?? 0) * innerH;
      if (h < 0.5) { yStart += h; continue; }

      const stdres = residuals[i]![j]!;
      const val = tab[i]![j]!;

      g.append('rect')
        .attr('x', xStart + 0.5)
        .attr('y', yStart + 0.5)
        .attr('width', Math.max(0, w - 1))
        .attr('height', Math.max(0, h - 1))
        .attr('fill', colorScale(stdres))
        .attr('stroke', '#333')
        .attr('stroke-width', 0.5)
        .on('mouseover', function (event: MouseEvent) {
          d3.select(this).attr('stroke-width', 2);
          showTooltip(event,
            `<b>${labels[i]} → ${labels[j]}</b><br>` +
            `Weight: ${Number.isInteger(val) ? val : val.toFixed(4)}<br>Residual: ${stdres.toFixed(2)}`);
        })
        .on('mousemove', function (event: MouseEvent) {
          const tt = document.getElementById('tooltip')!;
          tt.style.left = event.clientX + 12 + 'px';
          tt.style.top = event.clientY - 10 + 'px';
        })
        .on('mouseout', function () {
          d3.select(this).attr('stroke-width', 0.5);
          hideTooltip();
        });

      if (w > 25 && h > 14) {
        g.append('text')
          .attr('x', xStart + w / 2)
          .attr('y', yStart + h / 2)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('font-size', '8px')
          .attr('fill', Math.abs(stdres) > 2.5 ? '#fff' : '#333')
          .attr('pointer-events', 'none')
          .text(Number.isInteger(val) ? val : val.toFixed(2));
      }

      yStart += h;
    }
    xStart += w;
  }

  // X-axis labels
  xStart = 0;
  for (let i = 0; i < n; i++) {
    const w = tileWidths[i]! * innerW;
    if (w > 5) {
      g.append('text')
        .attr('x', xStart + w / 2)
        .attr('y', innerH + 12)
        .attr('text-anchor', 'end')
        .attr('font-size', '9px')
        .attr('fill', '#555')
        .attr('transform', `rotate(-40, ${xStart + w / 2}, ${innerH + 12})`)
        .text(labels[i]!);
    }
    xStart += w;
  }

  // Y-axis labels
  const firstNonZero = tileWidths.findIndex(w => w > 0.01);
  if (firstNonZero >= 0) {
    const rowSum = rowTotals[firstNonZero]!;
    const colProps = rowSum > 0 ? tab[firstNonZero]!.map(v => v / rowSum) : [];
    let yPos = 0;
    for (let j = 0; j < n; j++) {
      const h = (colProps[j] ?? 0) * innerH;
      if (h > 10) {
        g.append('text')
          .attr('x', -6)
          .attr('y', yPos + h / 2)
          .attr('text-anchor', 'end')
          .attr('dy', '0.35em')
          .attr('font-size', '9px')
          .attr('fill', '#555')
          .text(labels[j]!);
      }
      yPos += h;
    }
  }

  g.append('text')
    .attr('x', innerW / 2).attr('y', innerH + 42)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px').attr('fill', '#666')
    .text('Incoming edges');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerH / 2).attr('y', -42)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px').attr('fill', '#666')
    .text('Outgoing edges');
}

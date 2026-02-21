/**
 * Mosaic plot (state associations with standardized residuals).
 */
import * as d3 from 'd3';
import type { TNA } from 'tnaj';
import { showTooltip, hideTooltip } from '../main';
import { gammaP } from '../analysis/stats-utils';

/* ──────────────────────────────────────────────────────────
 * Chi-square test helpers
 * ────────────────────────────────────────────────────────── */

export interface ChiSqResult { chiSq: number; df: number; pValue: number; stdRes: number[][] }

/** Pearson chi-square test on a contingency table (rows × cols). */
export function chiSquareTest(tab: number[][]): ChiSqResult {
  const nR = tab.length, nC = tab[0]!.length;
  const rS = new Array(nR).fill(0) as number[];
  const cS = new Array(nC).fill(0) as number[];
  let N = 0;
  for (let i = 0; i < nR; i++) for (let j = 0; j < nC; j++) {
    const v = tab[i]![j]!; rS[i] += v; cS[j] += v; N += v;
  }
  if (N === 0) return { chiSq: 0, df: 0, pValue: 1, stdRes: tab.map(r => r.map(() => 0)) };
  let chiSq = 0;
  const stdRes: number[][] = [];
  for (let i = 0; i < nR; i++) {
    const row: number[] = [];
    for (let j = 0; j < nC; j++) {
      const exp = (rS[i]! * cS[j]!) / N;
      if (exp > 0) chiSq += (tab[i]![j]! - exp) ** 2 / exp;
      const den = Math.sqrt(exp * (1 - rS[i]! / N) * (1 - cS[j]! / N));
      row.push(den > 1e-12 ? (tab[i]![j]! - exp) / den : 0);
    }
    stdRes.push(row);
  }
  const df = (nR - 1) * (nC - 1);
  const pValue = df > 0 ? 1 - gammaP(df / 2, chiSq / 2) : 1;
  return { chiSq, df, pValue, stdRes };
}

function toSubscript(n: number): string {
  const sub = '₀₁₂₃₄₅₆₇₈₉';
  return String(n).split('').map(d => sub[parseInt(d)]!).join('');
}

function formatP(p: number): string {
  if (p < 2.2e-16) return '<2e-16';
  if (p < 0.001) return p.toExponential(1);
  return p.toFixed(4);
}

const RES_BINS = [
  { lo: 4,    hi: Infinity, color: '#2166AC', label: '>4',    dash: false },
  { lo: 2,    hi: 4,        color: '#4393C3', label: '2:4',   dash: false },
  { lo: 0,    hi: 2,        color: '#D1E5F0', label: '0:2',   dash: false },
  { lo: -2,   hi: 0,        color: '#FDDBC7', label: '-2:0',  dash: true  },
  { lo: -4,   hi: -2,       color: '#D6604D', label: '-4:-2', dash: true  },
  { lo: -Infinity, hi: -4,  color: '#B2182B', label: '<-4',   dash: true  },
];

function residualColor(r: number): string {
  for (const b of RES_BINS) if (r >= b.lo) return b.color;
  return RES_BINS[RES_BINS.length - 1]!.color;
}

/* ──────────────────────────────────────────────────────────
 * Cluster / group mosaic: State frequency × Group
 * ────────────────────────────────────────────────────────── */

export function renderClusterMosaic(
  container: HTMLElement,
  models: Map<string, TNA>,
  sourceLabel = 'Cluster',
) {
  const firstModel = [...models.values()][0]!;
  const stateLabels = firstModel.labels;
  const groupNames = [...models.keys()];
  const nS = stateLabels.length;
  const nG = groupNames.length;
  if (nG < 2) return;

  // Build contingency table: rows=states, cols=groups
  const tab: number[][] = [];
  for (let s = 0; s < nS; s++) tab.push(new Array(nG).fill(0) as number[]);

  for (let c = 0; c < nG; c++) {
    const model = models.get(groupNames[c]!)!;
    if (!model.data) continue;
    for (const seq of model.data) {
      for (const val of seq) {
        if (val == null) continue;
        const idx = stateLabels.indexOf(val as string);
        if (idx >= 0) tab[idx]![c]!++;
      }
    }
  }

  const { chiSq, df, pValue, stdRes } = chiSquareTest(tab);

  // Totals
  const colTot = new Array(nG).fill(0) as number[];
  let grand = 0;
  for (let s = 0; s < nS; s++) for (let c = 0; c < nG; c++) {
    colTot[c] += tab[s]![c]!; grand += tab[s]![c]!;
  }
  if (grand === 0) return;

  // Dimensions
  const margin = { top: 90, right: 130, bottom: 15, left: 120 };
  const innerW = Math.max(220, 90 * nG);
  const innerH = Math.max(180, 38 * nS);
  const width = innerW + margin.left + margin.right;
  const height = innerH + margin.top + margin.bottom;

  d3.select(container).selectAll('*').remove();

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  // Title
  svg.append('text')
    .attr('x', margin.left + innerW / 2)
    .attr('y', 18)
    .attr('text-anchor', 'middle')
    .attr('font-size', '13px')
    .attr('font-weight', '600')
    .attr('fill', '#333')
    .text(`State frequency by ${sourceLabel}   \u03C7\u00B2${toSubscript(df)} = ${chiSq.toFixed(1)}, p = ${formatP(pValue)}`);

  // "Cluster" subtitle
  svg.append('text')
    .attr('x', margin.left + innerW / 2)
    .attr('y', 36)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('fill', '#666')
    .text(sourceLabel);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Bounding box
  g.append('rect')
    .attr('x', 0).attr('y', 0)
    .attr('width', innerW).attr('height', innerH)
    .attr('fill', 'none').attr('stroke', '#999').attr('stroke-width', 0.5);

  // Draw mosaic cells
  let xOff = 0;
  for (let c = 0; c < nG; c++) {
    const colW = (colTot[c]! / grand) * innerW;
    if (colW < 2) { xOff += colW; continue; }

    let yOff = 0;
    for (let s = 0; s < nS; s++) {
      const cellH = colTot[c]! > 0 ? (tab[s]![c]! / colTot[c]!) * innerH : 0;
      if (cellH < 0.5) { yOff += cellH; continue; }

      const res = stdRes[s]![c]!;
      const strong = Math.abs(res) > 2;

      g.append('rect')
        .attr('x', xOff + 0.5)
        .attr('y', yOff + 0.5)
        .attr('width', Math.max(0, colW - 1))
        .attr('height', Math.max(0, cellH - 1))
        .attr('fill', residualColor(res))
        .attr('stroke', '#333')
        .attr('stroke-width', strong ? 2 : 0.5)
        .attr('stroke-dasharray', res < 0 ? '4,3' : 'none')
        .on('mouseover', function (event: MouseEvent) {
          d3.select(this).attr('stroke-width', 3);
          showTooltip(event,
            `<b>${stateLabels[s]} \u00D7 ${groupNames[c]}</b><br>` +
            `Count: ${tab[s]![c]}<br>Residual: ${res.toFixed(2)}`);
        })
        .on('mousemove', function (event: MouseEvent) {
          const tt = document.getElementById('tooltip')!;
          tt.style.left = event.clientX + 12 + 'px';
          tt.style.top = event.clientY - 10 + 'px';
        })
        .on('mouseout', function () {
          d3.select(this).attr('stroke-width', strong ? 2 : 0.5);
          hideTooltip();
        });

      // Count label inside cell
      if (colW > 30 && cellH > 16) {
        g.append('text')
          .attr('x', xOff + colW / 2)
          .attr('y', yOff + cellH / 2)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('font-size', '9px')
          .attr('fill', Math.abs(res) > 2.5 ? '#fff' : '#333')
          .attr('pointer-events', 'none')
          .text(tab[s]![c]!);
      }

      yOff += cellH;
    }

    // Column label at top (rotated)
    g.append('text')
      .attr('x', xOff + colW / 2)
      .attr('y', -6)
      .attr('text-anchor', 'start')
      .attr('font-size', '10px')
      .attr('fill', '#555')
      .attr('transform', `rotate(-40, ${xOff + colW / 2}, ${-6})`)
      .text(groupNames[c]!);

    xOff += colW;
  }

  // Y-axis state labels (using first column's cell positions)
  const refCol = colTot.findIndex(t => t > 0);
  if (refCol >= 0) {
    let yLabel = 0;
    for (let s = 0; s < nS; s++) {
      const cellH = (tab[s]![refCol]! / colTot[refCol]!) * innerH;
      if (cellH > 10) {
        g.append('text')
          .attr('x', -8)
          .attr('y', yLabel + cellH / 2)
          .attr('text-anchor', 'end')
          .attr('dy', '0.35em')
          .attr('font-size', '10px')
          .attr('fill', '#333')
          .text(stateLabels[s]!);
      }
      yLabel += cellH;
    }
  }

  // "State" axis label
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(margin.top + innerH / 2))
    .attr('y', 15)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .attr('fill', '#666')
    .text('State');

  // Legend
  const lx = margin.left + innerW + 12;
  const ly = margin.top;
  const lg = svg.append('g').attr('transform', `translate(${lx},${ly})`);

  lg.append('text').attr('y', 0).attr('font-size', '10px')
    .attr('font-weight', '600').attr('fill', '#333').text('Standardized');
  lg.append('text').attr('y', 13).attr('font-size', '10px')
    .attr('font-weight', '600').attr('fill', '#333').text('residual');

  const boxSz = 16, spacing = 22, startY = 28;
  for (let i = 0; i < RES_BINS.length; i++) {
    const b = RES_BINS[i]!;
    lg.append('rect')
      .attr('x', 0).attr('y', startY + i * spacing)
      .attr('width', boxSz).attr('height', boxSz)
      .attr('fill', b.color)
      .attr('stroke', '#333').attr('stroke-width', 1)
      .attr('stroke-dasharray', b.dash ? '3,2' : 'none');
    lg.append('text')
      .attr('x', boxSz + 6).attr('y', startY + i * spacing + boxSz / 2)
      .attr('dy', '0.35em').attr('font-size', '10px').attr('fill', '#555')
      .text(b.label);
  }
}

/* ──────────────────────────────────────────────────────────
 * Original transition mosaic
 * ────────────────────────────────────────────────────────── */

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

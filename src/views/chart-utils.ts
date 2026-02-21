/**
 * Shared D3 chart primitives: donut, radar, box plot, forest plot.
 */
import * as d3 from 'd3';
import { showTooltip, hideTooltip } from '../main';

// ─── Density Plot (KDE) ───

export interface DensityGroup {
  label: string;
  values: number[];
  color: string;
}

export interface DensityOpts {
  width?: number;
  height?: number;
  nPoints?: number;
}

/** Gaussian kernel density estimator with Silverman bandwidth. */
function gaussianKDE(values: number[], nPoints: number, xMin: number, xMax: number): { x: number; y: number }[] {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1 || 1));
  const h = 1.06 * (sd || 1) * Math.pow(n, -0.2); // Silverman's rule

  const step = (xMax - xMin) / (nPoints - 1);
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < nPoints; i++) {
    const xi = xMin + i * step;
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const z = (xi - values[j]!) / h;
      sum += Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    }
    result.push({ x: xi, y: sum / (n * h) });
  }
  return result;
}

/**
 * Render overlaid density (KDE) curves for multiple groups.
 * Groups with < 2 values are skipped.
 */
export function renderDensityPlot(
  container: HTMLElement,
  groups: DensityGroup[],
  opts: DensityOpts = {},
): void {
  const width = opts.width ?? (container.getBoundingClientRect().width || 400);
  const height = opts.height ?? 180;
  const nPoints = opts.nPoints ?? 200;
  const margin = { top: 10, right: 16, bottom: 30, left: 50 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  d3.select(container).selectAll('*').remove();

  // Filter to plottable groups
  const valid = groups.filter(g => g.values.length >= 2);
  if (valid.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:20px;font-size:12px">Not enough data (need \u22652 values per group)</div>';
    return;
  }

  // Shared x-domain across all groups
  const allVals = valid.flatMap(g => g.values);
  const xExt = d3.extent(allVals) as [number, number];
  const pad = (xExt[1] - xExt[0]) * 0.1 || 0.1;
  const xMin = xExt[0] - pad;
  const xMax = xExt[1] + pad;

  // Compute KDE for each group
  const kdeData = valid.map(g => ({
    ...g,
    kde: gaussianKDE(g.values, nPoints, xMin, xMax),
  }));

  const yMax = d3.max(kdeData, d => d3.max(d.kde, p => p.y)) ?? 1;

  const x = d3.scaleLinear().domain([xMin, xMax]).range([0, innerW]);
  const y = d3.scaleLinear().domain([0, yMax * 1.05]).range([innerH, 0]);

  const svg = d3.select(container).append('svg')
    .attr('width', width).attr('height', height);
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const line = d3.line<{ x: number; y: number }>()
    .x(d => x(d.x))
    .y(d => y(d.y))
    .curve(d3.curveBasis);

  const area = d3.area<{ x: number; y: number }>()
    .x(d => x(d.x))
    .y0(innerH)
    .y1(d => y(d.y))
    .curve(d3.curveBasis);

  for (const gd of kdeData) {
    // Fill
    g.append('path')
      .datum(gd.kde)
      .attr('d', area as any)
      .attr('fill', gd.color)
      .attr('fill-opacity', 0.15);
    // Stroke
    g.append('path')
      .datum(gd.kde)
      .attr('d', line as any)
      .attr('fill', 'none')
      .attr('stroke', gd.color)
      .attr('stroke-width', 2);
  }

  // Axes
  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(5))
    .selectAll('text').attr('font-size', '9px');
  g.append('g')
    .call(d3.axisLeft(y).ticks(4))
    .selectAll('text').attr('font-size', '9px');

  // Legend (top-right)
  const legend = g.append('g')
    .attr('transform', `translate(${innerW - 10}, 4)`);
  kdeData.forEach((gd, i) => {
    const item = legend.append('g').attr('transform', `translate(0,${i * 14})`);
    item.append('line').attr('x1', -30).attr('x2', -14)
      .attr('y1', 0).attr('y2', 0)
      .attr('stroke', gd.color).attr('stroke-width', 2);
    item.append('text').attr('x', -10).attr('y', 3)
      .attr('text-anchor', 'start')
      .attr('font-size', '9px').attr('fill', '#555')
      .text(gd.label);
  });
}

// ─── Donut / Pie Chart ───

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

export interface DonutOpts {
  width?: number;
  height?: number;
  innerRadiusRatio?: number;  // 0 = pie, 0.6 = donut (default)
  showLabels?: boolean;
}

export function renderDonut(
  container: HTMLElement,
  data: DonutDatum[],
  opts: DonutOpts = {},
): void {
  const width = opts.width ?? (container.getBoundingClientRect().width || 320);
  const height = opts.height ?? 300;
  const innerRatio = opts.innerRadiusRatio ?? 0.6;
  const showLabels = opts.showLabels ?? true;

  d3.select(container).selectAll('*').remove();

  const total = d3.sum(data, d => d.value);
  if (total === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:20px">No data</div>';
    return;
  }

  const legendW = showLabels ? 140 : 0;
  const chartW = width - legendW;
  const radius = Math.min(chartW, height) / 2 - 10;
  const innerRadius = radius * innerRatio;

  const svg = d3.select(container).append('svg')
    .attr('width', width).attr('height', height);

  const g = svg.append('g')
    .attr('transform', `translate(${chartW / 2},${height / 2})`);

  const pie = d3.pie<DonutDatum>().value(d => d.value).sort(null);
  const arc = d3.arc<d3.PieArcDatum<DonutDatum>>()
    .innerRadius(innerRadius).outerRadius(radius);

  const arcs = g.selectAll('.arc')
    .data(pie(data))
    .enter().append('g').attr('class', 'arc');

  arcs.append('path')
    .attr('d', arc)
    .attr('fill', d => d.data.color)
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .style('cursor', 'pointer')
    .on('mousemove', (event: MouseEvent, d) => {
      const pct = ((d.data.value / total) * 100).toFixed(1);
      showTooltip(event, `<strong>${d.data.label}</strong><br>${d.data.value} (${pct}%)`);
    })
    .on('mouseleave', () => hideTooltip());

  // Center total label
  if (innerRatio > 0) {
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .attr('font-size', '22px')
      .attr('font-weight', '700')
      .attr('fill', '#333')
      .text(String(total));
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.2em')
      .attr('font-size', '10px')
      .attr('fill', '#888')
      .text('total');
  }

  // Legend
  if (showLabels) {
    const legend = svg.append('g')
      .attr('transform', `translate(${chartW + 8}, ${Math.max(10, height / 2 - data.length * 10)})`);

    data.forEach((d, i) => {
      const row = legend.append('g').attr('transform', `translate(0,${i * 20})`);
      row.append('rect').attr('width', 10).attr('height', 10)
        .attr('rx', 2).attr('fill', d.color);
      const pct = ((d.value / total) * 100).toFixed(1);
      row.append('text').attr('x', 14).attr('y', 9)
        .attr('font-size', '10px').attr('fill', '#555')
        .text(`${d.label} (${pct}%)`);
    });
  }
}

// ─── Radar / Spider Chart ───

export interface RadarDataset {
  label: string;
  values: number[];
  color: string;
}

export interface RadarOpts {
  width?: number;
  height?: number;
  maxValue?: number;
  levels?: number;
}

export function renderRadar(
  container: HTMLElement,
  datasets: RadarDataset[],
  axes: string[],
  opts: RadarOpts = {},
): void {
  const width = opts.width ?? (container.getBoundingClientRect().width || 400);
  const height = opts.height ?? 340;
  const levels = opts.levels ?? 5;

  d3.select(container).selectAll('*').remove();

  const nAxes = axes.length;
  if (nAxes < 3 || datasets.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:20px">Not enough data for radar chart</div>';
    return;
  }

  const maxVal = opts.maxValue ?? Math.max(
    ...datasets.flatMap(ds => ds.values),
    0.001,
  );

  const legendH = Math.ceil(datasets.length / 3) * 18 + 8;
  const chartH = height - legendH;
  const radius = Math.min(width, chartH) / 2 - 40;
  const cx = width / 2;
  const cy = chartH / 2 + 10;

  const svg = d3.select(container).append('svg')
    .attr('width', width).attr('height', height);

  const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

  const angleSlice = (2 * Math.PI) / nAxes;

  // Grid circles
  for (let lv = 1; lv <= levels; lv++) {
    const r = (radius / levels) * lv;
    g.append('circle')
      .attr('r', r)
      .attr('fill', 'none')
      .attr('stroke', '#ddd')
      .attr('stroke-dasharray', '2,2');
    // Level labels
    g.append('text')
      .attr('x', 4).attr('y', -r)
      .attr('font-size', '8px').attr('fill', '#aaa')
      .text(((maxVal / levels) * lv).toFixed(2));
  }

  // Axis lines + labels
  for (let i = 0; i < nAxes; i++) {
    const angle = angleSlice * i - Math.PI / 2;
    const x2 = radius * Math.cos(angle);
    const y2 = radius * Math.sin(angle);
    g.append('line')
      .attr('x1', 0).attr('y1', 0)
      .attr('x2', x2).attr('y2', y2)
      .attr('stroke', '#ccc');

    const labelR = radius + 16;
    const lx = labelR * Math.cos(angle);
    const ly = labelR * Math.sin(angle);
    const anchor = Math.abs(lx) < 5 ? 'middle' : lx > 0 ? 'start' : 'end';
    g.append('text')
      .attr('x', lx).attr('y', ly)
      .attr('text-anchor', anchor)
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '10px').attr('fill', '#555')
      .attr('class', 'radar-axis-label')
      .text(axes[i]!);
  }

  // Polygons
  const line = d3.lineRadial<number>()
    .radius(d => (d / maxVal) * radius)
    .angle((_, i) => i * angleSlice)
    .curve(d3.curveLinearClosed);

  for (const ds of datasets) {
    const vals = ds.values.map(v => Math.max(0, Math.min(v, maxVal)));
    g.append('path')
      .datum(vals)
      .attr('d', line as any)
      .attr('fill', ds.color)
      .attr('fill-opacity', 0.15)
      .attr('stroke', ds.color)
      .attr('stroke-width', 2);

    // Dots
    for (let i = 0; i < nAxes; i++) {
      const angle = angleSlice * i - Math.PI / 2;
      const r = (vals[i]! / maxVal) * radius;
      const dx = r * Math.cos(angle);
      const dy = r * Math.sin(angle);
      g.append('circle')
        .attr('cx', dx).attr('cy', dy).attr('r', 3.5)
        .attr('fill', ds.color).attr('stroke', '#fff').attr('stroke-width', 1)
        .style('cursor', 'pointer')
        .on('mousemove', (event: MouseEvent) => {
          showTooltip(event, `<strong>${ds.label}</strong><br>${axes[i]}: ${ds.values[i]!.toFixed(3)}`);
        })
        .on('mouseleave', () => hideTooltip());
    }
  }

  // Legend
  const legend = svg.append('g')
    .attr('transform', `translate(${width / 2},${chartH + 4})`);

  const perRow = 3;
  datasets.forEach((ds, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const spacing = Math.min(width / perRow, 160);
    const xOff = (col - (Math.min(datasets.length, perRow) - 1) / 2) * spacing;
    const yOff = row * 18;
    const item = legend.append('g').attr('transform', `translate(${xOff},${yOff})`);
    item.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', ds.color);
    item.append('text').attr('x', 14).attr('y', 9)
      .attr('font-size', '10px').attr('fill', '#555').text(ds.label);
  });
}

// ─── Box Plot ───

export interface BoxPlotGroup {
  label: string;
  values: number[];
  color: string;
}

export interface BoxPlotOpts {
  width?: number;
  height?: number;
  metricLabel?: string;
}

export function renderBoxPlots(
  container: HTMLElement,
  groups: BoxPlotGroup[],
  opts: BoxPlotOpts = {},
): void {
  const width = opts.width ?? (container.getBoundingClientRect().width || 400);
  const barH = 28;
  const height = opts.height ?? Math.max(120, groups.length * (barH + 16) + 60);
  const margin = { top: 10, right: 30, bottom: 32, left: 100 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  d3.select(container).selectAll('*').remove();

  const allVals = groups.flatMap(g => g.values);
  if (allVals.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:20px">No data</div>';
    return;
  }

  const svg = d3.select(container).append('svg')
    .attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const xExtent = d3.extent(allVals) as [number, number];
  const pad = (xExtent[1] - xExtent[0]) * 0.1 || 0.1;
  const x = d3.scaleLinear()
    .domain([xExtent[0] - pad, xExtent[1] + pad])
    .range([0, innerW]).nice();

  const y = d3.scaleBand()
    .domain(groups.map(gr => gr.label))
    .range([0, innerH])
    .padding(0.3);

  // Grid
  g.selectAll('.grid')
    .data(x.ticks(5))
    .enter().append('line')
    .attr('x1', d => x(d)).attr('x2', d => x(d))
    .attr('y1', 0).attr('y2', innerH)
    .attr('stroke', '#eee').attr('stroke-dasharray', '2,2');

  for (const gr of groups) {
    const sorted = [...gr.values].sort(d3.ascending);
    const q1 = d3.quantile(sorted, 0.25)!;
    const median = d3.quantile(sorted, 0.5)!;
    const q3 = d3.quantile(sorted, 0.75)!;
    const iqr = q3 - q1;
    const whiskerLow = Math.max(d3.min(sorted)!, q1 - 1.5 * iqr);
    const whiskerHigh = Math.min(d3.max(sorted)!, q3 + 1.5 * iqr);
    const outliers = sorted.filter(v => v < whiskerLow || v > whiskerHigh);

    const cy = (y(gr.label) ?? 0) + y.bandwidth() / 2;
    const bh = y.bandwidth() * 0.7;

    // Whisker line
    g.append('line')
      .attr('x1', x(whiskerLow)).attr('x2', x(whiskerHigh))
      .attr('y1', cy).attr('y2', cy)
      .attr('stroke', gr.color).attr('stroke-width', 1.5);

    // Whisker caps
    for (const wv of [whiskerLow, whiskerHigh]) {
      g.append('line')
        .attr('x1', x(wv)).attr('x2', x(wv))
        .attr('y1', cy - bh / 3).attr('y2', cy + bh / 3)
        .attr('stroke', gr.color).attr('stroke-width', 1.5);
    }

    // Box
    g.append('rect')
      .attr('x', x(q1)).attr('width', Math.max(0, x(q3) - x(q1)))
      .attr('y', cy - bh / 2).attr('height', bh)
      .attr('fill', gr.color).attr('fill-opacity', 0.25)
      .attr('stroke', gr.color).attr('stroke-width', 1.5)
      .attr('rx', 2)
      .style('cursor', 'pointer')
      .on('mousemove', (event: MouseEvent) => {
        showTooltip(event, `<strong>${gr.label}</strong><br>Median: ${median.toFixed(3)}<br>Q1: ${q1.toFixed(3)}<br>Q3: ${q3.toFixed(3)}<br>N: ${gr.values.length}`);
      })
      .on('mouseleave', () => hideTooltip());

    // Median line
    g.append('line')
      .attr('x1', x(median)).attr('x2', x(median))
      .attr('y1', cy - bh / 2).attr('y2', cy + bh / 2)
      .attr('stroke', gr.color).attr('stroke-width', 2.5);

    // Outliers
    for (const ov of outliers) {
      g.append('circle')
        .attr('cx', x(ov)).attr('cy', cy)
        .attr('r', 3).attr('fill', 'none')
        .attr('stroke', gr.color).attr('stroke-width', 1);
    }
  }

  // Axes
  g.append('g')
    .call(d3.axisLeft(y).tickSize(0).tickPadding(6))
    .selectAll('text').attr('font-size', '10px');
  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(5))
    .selectAll('text').attr('font-size', '9px');

  if (opts.metricLabel) {
    svg.append('text')
      .attr('x', margin.left + innerW / 2).attr('y', height - 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px').attr('fill', '#888')
      .text(opts.metricLabel);
  }
}

// ─── Forest Plot ───

export interface ForestRow {
  label: string;
  estimate: number;
  ciLower: number;
  ciUpper: number;
  significant: boolean;
  color?: string;
  /** Original observed edge weight — shown as a small diamond marker. */
  originalWeight?: number;
  /** Group name (used by grouped forest plot). */
  group?: string;
}

export interface ForestOpts {
  width?: number;
  height?: number;
  xLabel?: string;
}

export function renderForestPlot(
  container: HTMLElement,
  rows: ForestRow[],
  opts: ForestOpts = {},
): void {
  const width = opts.width ?? (container.getBoundingClientRect().width || 500);
  const rowH = 22;
  const height = opts.height ?? Math.max(120, rows.length * rowH + 60);
  const margin = { top: 10, right: 30, bottom: 32, left: 140 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  d3.select(container).selectAll('*').remove();

  if (rows.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:20px">No data</div>';
    return;
  }

  const svg = d3.select(container).append('svg')
    .attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const allVals = rows.flatMap(r => {
    const vals = [r.ciLower, r.ciUpper, r.estimate];
    if (r.originalWeight != null) vals.push(r.originalWeight);
    return vals;
  });
  const xExt = d3.extent(allVals) as [number, number];
  const pad = (xExt[1] - xExt[0]) * 0.1 || 0.05;
  const x = d3.scaleLinear()
    .domain([Math.min(xExt[0] - pad, 0), xExt[1] + pad])
    .range([0, innerW]).nice();

  const y = d3.scaleBand()
    .domain(rows.map(r => r.label))
    .range([0, innerH])
    .padding(0.15);

  // Alternating row backgrounds
  rows.forEach((r, i) => {
    if (i % 2 === 0) {
      g.append('rect')
        .attr('x', 0).attr('width', innerW)
        .attr('y', y(r.label)!).attr('height', y.bandwidth())
        .attr('fill', '#f8f9fa');
    }
  });

  // Reference line at 0
  if (x.domain()[0]! <= 0 && x.domain()[1]! >= 0) {
    g.append('line')
      .attr('x1', x(0)).attr('x2', x(0))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#999')
      .attr('stroke-dasharray', '4,3')
      .attr('stroke-width', 1);
  }

  // CI intervals + dots
  for (const r of rows) {
    const cy = (y(r.label) ?? 0) + y.bandwidth() / 2;
    const sigColor = '#4e79a7';
    const nsColor = '#bbb';
    const baseColor = r.color ?? (r.significant ? sigColor : nsColor);
    // Non-significant: dashed line, hollow dot (even when custom color)
    const isSig = r.significant;

    // CI line
    g.append('line')
      .attr('x1', x(r.ciLower)).attr('x2', x(r.ciUpper))
      .attr('y1', cy).attr('y2', cy)
      .attr('stroke', baseColor).attr('stroke-width', 1.5)
      .attr('stroke-dasharray', isSig ? 'none' : '4,3');

    // CI caps
    for (const cv of [r.ciLower, r.ciUpper]) {
      g.append('line')
        .attr('x1', x(cv)).attr('x2', x(cv))
        .attr('y1', cy - 4).attr('y2', cy + 4)
        .attr('stroke', baseColor).attr('stroke-width', 1.5);
    }

    // Original weight marker (small diamond)
    if (r.originalWeight != null) {
      const ox = x(r.originalWeight);
      const d = 3.5;
      g.append('path')
        .attr('d', `M${ox},${cy - d} L${ox + d},${cy} L${ox},${cy + d} L${ox - d},${cy} Z`)
        .attr('fill', '#e15759')
        .attr('stroke', '#c44')
        .attr('stroke-width', 0.8)
        .attr('opacity', 0.85);
    }

    // Bootstrap estimate (circle)
    g.append('circle')
      .attr('cx', x(r.estimate)).attr('cy', cy)
      .attr('r', 4)
      .attr('fill', isSig ? baseColor : '#fff')
      .attr('stroke', baseColor)
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('mousemove', (event: MouseEvent) => {
        let tip = `<strong>${r.label}</strong><br>Bootstrap Mean: ${r.estimate.toFixed(3)}<br>CI: [${r.ciLower.toFixed(3)}, ${r.ciUpper.toFixed(3)}]`;
        if (r.originalWeight != null) tip += `<br>Original Weight: ${r.originalWeight.toFixed(3)}`;
        tip += `<br>${isSig ? 'Significant' : 'Not significant'}`;
        showTooltip(event, tip);
      })
      .on('mouseleave', () => hideTooltip());
  }

  // Axes
  g.append('g')
    .call(d3.axisLeft(y).tickSize(0).tickPadding(6))
    .selectAll('text').attr('font-size', '9px');
  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6))
    .selectAll('text').attr('font-size', '9px');

  if (opts.xLabel) {
    svg.append('text')
      .attr('x', margin.left + innerW / 2).attr('y', height - 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px').attr('fill', '#888')
      .text(opts.xLabel);
  }
}

/**
 * Grouped forest plot: edges are grouped by label, with each group's CI
 * shown as parallel lines within the same row band.
 * Rows must have `group` and `color` set.
 */
export function renderGroupedForestPlot(
  container: HTMLElement,
  rows: ForestRow[],
  groupNames: string[],
  groupColors: string[],
  opts: ForestOpts = {},
): void {
  // Group rows by edge label
  const edgeMap = new Map<string, ForestRow[]>();
  for (const r of rows) {
    const key = r.label;
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key)!.push(r);
  }
  const edgeLabels = [...edgeMap.keys()];
  const nGroups = groupNames.length;

  const width = opts.width ?? (container.getBoundingClientRect().width || 500);
  const rowH = Math.max(18, 8 + nGroups * 10);
  const height = opts.height ?? Math.max(120, edgeLabels.length * rowH + 60);
  const margin = { top: 10, right: 30, bottom: 32, left: 140 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  d3.select(container).selectAll('*').remove();

  if (edgeLabels.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:20px">No data</div>';
    return;
  }

  const svg = d3.select(container).append('svg')
    .attr('width', width).attr('height', height);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const allVals = rows.flatMap(r => {
    const vals = [r.ciLower, r.ciUpper, r.estimate];
    if (r.originalWeight != null) vals.push(r.originalWeight);
    return vals;
  });
  const xExt = d3.extent(allVals) as [number, number];
  const pad = (xExt[1] - xExt[0]) * 0.1 || 0.05;
  const x = d3.scaleLinear()
    .domain([Math.min(xExt[0] - pad, 0), xExt[1] + pad])
    .range([0, innerW]).nice();

  const y = d3.scaleBand()
    .domain(edgeLabels)
    .range([0, innerH])
    .padding(0.1);

  // Alternating row backgrounds
  edgeLabels.forEach((label, i) => {
    if (i % 2 === 0) {
      g.append('rect')
        .attr('x', 0).attr('width', innerW)
        .attr('y', y(label)!).attr('height', y.bandwidth())
        .attr('fill', '#f8f9fa');
    }
  });

  // Reference line at 0
  if (x.domain()[0]! <= 0 && x.domain()[1]! >= 0) {
    g.append('line')
      .attr('x1', x(0)).attr('x2', x(0))
      .attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#999')
      .attr('stroke-dasharray', '4,3')
      .attr('stroke-width', 1);
  }

  // Render grouped CIs
  for (const [label, edgeRows] of edgeMap) {
    const bandTop = y(label)!;
    const bw = y.bandwidth();
    const lineSpacing = bw / (nGroups + 1);

    for (const r of edgeRows) {
      const gi = groupNames.indexOf(r.group ?? '');
      if (gi < 0) continue;
      const cy = bandTop + lineSpacing * (gi + 1);
      const color = groupColors[gi % groupColors.length]!;
      const isSig = r.significant;

      // CI line
      g.append('line')
        .attr('x1', x(r.ciLower)).attr('x2', x(r.ciUpper))
        .attr('y1', cy).attr('y2', cy)
        .attr('stroke', color).attr('stroke-width', 1.5)
        .attr('stroke-dasharray', isSig ? 'none' : '4,3');

      // CI caps
      for (const cv of [r.ciLower, r.ciUpper]) {
        g.append('line')
          .attr('x1', x(cv)).attr('x2', x(cv))
          .attr('y1', cy - 3).attr('y2', cy + 3)
          .attr('stroke', color).attr('stroke-width', 1.5);
      }

      // Original weight diamond
      if (r.originalWeight != null) {
        const ox = x(r.originalWeight);
        const d = 3;
        g.append('path')
          .attr('d', `M${ox},${cy - d} L${ox + d},${cy} L${ox},${cy + d} L${ox - d},${cy} Z`)
          .attr('fill', color)
          .attr('stroke', '#333')
          .attr('stroke-width', 0.5)
          .attr('opacity', 0.6);
      }

      // Bootstrap estimate dot
      g.append('circle')
        .attr('cx', x(r.estimate)).attr('cy', cy)
        .attr('r', 3.5)
        .attr('fill', isSig ? color : '#fff')
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .on('mousemove', (event: MouseEvent) => {
          let tip = `<strong>${r.group}: ${label}</strong><br>Bootstrap Mean: ${r.estimate.toFixed(3)}<br>CI: [${r.ciLower.toFixed(3)}, ${r.ciUpper.toFixed(3)}]`;
          if (r.originalWeight != null) tip += `<br>Original Weight: ${r.originalWeight.toFixed(3)}`;
          tip += `<br>${isSig ? 'Significant' : 'Not significant'}`;
          showTooltip(event, tip);
        })
        .on('mouseleave', () => hideTooltip());
    }
  }

  // Axes
  g.append('g')
    .call(d3.axisLeft(y).tickSize(0).tickPadding(6))
    .selectAll('text').attr('font-size', '9px');
  g.append('g')
    .attr('transform', `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(6))
    .selectAll('text').attr('font-size', '9px');

  if (opts.xLabel) {
    svg.append('text')
      .attr('x', margin.left + innerW / 2).attr('y', height - 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px').attr('fill', '#888')
      .text(opts.xLabel);
  }
}

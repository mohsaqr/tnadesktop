/**
 * Compare graph properties across group pairs using the 22 reliability metrics.
 * compareWeightMatrices() is called once per (i,j) group pair — no bootstrapping.
 */
import type { GroupTNA } from 'tnaj';
import { compareWeightMatrices, RELIABILITY_METRICS } from '../analysis/reliability';
import { createViewToggle } from './dashboard';
import { addPanelDownloadButtons } from './export';
import * as d3 from 'd3';

/**
 * Map a metric value to a [0,1] "goodness" score for RdYlGn colouring.
 * 1 = green (good / similar), 0 = red (bad / dissimilar).
 * All thresholds are absolute — a Spearman of 0.9 is always green.
 */
function goodness(v: number, key: string, category: string): number {
  if (!isFinite(v)) return 0.5;
  switch (category) {
    case 'Correlations':
      // Pearson/Spearman/Kendall/DistCorr ∈ [−1, 1]: map linearly to [0, 1]
      return Math.max(0, Math.min(1, (v + 1) / 2));
    case 'Similarities':
    case 'Pattern':
      // All metrics already ∈ [0, 1]
      return Math.max(0, Math.min(1, v));
    case 'Deviations':
      if (key === 'cv_ratio') {
        // Best = 1 (CVs equal); decay symmetrically away from 1
        return Math.exp(-2 * Math.abs(v - 1));
      }
      // MAD, Median AD, RMSD, Max AD, Rel. MAD — 0 is perfect, grows with divergence
      // exp(-5v): v=0→1.0, v=0.1→0.61, v=0.2→0.37, v=0.5→0.08
      return Math.exp(-5 * v);
    case 'Dissimilarities':
      if (key === 'braycurtis') {
        // Bray-Curtis ∈ [0, 1]
        return 1 - Math.max(0, Math.min(1, v));
      }
      // Euclidean, Manhattan, Canberra, Frobenius — 0 is perfect, unbounded
      // exp(-3v): v=0→1.0, v=0.5→0.22, v=1→0.05
      return Math.exp(-3 * v);
  }
  return 0.5;
}

export function renderComparePropertiesTab(
  container: HTMLElement,
  fullModel: GroupTNA,
): void {
  const groupNames = Object.keys(fullModel.models);
  if (groupNames.length < 2) {
    container.innerHTML = '<div class="panel" style="text-align:center;color:#888;padding:40px">Need at least 2 groups to compare properties.</div>';
    return;
  }

  // All (i < j) pairs
  const pairs: [string, string][] = [];
  for (let i = 0; i < groupNames.length; i++) {
    for (let j = i + 1; j < groupNames.length; j++) {
      pairs.push([groupNames[i]!, groupNames[j]!]);
    }
  }

  const pairLabels = pairs.map(([a, b]) => `${a} vs ${b}`);
  const pairMetrics: Record<string, number>[] = pairs.map(([a, b]) =>
    compareWeightMatrices(fullModel.models[a]!, fullModel.models[b]!),
  );

  createViewToggle(
    container,
    (fig) => renderFigure(fig, pairLabels, pairMetrics),
    (tbl) => renderTable(tbl, pairLabels, pairMetrics),
    'cmp-props',
  );
}

// ═══════════════════════════════════════════════════════════
//  Figure: 22-row × nPairs-col heatmap with per-row color normalisation
// ═══════════════════════════════════════════════════════════

function renderFigure(
  fig: HTMLElement,
  pairLabels: string[],
  pairMetrics: Record<string, number>[],
): void {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `<div class="panel-title">Graph Property Comparison Heatmap</div>`;
  addPanelDownloadButtons(panel, { image: true, filename: 'compare-properties' });
  fig.appendChild(panel);

  requestAnimationFrame(() => {
    const nPairs = pairLabels.length;
    const rowH = 24;
    const catGap = 10; // vertical gap between category groups

    // Column width: fit container width, min 70, max 130
    const containerW = fig.getBoundingClientRect().width || 900;
    const metricLabelW = 160;
    const catLabelW = 80;
    const marginLeft = catLabelW + metricLabelW;
    const marginTop = 80;
    const marginRight = 20;
    const marginBottom = 30;
    const colW = Math.max(70, Math.min(130, Math.floor((containerW - marginLeft - marginRight) / nPairs)));

    // Compute Y position of each metric row, with catGap between categories
    const metricY: number[] = [];
    let y = 0;
    let prevCat = '';
    for (const m of RELIABILITY_METRICS) {
      if (prevCat && m.category !== prevCat) y += catGap;
      metricY.push(y);
      y += rowH;
      prevCat = m.category;
    }
    const innerH = y;
    const innerW = nPairs * colW;
    const totalW = marginLeft + innerW + marginRight;
    const totalH = marginTop + innerH + marginBottom;

    const svg = d3.select(panel)
      .append('svg')
      .attr('viewBox', `0 0 ${totalW} ${totalH}`)
      .attr('width', '100%')
      .style('font-family', 'system-ui, sans-serif');

    const g = svg.append('g')
      .attr('transform', `translate(${marginLeft},${marginTop})`);

    // ── Column headers (rotated pair labels) ──
    for (let c = 0; c < nPairs; c++) {
      const cx = c * colW + colW / 2;
      g.append('text')
        .attr('x', cx)
        .attr('y', -12)
        .attr('text-anchor', 'start')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('fill', '#444')
        .attr('transform', `rotate(-35,${cx},-12)`)
        .text(pairLabels[c]!);
    }

    // ── Category separators and labels ──
    type CatRange = { cat: string; startY: number; endY: number };
    const catRanges: CatRange[] = [];
    let curCat = '';
    let catStartY = 0;
    let catLastY = 0;

    for (let i = 0; i < RELIABILITY_METRICS.length; i++) {
      const m = RELIABILITY_METRICS[i]!;
      const ry = metricY[i]!;
      if (m.category !== curCat) {
        if (curCat) catRanges.push({ cat: curCat, startY: catStartY, endY: catLastY + rowH });
        curCat = m.category;
        catStartY = ry;
      }
      catLastY = ry;
    }
    if (curCat) catRanges.push({ cat: curCat, startY: catStartY, endY: catLastY + rowH });

    for (const { cat, startY, endY } of catRanges) {
      // Category label (left of metric labels)
      g.append('text')
        .attr('x', -metricLabelW - 8)
        .attr('y', (startY + endY) / 2)
        .attr('text-anchor', 'end')
        .attr('dy', '0.35em')
        .attr('font-size', '9px')
        .attr('font-weight', '700')
        .attr('fill', '#999')
        .text(cat.toUpperCase());

      // Thin separator line before each new category (except the first)
      if (startY > 0) {
        g.append('line')
          .attr('x1', -metricLabelW)
          .attr('y1', startY - catGap / 2)
          .attr('x2', innerW)
          .attr('y2', startY - catGap / 2)
          .attr('stroke', '#ddd')
          .attr('stroke-width', 1);
      }
    }

    // ── Metric rows and heatmap cells ──
    const gradId = `cmp-props-grad-${Date.now()}`;

    for (let i = 0; i < RELIABILITY_METRICS.length; i++) {
      const m = RELIABILITY_METRICS[i]!;
      const ry = metricY[i]!;

      const vals: number[] = pairMetrics.map(pm => pm[m.key] ?? NaN);

      // Metric label
      g.append('text')
        .attr('x', -8)
        .attr('y', ry + rowH / 2)
        .attr('text-anchor', 'end')
        .attr('dy', '0.35em')
        .attr('font-size', '11px')
        .attr('fill', '#333')
        .text(m.label);

      // Cells — colour is absolute: green = good/similar, red = bad/dissimilar
      for (let c = 0; c < nPairs; c++) {
        const v = vals[c]!;
        const fillT = goodness(v, m.key, m.category);
        const fill = isFinite(v) ? d3.interpolateRdYlGn(fillT) : '#f0f0f0';
        const textFill = (isFinite(v) && (fillT < 0.28 || fillT > 0.75)) ? '#fff' : '#333';

        g.append('rect')
          .attr('x', c * colW)
          .attr('y', ry)
          .attr('width', colW - 1)
          .attr('height', rowH - 1)
          .attr('fill', fill)
          .attr('rx', 2);

        g.append('text')
          .attr('x', c * colW + colW / 2)
          .attr('y', ry + rowH / 2)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('font-size', '10px')
          .attr('fill', textFill)
          .attr('pointer-events', 'none')
          .text(isFinite(v) ? v.toFixed(4) : '—');
      }
    }

    // ── Colour legend ──
    const legW = 100;
    const legH = 10;
    const legX = Math.max(0, innerW - legW);
    const legY = innerH + 8;

    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', gradId);
    for (let t = 0; t <= 10; t++) {
      grad.append('stop')
        .attr('offset', `${t * 10}%`)
        .attr('stop-color', d3.interpolateRdYlGn(t / 10));
    }

    g.append('rect')
      .attr('x', legX)
      .attr('y', legY)
      .attr('width', legW)
      .attr('height', legH)
      .attr('fill', `url(#${gradId})`)
      .attr('rx', 3);

    g.append('text')
      .attr('x', legX)
      .attr('y', legY + legH + 10)
      .attr('font-size', '9px')
      .attr('fill', '#888')
      .text('Low');

    g.append('text')
      .attr('x', legX + legW)
      .attr('y', legY + legH + 10)
      .attr('text-anchor', 'end')
      .attr('font-size', '9px')
      .attr('fill', '#888')
      .text('High');
  });
}

// ═══════════════════════════════════════════════════════════
//  Table: 22 rows in 5 category groups, pair columns
// ═══════════════════════════════════════════════════════════

function renderTable(
  tbl: HTMLElement,
  pairLabels: string[],
  pairMetrics: Record<string, number>[],
): void {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `<div class="panel-title">Graph Property Comparison</div>`;

  const fmt = (v: number) => isFinite(v) ? v.toFixed(4) : '—';
  const nPairs = pairLabels.length;

  // Unique category order from RELIABILITY_METRICS (preserves Deviations-first order)
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const m of RELIABILITY_METRICS) {
    if (!seen.has(m.category)) { seen.add(m.category); categories.push(m.category); }
  }

  let html = `<table class="preview-table" style="font-size:12px"><thead><tr>`;
  html += `<th>Metric</th>`;
  for (const label of pairLabels) html += `<th>${label}</th>`;
  html += `</tr></thead><tbody>`;

  for (const cat of categories) {
    const rows = RELIABILITY_METRICS.filter(m => m.category === cat);
    html += `<tr><td colspan="${nPairs + 1}" style="background:#f5f5f5;font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.05em;padding:4px 8px">${cat}</td></tr>`;
    for (const m of rows) {
      html += `<tr><td style="padding-left:14px">${m.label}</td>`;
      for (let c = 0; c < nPairs; c++) {
        const v = pairMetrics[c]![m.key] ?? NaN;
        html += `<td style="font-variant-numeric:tabular-nums">${fmt(v)}</td>`;
      }
      html += `</tr>`;
    }
  }

  html += `</tbody></table>`;
  panel.innerHTML += html;
  addPanelDownloadButtons(panel, { csv: true, filename: 'compare-properties' });
  tbl.appendChild(panel);
}

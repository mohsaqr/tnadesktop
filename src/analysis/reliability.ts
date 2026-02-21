/**
 * Reliability analysis: split-half comparison of TNA weight matrices.
 * Port of R tna::reliability() / tna:::compare_().
 *
 * All 22 metrics match R's implementation exactly.  Key behaviour notes:
 *  - All vector-level metrics operate on the FULL n×n weight matrix
 *    (including diagonal), flattened column-major (same as R as.vector()).
 *  - Rank Agreement uses matrix row-differences, matching R's diff(matrix).
 *  - RV coefficient uses column-centred tcrossprod formula.
 *  - Distance correlation matches R's biased estimator (can be negative).
 */
import type { TNA, SequenceData } from 'tnaj';
import { tna, ftna, ctna, atna, SeededRNG } from 'tnaj';

// ── Metric definitions ───────────────────────────────────────────────────────

export interface MetricDef {
  key: string;
  label: string;
  category: 'Deviations' | 'Correlations' | 'Dissimilarities' | 'Similarities' | 'Pattern';
}

export const RELIABILITY_METRICS: MetricDef[] = [
  // Deviations (lower = more similar)
  { key: 'mad',        label: 'Mean Abs. Diff.',   category: 'Deviations' },
  { key: 'median_ad',  label: 'Median Abs. Diff.', category: 'Deviations' },
  { key: 'rmsd',       label: 'RMS Diff.',          category: 'Deviations' },
  { key: 'max_ad',     label: 'Max Abs. Diff.',     category: 'Deviations' },
  { key: 'rel_mad',    label: 'Rel. MAD',           category: 'Deviations' },
  { key: 'cv_ratio',   label: 'CV Ratio',           category: 'Deviations' },
  // Correlations (higher = more similar)
  { key: 'pearson',    label: 'Pearson',            category: 'Correlations' },
  { key: 'spearman',   label: 'Spearman',           category: 'Correlations' },
  { key: 'kendall',    label: 'Kendall',            category: 'Correlations' },
  { key: 'dcor',       label: 'Distance Corr.',     category: 'Correlations' },
  // Dissimilarities (lower = more similar)
  { key: 'euclidean',  label: 'Euclidean',          category: 'Dissimilarities' },
  { key: 'manhattan',  label: 'Manhattan',          category: 'Dissimilarities' },
  { key: 'canberra',   label: 'Canberra',           category: 'Dissimilarities' },
  { key: 'braycurtis', label: 'Bray-Curtis',        category: 'Dissimilarities' },
  { key: 'frobenius',  label: 'Frobenius',          category: 'Dissimilarities' },
  // Similarities (higher = more similar)
  { key: 'cosine',     label: 'Cosine',             category: 'Similarities' },
  { key: 'jaccard',    label: 'Jaccard',            category: 'Similarities' },
  { key: 'dice',       label: 'Dice',               category: 'Similarities' },
  { key: 'overlap',    label: 'Overlap',            category: 'Similarities' },
  { key: 'rv',         label: 'RV',                 category: 'Similarities' },
  // Pattern
  { key: 'rank_agree', label: 'Rank Agreement',     category: 'Pattern' },
  { key: 'sign_agree', label: 'Sign Agreement',     category: 'Pattern' },
];

// ── Result types ─────────────────────────────────────────────────────────────

export interface ReliabilityMetricSummary {
  metric: string;
  category: string;
  mean: number;
  sd: number;
  median: number;
  min: number;
  max: number;
  q25: number;
  q75: number;
}

export interface ReliabilityResult {
  /** Per-metric arrays of values, one per iteration. */
  iterations: Record<string, number[]>;
  /** Per-metric descriptive statistics across iterations. */
  summary: ReliabilityMetricSummary[];
  iter: number;
  split: number;
  modelType: string;
}

// ── Internal math helpers ────────────────────────────────────────────────────

function arrMean(a: number[]): number {
  if (a.length === 0) return NaN;
  return a.reduce((s, v) => s + v, 0) / a.length;
}

function arrStd(a: number[], ddof = 1): number {
  if (a.length < ddof + 1) return NaN;
  const m = arrMean(a);
  const variance = a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - ddof);
  return Math.sqrt(variance);
}

function arrMedian(a: number[]): number {
  if (a.length === 0) return NaN;
  const sorted = [...a].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function arrQuantile(a: number[], p: number): number {
  if (a.length === 0) return NaN;
  const sorted = [...a].sort((x, y) => x - y);
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (hi - pos) + sorted[hi]! * (pos - lo);
}

/** Rank values (1-based, average ties). */
function rankArr(a: number[]): number[] {
  const indexed = a.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
  const ranks = new Array<number>(a.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j]!.v === indexed[i]!.v) j++;
    const avg = (i + j + 1) / 2;
    for (let k = i; k < j; k++) ranks[indexed[k]!.i] = avg;
    i = j;
  }
  return ranks;
}

function pearsonCorrArr(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return NaN;
  const mx = arrMean(x);
  const my = arrMean(y);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom < 1e-14 ? NaN : num / denom;
}

function spearmanCorrArr(x: number[], y: number[]): number {
  return pearsonCorrArr(rankArr(x), rankArr(y));
}

/**
 * Kendall's tau-b (matches R's cor(x, y, method='kendall')).
 * tau-b = (C - D) / sqrt((n0 - Tx) * (n0 - Ty))
 * where Tx = tied pairs in x, Ty = tied pairs in y, n0 = n*(n-1)/2.
 */
function kendallTau(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return NaN;
  let concordant = 0, discordant = 0, tx = 0, ty = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sx = Math.sign(x[i]! - x[j]!);
      const sy = Math.sign(y[i]! - y[j]!);
      if (sx === sy && sx !== 0) concordant++;
      else if (sx !== 0 && sy !== 0) discordant++;
      if (sx === 0) tx++;
      if (sy === 0) ty++;
    }
  }
  const n0 = n * (n - 1) / 2;
  const denom = Math.sqrt((n0 - tx) * (n0 - ty));
  return denom < 1e-14 ? NaN : (concordant - discordant) / denom;
}

/**
 * Distance correlation matching R's tna:::distance_correlation.
 * Returns v_xy / sqrt(v_x * v_y) (biased estimator; can be negative).
 */
function distanceCorr(x: number[], y: number[]): number {
  const m = x.length;
  if (m < 2) return NaN;

  // Double-centre the pairwise absolute-difference distance matrices
  const center = (vals: number[]): number[][] => {
    const d = Array.from({ length: m }, (_, i) =>
      Array.from({ length: m }, (__, j) => Math.abs(vals[i]! - vals[j]!)),
    );
    // Row means
    const rowMeans = d.map(row => arrMean(row));
    const grandMean = arrMean(rowMeans);
    return d.map((row, i) =>
      row.map((v, j) => v - rowMeans[i]! - rowMeans[j]! + grandMean),
    );
  };

  const A = center(x);
  const B = center(y);

  let vXY = 0, vX = 0, vY = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      vXY += A[i]![j]! * B[i]![j]!;
      vX  += A[i]![j]! * A[i]![j]!;
      vY  += B[i]![j]! * B[i]![j]!;
    }
  }
  const n2 = m * m;
  vXY /= n2;
  vX  /= n2;
  vY  /= n2;

  const denom = Math.sqrt(vX * vY);
  return denom < 1e-14 ? NaN : vXY / denom;
}

/**
 * RV coefficient matching R's tna:::rv_coefficient.
 * Uses column-centred matrices and tcrossprod formula:
 * RV = trace(XX' * YY') / sqrt(trace(XX' * XX') * trace(YY' * YY'))
 */
function rvCoefficient(a: TNA['weights'], b: TNA['weights']): number {
  const n = a.rows;

  // Column-centre each matrix (subtract column mean from each column)
  const colCenter = (w: TNA['weights']): number[][] => {
    const result: number[][] = [];
    for (let i = 0; i < n; i++) result.push(new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      let colSum = 0;
      for (let i = 0; i < n; i++) colSum += w.get(i, j);
      const colMean = colSum / n;
      for (let i = 0; i < n; i++) result[i]![j] = w.get(i, j) - colMean;
    }
    return result;
  };

  // tcrossprod(x) = x %*% t(x): result[i][j] = sum_k x[i][k]*x[j][k]
  const tcrossprod = (x: number[][]): number[][] => {
    const mat: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += x[i]![k]! * x[j]![k]!;
        mat[i]![j] = s;
      }
    }
    return mat;
  };

  // trace(A %*% B) = sum_i sum_j A[i][j] * B[j][i]
  const traceMul = (P: number[][], Q: number[][]): number => {
    let tr = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        tr += P[i]![j]! * Q[j]![i]!;
    return tr;
  };

  const xc = colCenter(a);
  const yc = colCenter(b);
  const xx = tcrossprod(xc);
  const yy = tcrossprod(yc);

  const trXXYY = traceMul(xx, yy);
  const trXXXX = traceMul(xx, xx);
  const trYYYY = traceMul(yy, yy);

  const denom = Math.sqrt(trXXXX * trYYYY);
  return denom < 1e-14 ? NaN : trXXYY / denom;
}

// ── Matrix comparison ────────────────────────────────────────────────────────

/**
 * Flatten an n×n matrix in column-major order (same as R's as.vector).
 * This includes diagonal elements and is used for all vector-level metrics.
 */
function flattenColMajor(w: TNA['weights']): number[] {
  const n = w.rows;
  const out: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      out.push(w.get(i, j));
    }
  }
  return out;
}

/**
 * Compare two TNA weight matrices using all 22 metrics.
 * Matches R's tna:::compare_ output exactly:
 *  - All vector metrics use the full n×n flat vector (including diagonal).
 *  - Rank Agreement uses matrix row-differences (R's diff(matrix)).
 *  - RV uses column-centred tcrossprod formula.
 *  - Returns all-NaN if the two models have different n.
 */
export function compareWeightMatrices(a: TNA, b: TNA): Record<string, number> {
  const nanResult: Record<string, number> = {};
  for (const m of RELIABILITY_METRICS) nanResult[m.key] = NaN;

  if (a.labels.length !== b.labels.length) return nanResult;

  const n = a.labels.length;
  if (n === 0) return nanResult;

  // Full flat vectors (column-major, all n² elements including diagonal)
  const xv = flattenColMajor(a.weights);
  const yv = flattenColMajor(b.weights);
  const m2 = xv.length; // = n²

  const absX    = xv.map(v => Math.abs(v));
  const absY    = yv.map(v => Math.abs(v));
  const absDiff = xv.map((v, i) => Math.abs(v - yv[i]!));

  const meanX  = arrMean(xv);
  const meanY  = arrMean(yv);
  const stdX   = arrStd(xv);
  const stdY   = arrStd(yv);
  const meanAY = arrMean(absY);       // mean(abs(y)) — used in Rel. MAD

  // ── Deviations ───────────────────────────────────────────────────────
  const mad        = arrMean(absDiff);
  const median_ad  = arrMedian(absDiff);
  const rmsd       = Math.sqrt(arrMean(absDiff.map(d => d * d)));
  const max_ad     = Math.max(...absDiff);
  // R: mean(abs_diff) / mean(abs_y)
  const rel_mad    = meanAY > 1e-14 ? mad / meanAY : NaN;
  // R: sd(x)*mean(y) / (mean(x)*sd(y))
  const cv_ratio   = (Math.abs(meanX) > 1e-14 && Math.abs(stdY) > 1e-14)
    ? (stdX * meanY) / (meanX * stdY)
    : NaN;

  // ── Correlations ─────────────────────────────────────────────────────
  const pearson  = pearsonCorrArr(xv, yv);
  const spearman = spearmanCorrArr(xv, yv);
  const kendall  = kendallTau(xv, yv);
  const dcor     = distanceCorr(xv, yv);

  // ── Dissimilarities ───────────────────────────────────────────────────
  // R: sqrt(sum(abs_diff^2))  — same as Euclidean on the full vector
  const euclidean = Math.sqrt(absDiff.reduce((s, d) => s + d * d, 0));
  const manhattan = absDiff.reduce((s, d) => s + d, 0);

  // R: sum(abs_diff[pos] / (abs_x[pos] + abs_y[pos])) where pos = abs_x>0 & abs_y>0
  let canberraSum = 0;
  for (let i = 0; i < m2; i++) {
    if (absX[i]! > 0 && absY[i]! > 0) {
      canberraSum += absDiff[i]! / (absX[i]! + absY[i]!);
    }
  }
  const canberra = canberraSum;

  // R: sum(abs_diff) / sum(abs_x + abs_y)
  const sumAbsXY = absX.reduce((s, v, i) => s + v + absY[i]!, 0);
  const braycurtis = sumAbsXY > 1e-14 ? manhattan / sumAbsXY : 0;

  // R: sqrt(sum(abs_diff^2)) / sqrt(n/2)  — normalised Frobenius
  const frobenius = Math.sqrt(n / 2) > 1e-14
    ? euclidean / Math.sqrt(n / 2)
    : NaN;

  // ── Similarities (using full flat vectors) ────────────────────────────
  // R: sum(x*y) / (sqrt(sum(x^2)) * sqrt(sum(y^2)))  — uses raw x,y (not abs)
  let dotXY = 0, dotXX = 0, dotYY = 0;
  for (let i = 0; i < m2; i++) {
    dotXY += xv[i]! * yv[i]!;
    dotXX += xv[i]! * xv[i]!;
    dotYY += yv[i]! * yv[i]!;
  }
  const cosine = Math.sqrt(dotXX * dotYY) > 1e-14
    ? dotXY / Math.sqrt(dotXX * dotYY)
    : NaN;

  // R: sum(pmin(abs_x,abs_y)) / sum(pmax(abs_x,abs_y))
  let minSum = 0, maxSum = 0, sumAbsX = 0, sumAbsY = 0;
  for (let i = 0; i < m2; i++) {
    minSum  += Math.min(absX[i]!, absY[i]!);
    maxSum  += Math.max(absX[i]!, absY[i]!);
    sumAbsX += absX[i]!;
    sumAbsY += absY[i]!;
  }
  const jaccard = maxSum > 1e-14 ? minSum / maxSum : NaN;
  const dice    = (sumAbsX + sumAbsY) > 1e-14 ? 2 * minSum / (sumAbsX + sumAbsY) : NaN;
  const overlap = Math.min(sumAbsX, sumAbsY) > 1e-14
    ? minSum / Math.min(sumAbsX, sumAbsY)
    : NaN;

  // RV: column-centred tcrossprod formula (see rvCoefficient)
  const rv = rvCoefficient(a.weights, b.weights);

  // ── Pattern ───────────────────────────────────────────────────────────
  // R: mean(sign(diff(x_matrix)) == sign(diff(y_matrix)))
  // diff(matrix) in R = row i+1 minus row i, giving (n-1)×n matrix
  let matchCount = 0, totalDiff = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n; j++) {
      const dA = a.weights.get(i + 1, j) - a.weights.get(i, j);
      const dB = b.weights.get(i + 1, j) - b.weights.get(i, j);
      if (Math.sign(dA) === Math.sign(dB)) matchCount++;
      totalDiff++;
    }
  }
  const rank_agree = totalDiff > 0 ? matchCount / totalDiff : NaN;

  // R: mean(sign(x) == sign(y)) — element-wise across the full n² flat vector
  const sameSign  = xv.filter((v, i) => Math.sign(v) === Math.sign(yv[i]!)).length;
  const sign_agree = m2 > 0 ? sameSign / m2 : NaN;

  return {
    mad, median_ad, rmsd, max_ad, rel_mad, cv_ratio,
    pearson, spearman, kendall, dcor,
    euclidean, manhattan, canberra, braycurtis, frobenius,
    cosine, jaccard, dice, overlap, rv,
    rank_agree, sign_agree,
  };
}

// ── Builder map ──────────────────────────────────────────────────────────────

const BUILDERS: Record<string, (data: SequenceData, opts: Record<string, unknown>) => TNA> = {
  tna:  (d, o) => tna(d as any, o as any),
  ftna: (d, o) => ftna(d as any, o as any),
  ctna: (d, o) => ctna(d as any, o as any),
  atna: (d, o) => atna(d as any, o as any),
};

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Perform split-half reliability analysis.
 *
 * Repeatedly splits the sequence data into two halves, builds a model on
 * each half, and compares the resulting weight matrices using 22 metrics
 * that exactly match R's tna:::compare_ output.
 *
 * @param sequenceData - Raw sequence data (array of sequences).
 * @param modelType    - Which TNA builder to use: 'tna'|'ftna'|'ctna'|'atna'.
 * @param opts         - iter (default 100), split (default 0.5), atnaBeta, seed.
 * @returns ReliabilityResult with per-metric iteration arrays and summary stats.
 */
export function reliabilityAnalysis(
  sequenceData: SequenceData,
  modelType: 'tna' | 'ftna' | 'ctna' | 'atna',
  opts: { iter?: number; split?: number; atnaBeta?: number; seed?: number } = {},
): ReliabilityResult {
  if (sequenceData.length < 4) {
    throw new Error('Need at least 4 sequences for reliability analysis');
  }

  const { iter = 100, split = 0.5, atnaBeta = 0.1, seed = 42 } = opts;
  const n  = sequenceData.length;
  const nA = Math.floor(n * split);

  if (nA < 2 || n - nA < 2) {
    throw new Error('Each split half must have at least 2 sequences');
  }

  const rng = new SeededRNG(seed);
  const builder = BUILDERS[modelType]!;
  const buildOpts: Record<string, unknown> = {};
  if (modelType === 'atna') buildOpts.beta = atnaBeta;

  // Initialise per-metric iteration arrays
  const iterations: Record<string, number[]> = {};
  for (const m of RELIABILITY_METRICS) iterations[m.key] = [];

  for (let it = 0; it < iter; it++) {
    // Split indices using SeededRNG (Fisher-Yates via choiceWithoutReplacement)
    const indicesA = rng.choiceWithoutReplacement(n, nA);
    const setA = new Set(indicesA);
    const indicesB = Array.from({ length: n }, (_, i) => i).filter(i => !setA.has(i));

    const seqA: SequenceData = indicesA.map(i => sequenceData[i]!);
    const seqB: SequenceData = indicesB.map(i => sequenceData[i]!);

    try {
      const modelA = builder(seqA, buildOpts);
      const modelB = builder(seqB, buildOpts);
      const metrics = compareWeightMatrices(modelA, modelB);
      for (const m of RELIABILITY_METRICS) {
        iterations[m.key]!.push(metrics[m.key]!);
      }
    } catch {
      // Half failed to build (e.g., too few unique states): push NaN for this iter
      for (const m of RELIABILITY_METRICS) {
        iterations[m.key]!.push(NaN);
      }
    }
  }

  // Compute descriptive statistics across iterations (finite values only)
  const summary: ReliabilityMetricSummary[] = RELIABILITY_METRICS.map(metDef => {
    const raw  = iterations[metDef.key] ?? [];
    const vals = raw.filter(v => isFinite(v));
    return {
      metric:   metDef.label,
      category: metDef.category,
      mean:     arrMean(vals),
      sd:       arrStd(vals),
      median:   arrMedian(vals),
      min:      vals.length > 0 ? Math.min(...vals) : NaN,
      max:      vals.length > 0 ? Math.max(...vals) : NaN,
      q25:      arrQuantile(vals, 0.25),
      q75:      arrQuantile(vals, 0.75),
    };
  });

  return { iterations, summary, iter, split, modelType };
}

/**
 * ANOVA and Kruskal-Wallis group comparison with post-hoc pairwise tests.
 */
import { fDistCDF, tDistCDF, normalCDF, chiSqCDF } from './stats-utils';

export interface AnovaResult {
  statistic: number;     // F (parametric) or H (non-parametric)
  df1: number;           // between-groups df (k-1)
  df2: number;           // within-groups df (N-k) or NaN for KW
  pValue: number;
  effectSize: number;    // eta² (ANOVA) or epsilon² (KW)
  effectLabel: string;   // 'η²' or 'ε²'
  method: 'anova' | 'kruskal';
}

export interface PostHocResult {
  groupA: string;
  groupB: string;
  statistic: number;
  pValue: number;        // adjusted
  significant: boolean;
}

export interface GroupComparisonResult {
  metric: string;
  omnibus: AnovaResult;
  postHoc: PostHocResult[];
}

export interface GroupData {
  label: string;
  values: number[];
}

/** One-way ANOVA (F-test). */
export function oneWayAnova(groups: GroupData[]): AnovaResult {
  const k = groups.length;
  const N = groups.reduce((s, g) => s + g.values.length, 0);

  // Grand mean
  let grandSum = 0;
  for (const g of groups) {
    for (const v of g.values) grandSum += v;
  }
  const grandMean = grandSum / N;

  // Sum of squares between and within
  let ssBetween = 0;
  let ssWithin = 0;
  for (const g of groups) {
    const ni = g.values.length;
    const groupMean = g.values.reduce((s, v) => s + v, 0) / ni;
    ssBetween += ni * (groupMean - grandMean) ** 2;
    for (const v of g.values) {
      ssWithin += (v - groupMean) ** 2;
    }
  }

  const df1 = k - 1;
  const df2 = N - k;
  const msBetween = ssBetween / df1;
  const msWithin = df2 > 0 ? ssWithin / df2 : 0;
  const F = msWithin > 0 ? msBetween / msWithin : 0;
  const pValue = df2 > 0 ? 1 - fDistCDF(F, df1, df2) : 1;

  const ssTotal = ssBetween + ssWithin;
  const etaSq = ssTotal > 0 ? ssBetween / ssTotal : 0;

  return {
    statistic: F,
    df1,
    df2,
    pValue,
    effectSize: etaSq,
    effectLabel: 'η²',
    method: 'anova',
  };
}

/** Kruskal-Wallis H test (non-parametric). */
export function kruskalWallis(groups: GroupData[]): AnovaResult {
  const k = groups.length;

  // Pool all values with group tags
  const pooled: { value: number; group: number }[] = [];
  for (let g = 0; g < k; g++) {
    for (const v of groups[g]!.values) {
      pooled.push({ value: v, group: g });
    }
  }
  const N = pooled.length;

  // Rank all values (average ranks for ties)
  pooled.sort((a, b) => a.value - b.value);
  const ranks = new Float64Array(N);
  let i = 0;
  while (i < N) {
    let j = i;
    while (j < N && pooled[j]!.value === pooled[i]!.value) j++;
    const avgRank = (i + 1 + j) / 2; // 1-based
    for (let t = i; t < j; t++) ranks[t] = avgRank;
    i = j;
  }

  // Sum of ranks per group
  const rankSums = new Float64Array(k);
  const groupSizes = new Float64Array(k);
  for (let idx = 0; idx < N; idx++) {
    const g = pooled[idx]!.group;
    rankSums[g] += ranks[idx]!;
    groupSizes[g]++;
  }

  // H statistic
  let sumTerm = 0;
  for (let g = 0; g < k; g++) {
    if (groupSizes[g]! > 0) {
      sumTerm += (rankSums[g]! ** 2) / groupSizes[g]!;
    }
  }
  const H = (12 / (N * (N + 1))) * sumTerm - 3 * (N + 1);

  // Tie correction
  let tieCorrection = 0;
  i = 0;
  while (i < N) {
    let j = i;
    while (j < N && pooled[j]!.value === pooled[i]!.value) j++;
    const t = j - i;
    if (t > 1) tieCorrection += t * t * t - t;
    i = j;
  }
  const correction = 1 - tieCorrection / (N * N * N - N);
  const Hcorrected = correction > 0 ? H / correction : H;

  const df1 = k - 1;
  const pValue = 1 - chiSqCDF(Hcorrected, df1);

  // Epsilon squared effect size: (H - k + 1) / (N - k)
  const epsilonSq = N > k ? (Hcorrected - k + 1) / (N - k) : 0;

  return {
    statistic: Hcorrected,
    df1,
    df2: NaN,
    pValue,
    effectSize: Math.max(0, epsilonSq),
    effectLabel: 'ε²',
    method: 'kruskal',
  };
}

/** Welch's two-sample t-test (unequal variances). */
function welchTTest(a: number[], b: number[]): { t: number; df: number; pValue: number } {
  const n1 = a.length, n2 = b.length;
  const m1 = a.reduce((s, v) => s + v, 0) / n1;
  const m2 = b.reduce((s, v) => s + v, 0) / n2;
  const v1 = a.reduce((s, v) => s + (v - m1) ** 2, 0) / (n1 - 1 || 1);
  const v2 = b.reduce((s, v) => s + (v - m2) ** 2, 0) / (n2 - 1 || 1);

  const se = Math.sqrt(v1 / n1 + v2 / n2);
  if (se === 0) return { t: 0, df: Math.max(n1 + n2 - 2, 1), pValue: 1 };

  const t = (m1 - m2) / se;

  // Welch-Satterthwaite df
  const num = (v1 / n1 + v2 / n2) ** 2;
  const den = (v1 / n1) ** 2 / (n1 - 1 || 1) + (v2 / n2) ** 2 / (n2 - 1 || 1);
  const df = den > 0 ? num / den : 1;

  // Two-tailed p-value
  const pValue = 2 * (1 - tDistCDF(Math.abs(t), df));

  return { t, df, pValue };
}

/** Mann-Whitney U test (two-sample rank test). */
function mannWhitneyU(a: number[], b: number[]): { U: number; pValue: number } {
  const n1 = a.length, n2 = b.length;
  const N = n1 + n2;

  // Pool and rank
  const pooled: { value: number; group: 0 | 1 }[] = [];
  for (const v of a) pooled.push({ value: v, group: 0 });
  for (const v of b) pooled.push({ value: v, group: 1 });
  pooled.sort((a, b) => a.value - b.value);

  const ranks = new Float64Array(N);
  let i = 0;
  while (i < N) {
    let j = i;
    while (j < N && pooled[j]!.value === pooled[i]!.value) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let t = i; t < j; t++) ranks[t] = avgRank;
    i = j;
  }

  let R1 = 0;
  for (let idx = 0; idx < N; idx++) {
    if (pooled[idx]!.group === 0) R1 += ranks[idx]!;
  }

  const U1 = R1 - n1 * (n1 + 1) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);

  // Normal approximation (with tie correction)
  const mu = n1 * n2 / 2;
  let tieCorr = 0;
  i = 0;
  while (i < N) {
    let j = i;
    while (j < N && pooled[j]!.value === pooled[i]!.value) j++;
    const t = j - i;
    if (t > 1) tieCorr += t * t * t - t;
    i = j;
  }
  const sigma = Math.sqrt((n1 * n2 / 12) * ((N + 1) - tieCorr / (N * (N - 1))));

  if (sigma === 0) return { U, pValue: 1 };

  const z = (U - mu) / sigma;
  // Two-tailed p-value
  const pValue = 2 * normalCDF(z); // z is negative since U=min(U1,U2)

  return { U, pValue: Math.min(pValue, 1) };
}

/** Pairwise post-hoc tests with p-value adjustment. */
export function postHocPairwise(
  groups: GroupData[],
  parametric: boolean,
  adjust: 'bonferroni' | 'holm' | 'fdr' = 'bonferroni',
  level = 0.05,
): PostHocResult[] {
  const k = groups.length;
  const rawResults: { groupA: string; groupB: string; statistic: number; pValue: number }[] = [];

  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      if (parametric) {
        const { t, pValue } = welchTTest(groups[i]!.values, groups[j]!.values);
        rawResults.push({ groupA: groups[i]!.label, groupB: groups[j]!.label, statistic: t, pValue });
      } else {
        const { U, pValue } = mannWhitneyU(groups[i]!.values, groups[j]!.values);
        rawResults.push({ groupA: groups[i]!.label, groupB: groups[j]!.label, statistic: U, pValue });
      }
    }
  }

  // Adjust p-values
  const adjusted = adjustPValues(rawResults.map(r => r.pValue), adjust);

  return rawResults.map((r, i) => ({
    groupA: r.groupA,
    groupB: r.groupB,
    statistic: r.statistic,
    pValue: adjusted[i]!,
    significant: adjusted[i]! < level,
  }));
}

/** Adjust p-values for multiple comparisons. */
function adjustPValues(pValues: number[], method: 'bonferroni' | 'holm' | 'fdr'): number[] {
  const m = pValues.length;
  if (m === 0) return [];

  switch (method) {
    case 'bonferroni':
      return pValues.map(p => Math.min(p * m, 1));

    case 'holm': {
      const indexed = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
      const adjusted = new Array<number>(m);
      let maxSoFar = 0;
      for (let j = 0; j < m; j++) {
        const adj = indexed[j]!.p * (m - j);
        maxSoFar = Math.max(maxSoFar, adj);
        adjusted[indexed[j]!.i] = Math.min(maxSoFar, 1);
      }
      return adjusted;
    }

    case 'fdr': {
      // Benjamini-Hochberg
      const indexed = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
      const adjusted = new Array<number>(m);
      let minSoFar = 1;
      for (let j = m - 1; j >= 0; j--) {
        const adj = indexed[j]!.p * m / (j + 1);
        minSoFar = Math.min(minSoFar, adj);
        adjusted[indexed[j]!.i] = Math.min(minSoFar, 1);
      }
      return adjusted;
    }
  }
}

/** Full group comparison for a single metric. */
export function compareGroups(
  groups: GroupData[],
  metric: string,
  opts: { parametric: boolean; adjust: 'bonferroni' | 'holm' | 'fdr'; level: number },
): GroupComparisonResult {
  const omnibus = opts.parametric ? oneWayAnova(groups) : kruskalWallis(groups);
  const postHoc = postHocPairwise(groups, opts.parametric, opts.adjust, opts.level);
  return { metric, omnibus, postHoc };
}

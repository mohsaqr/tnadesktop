/**
 * Permutation test for comparing two TNA models.
 * Port of Python tna/bootstrap.py permutation_test().
 * Uses tnaj's computeTransitions3D / computeWeightsFrom3D for exact R equivalence.
 */
import type { TNA, Matrix } from 'tnaj';
import { computeTransitions3D, computeWeightsFrom3D, SeededRNG } from 'tnaj';

export interface EdgeStat {
  from: string;
  to: string;
  diffTrue: number;
  effectSize: number;
  pValue: number;
}

export interface PermutationResult {
  edgeStats: EdgeStat[];
  /** True weight differences (a x a), row-major. */
  diffTrue: Float64Array;
  /** Significant-only differences (a x a), row-major. */
  diffSig: Float64Array;
  /** Adjusted p-values (a x a), row-major. */
  pValues: Float64Array;
  labels: string[];
  nStates: number;
  level: number;
}

/**
 * P-value adjustment methods matching R's p.adjust.
 */
function pAdjust(pvals: number[], method: string): number[] {
  const n = pvals.length;
  if (method === 'none' || n <= 1) return pvals.slice();

  if (method === 'bonferroni') {
    return pvals.map(p => Math.min(p * n, 1));
  }

  if (method === 'holm') {
    const indexed = pvals.map((p, i) => ({ p, i }));
    indexed.sort((a, b) => a.p - b.p);
    const adjusted = new Array<number>(n);
    let cummax = 0;
    for (let k = 0; k < n; k++) {
      const adj = indexed[k]!.p * (n - k);
      cummax = Math.max(cummax, adj);
      adjusted[indexed[k]!.i] = Math.min(cummax, 1);
    }
    return adjusted;
  }

  if (method === 'fdr' || method === 'BH') {
    const indexed = pvals.map((p, i) => ({ p, i }));
    indexed.sort((a, b) => a.p - b.p);
    const adjusted = new Array<number>(n);
    let cummin = 1;
    for (let k = n - 1; k >= 0; k--) {
      const adj = (indexed[k]!.p * n) / (k + 1);
      cummin = Math.min(cummin, adj);
      adjusted[indexed[k]!.i] = Math.min(cummin, 1);
    }
    return adjusted;
  }

  return pvals.slice();
}

export interface PermutationOptions {
  iter?: number;
  adjust?: 'none' | 'bonferroni' | 'holm' | 'fdr' | 'BH';
  level?: number;
  seed?: number;
  /** When true and nX === nY, swap within pairs instead of full shuffle. */
  paired?: boolean;
}

/**
 * Permutation test comparing two TNA models.
 * Both models must have sequence data (model.data) and identical labels.
 */
export function permutationTest(
  x: TNA,
  y: TNA,
  options: PermutationOptions = {},
): PermutationResult {
  const { iter = 1000, adjust = 'none', level = 0.05, seed = 42, paired = false } = options;

  if (!x.data || !y.data) {
    throw new Error('Both TNA models must have sequence data for permutation test');
  }

  const labels = x.labels;
  const a = labels.length;

  if (a !== y.labels.length || !labels.every((l, i) => l === y.labels[i])) {
    throw new Error('Both models must have the same state labels');
  }

  const modelType = x.type;
  const modelScaling = x.scaling.length > 0 ? x.scaling : null;

  const dataX = x.data;
  const dataY = y.data;
  const nX = dataX.length;
  const nY = dataY.length;

  // Combine sequences
  const combined = [...dataX, ...dataY];
  const nXY = nX + nY;

  // Pad all sequences to uniform length so computeTransitions3D uses all transitions.
  // tnaj's computeTransitions3D uses data[0].length as nCols for ALL sequences,
  // which truncates longer sequences. Padding with null (caught by isNA) fixes this.
  let maxLen = 0;
  for (const seq of combined) {
    if (seq.length > maxLen) maxLen = seq.length;
  }
  const padded = combined.map(seq => {
    if (seq.length >= maxLen) return seq;
    const pad: (string | null)[] = new Array(maxLen - seq.length).fill(null);
    return [...seq, ...pad];
  });

  // Compute per-sequence transitions for combined data
  const combinedTrans = computeTransitions3D(padded, labels, modelType);

  // Compute true differences directly from model weights (matches R: weights_x - weights_y)
  const trueDiff = new Float64Array(a * a);
  const absTrueDiff = new Float64Array(a * a);
  for (let i = 0; i < a; i++) {
    for (let j = 0; j < a; j++) {
      const idx = i * a + j;
      trueDiff[idx] = x.weights.get(i, j) - y.weights.get(i, j);
      absTrueDiff[idx] = Math.abs(trueDiff[idx]!);
    }
  }

  if (paired && nX !== nY) {
    throw new Error('Paired permutation test requires equal group sizes');
  }

  const rng = new SeededRNG(seed);

  // Accumulators for p-values and effect sizes
  const edgePCounts = new Float64Array(a * a);
  const permDiffSums = new Float64Array(a * a);
  const permDiffSqSums = new Float64Array(a * a);

  // Permutation loop
  for (let it = 0; it < iter; it++) {
    let permIdx: number[];
    if (paired) {
      // Paired: randomly swap within each pair
      permIdx = Array.from({ length: nXY }, (_, i) => i);
      for (let p = 0; p < nX; p++) {
        if (rng.random() < 0.5) {
          [permIdx[p], permIdx[nX + p]] = [permIdx[nX + p]!, permIdx[p]!];
        }
      }
    } else {
      permIdx = rng.permutation(nXY);
    }

    // Split permuted indices into two groups
    const transPermX: Matrix[] = [];
    const transPermY: Matrix[] = [];
    for (let i = 0; i < nX; i++) {
      transPermX.push(combinedTrans[permIdx[i]!]!);
    }
    for (let i = nX; i < nXY; i++) {
      transPermY.push(combinedTrans[permIdx[i]!]!);
    }

    const wPermX = computeWeightsFrom3D(transPermX, modelType, modelScaling);
    const wPermY = computeWeightsFrom3D(transPermY, modelType, modelScaling);

    for (let i = 0; i < a; i++) {
      for (let j = 0; j < a; j++) {
        const idx = i * a + j;
        const diff = wPermX.get(i, j) - wPermY.get(i, j);
        permDiffSums[idx] += diff;
        permDiffSqSums[idx] += diff * diff;
        if (Math.abs(diff) >= absTrueDiff[idx]!) {
          edgePCounts[idx]++;
        }
      }
    }
  }

  // P-values: (count + 1) / (iter + 1)
  const rawPValues = new Float64Array(a * a);
  for (let i = 0; i < a * a; i++) {
    rawPValues[i] = (edgePCounts[i]! + 1) / (iter + 1);
  }

  // Adjust p-values (column-major flatten to match R)
  const colMajorP: number[] = [];
  for (let j = 0; j < a; j++) {
    for (let i = 0; i < a; i++) {
      colMajorP.push(rawPValues[i * a + j]!);
    }
  }
  const adjustedColMajor = pAdjust(colMajorP, adjust);

  // Map back to row-major
  const adjustedP = new Float64Array(a * a);
  for (let j = 0; j < a; j++) {
    for (let i = 0; i < a; i++) {
      adjustedP[i * a + j] = adjustedColMajor[j * a + i]!;
    }
  }

  // Effect sizes: diff_true / sd(perm_diffs)
  const effectSizes = new Float64Array(a * a);
  for (let i = 0; i < a * a; i++) {
    const mean = permDiffSums[i]! / iter;
    const variance = (permDiffSqSums[i]! / iter) - mean * mean;
    const sd = iter > 1 ? Math.sqrt((variance * iter) / (iter - 1)) : 0;
    effectSizes[i] = sd > 0 ? trueDiff[i]! / sd : NaN;
  }

  // Significant-only differences
  const diffSig = new Float64Array(a * a);
  for (let i = 0; i < a * a; i++) {
    diffSig[i] = adjustedP[i]! < level ? trueDiff[i]! : 0;
  }

  // Build edge stats (column-major order to match R)
  const edgeStats: EdgeStat[] = [];
  for (let j = 0; j < a; j++) {
    for (let i = 0; i < a; i++) {
      const idx = i * a + j;
      edgeStats.push({
        from: labels[i]!,
        to: labels[j]!,
        diffTrue: trueDiff[idx]!,
        effectSize: effectSizes[idx]!,
        pValue: adjustedP[idx]!,
      });
    }
  }

  return {
    edgeStats,
    diffTrue: trueDiff,
    diffSig,
    pValues: adjustedP,
    labels,
    nStates: a,
    level,
  };
}

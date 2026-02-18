/**
 * Centrality stability estimation via case-dropping bootstrap.
 * Port of Python tna/bootstrap.py estimate_cs().
 */
import type { TNA, CentralityMeasure, Matrix } from 'tnaj';
import { computeTransitions3D, computeWeightsFrom3D, createTNA, centralities, SeededRNG, pearsonCorr } from 'tnaj';

export interface StabilityResult {
  /** CS coefficient per measure. */
  csCoefficients: Record<string, number>;
  /** Mean correlation per (measure, dropProp). measures x dropProps. */
  meanCorrelations: Record<string, number[]>;
  dropProps: number[];
  threshold: number;
  certainty: number;
}

export interface StabilityOptions {
  measures?: CentralityMeasure[];
  iter?: number;
  dropProps?: number[];
  threshold?: number;
  certainty?: number;
  seed?: number;
  /** Correlation method: 'pearson' (default) or 'spearman'. */
  corrMethod?: 'pearson' | 'spearman';
}

/**
 * Estimate centrality stability using case-dropping bootstrap.
 */
export function estimateCS(
  model: TNA,
  options: StabilityOptions = {},
): StabilityResult {
  const {
    measures = ['InStrength', 'OutStrength', 'Betweenness'] as CentralityMeasure[],
    iter = 500,
    dropProps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    threshold = 0.7,
    certainty = 0.95,
    seed = 42,
    corrMethod = 'pearson',
  } = options;

  if (!model.data) {
    throw new Error('TNA model must have sequence data for centrality stability');
  }

  const labels = model.labels;
  const a = labels.length;
  const seqData = model.data;
  const n = seqData.length;
  const modelType = model.type;
  const modelScaling = model.scaling.length > 0 ? model.scaling : null;

  const rng = new SeededRNG(seed);

  // Pad sequences to uniform length so computeTransitions3D uses all transitions.
  let maxLen = 0;
  for (const seq of seqData) { if (seq.length > maxLen) maxLen = seq.length; }
  const padded = seqData.map(seq => {
    if (seq.length >= maxLen) return seq;
    const pad: (string | null)[] = new Array(maxLen - seq.length).fill(null);
    return [...seq, ...pad];
  });

  // Compute per-sequence 3D transitions
  const trans = computeTransitions3D(padded, labels, modelType, model.params);

  // Compute original centralities
  const origCent = centralities(model, { measures });

  // Check which measures have non-zero variance
  const validMeasures: CentralityMeasure[] = [];
  for (const m of measures) {
    const vals = origCent.measures[m];
    if (!vals) continue;
    let mean = 0;
    for (let i = 0; i < a; i++) mean += vals[i]!;
    mean /= a;
    let variance = 0;
    for (let i = 0; i < a; i++) variance += (vals[i]! - mean) ** 2;
    if (variance > 0) validMeasures.push(m);
  }

  // Correlation storage: for each (measure, dropProp) pair, track proportion above threshold
  const correlations: Record<string, number[][]> = {};
  for (const m of validMeasures) {
    correlations[m] = dropProps.map(() => []);
  }

  // Case-dropping bootstrap
  for (let j = 0; j < dropProps.length; j++) {
    const dp = dropProps[j]!;
    const nDrop = Math.floor(n * dp);
    const nKeep = n - nDrop;
    if (nDrop === 0 || nKeep < 2) continue;

    for (let it = 0; it < iter; it++) {
      const keepIdx = rng.choiceWithoutReplacement(n, nKeep);

      const transSub: Matrix[] = [];
      for (const idx of keepIdx) {
        transSub.push(trans[idx]!);
      }

      const weightsSub = computeWeightsFrom3D(transSub, modelType, modelScaling);
      const subModel = createTNA(weightsSub, model.inits, labels, null, modelType, model.scaling);
      const subCent = centralities(subModel, { measures: validMeasures });

      for (const m of validMeasures) {
        const origVals = origCent.measures[m]!;
        const subVals = subCent.measures[m]!;
        const corr = corrMethod === 'spearman'
          ? spearmanCorr(origVals, subVals)
          : pearsonCorr(origVals, subVals);
        correlations[m]![j]!.push(corr);
      }
    }
  }

  // Compute mean correlations and CS coefficients
  const meanCorrelations: Record<string, number[]> = {};
  const csCoefficients: Record<string, number> = {};

  for (const m of measures) {
    if (validMeasures.includes(m)) {
      const means: number[] = [];
      for (let j = 0; j < dropProps.length; j++) {
        const corrs = correlations[m]![j]!;
        const valid = corrs.filter(c => !isNaN(c));
        if (valid.length === 0) {
          means.push(NaN);
          continue;
        }
        means.push(valid.reduce((s, v) => s + v, 0) / valid.length);
      }
      meanCorrelations[m] = means;

      // CS coefficient: max dropProp where >=certainty of correlations >= threshold
      let cs = 0;
      for (let j = 0; j < dropProps.length; j++) {
        const corrs = correlations[m]![j]!;
        const validCorrs = corrs.filter(c => !isNaN(c));
        if (validCorrs.length === 0) continue;
        const aboveThreshold = validCorrs.filter(c => c >= threshold).length / validCorrs.length;
        if (aboveThreshold >= certainty) {
          cs = dropProps[j]!;
        }
      }
      csCoefficients[m] = cs;
    } else {
      meanCorrelations[m] = dropProps.map(() => NaN);
      csCoefficients[m] = 0;
    }
  }

  return {
    csCoefficients,
    meanCorrelations,
    dropProps,
    threshold,
    certainty,
  };
}

/** Rank array values (1-based, no tie handling — simple dense rank by sort order). */
function rankArray(arr: Float64Array): Float64Array {
  const indexed = Array.from(arr, (v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Float64Array(arr.length);
  // Average ranks for ties
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j]!.v === indexed[i]!.v) j++;
    const avgRank = (i + j + 1) / 2; // average of 1-based ranks i+1..j
    for (let k = i; k < j; k++) ranks[indexed[k]!.i] = avgRank;
    i = j;
  }
  return ranks;
}

/** Spearman rank correlation = Pearson correlation on ranks. */
function spearmanCorr(a: Float64Array, b: Float64Array): number {
  return pearsonCorr(rankArray(a), rankArray(b));
}

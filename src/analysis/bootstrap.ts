/**
 * Bootstrap resampling for TNA model stability testing.
 * Port of Python tna/bootstrap.py bootstrap_tna().
 * Uses tnaj's computeTransitions3D / computeWeightsFrom3D for R equivalence.
 */
import type { TNA, Matrix } from 'tnaj';
import { computeTransitions3D, computeWeightsFrom3D, createTNA, SeededRNG } from 'tnaj';

export interface BootstrapEdge {
  from: string;
  to: string;
  weight: number;
  pValue: number;
  significant: boolean;
  crLower: number;
  crUpper: number;
  ciLower: number;
  ciUpper: number;
}

export interface BootstrapResult {
  edges: BootstrapEdge[];
  /** Significant-only weights TNA model. */
  model: TNA;
  labels: string[];
  method: string;
  iter: number;
  level: number;
}

export interface BootstrapOptions {
  iter?: number;
  level?: number;
  method?: 'stability' | 'threshold';
  threshold?: number;
  consistencyRange?: [number, number];
  seed?: number;
}

/**
 * Bootstrap a TNA model to assess edge stability.
 * The model must have sequence data (model.data).
 */
export function bootstrapTna(
  model: TNA,
  options: BootstrapOptions = {},
): BootstrapResult {
  const {
    iter = 1000,
    level = 0.05,
    method = 'stability',
    consistencyRange = [0.75, 1.25],
    seed = 42,
  } = options;

  if (!model.data) {
    throw new Error('TNA model must have sequence data for bootstrap');
  }

  const labels = model.labels;
  const a = labels.length;
  const seqData = model.data;
  const n = seqData.length;
  const modelType = model.type;
  const modelScaling = model.scaling.length > 0 ? model.scaling : null;

  // Compute per-sequence 3D transitions
  const trans = computeTransitions3D(seqData, labels, modelType);

  // Compute original weights from 3D transitions
  const weights = computeWeightsFrom3D(trans, modelType, modelScaling);

  // Default threshold: 10th percentile of weights
  let threshold = options.threshold;
  if (threshold === undefined) {
    const allW: number[] = [];
    for (let i = 0; i < a; i++) {
      for (let j = 0; j < a; j++) {
        allW.push(weights.get(i, j));
      }
    }
    allW.sort((a, b) => a - b);
    const p10Idx = Math.floor(allW.length * 0.1);
    threshold = allW[p10Idx] ?? 0;
  }

  const rng = new SeededRNG(seed);

  // Bootstrap accumulators
  const pCounts = new Float64Array(a * a);
  const bootSums = new Float64Array(a * a);
  const bootSqSums = new Float64Array(a * a);

  // For CI: store all bootstrap weight values per edge
  const bootWeights: Float64Array[] = [];
  for (let i = 0; i < a * a; i++) {
    bootWeights.push(new Float64Array(iter));
  }

  for (let it = 0; it < iter; it++) {
    // Resample indices with replacement
    const bootIdx = rng.choice(n, n);

    const transBoot: Matrix[] = [];
    for (let i = 0; i < n; i++) {
      transBoot.push(trans[bootIdx[i]!]!);
    }

    const wBoot = computeWeightsFrom3D(transBoot, modelType, modelScaling);

    for (let i = 0; i < a; i++) {
      for (let j = 0; j < a; j++) {
        const idx = i * a + j;
        const wb = wBoot.get(i, j);
        const wo = weights.get(i, j);

        bootWeights[idx]![it] = wb;
        bootSums[idx] += wb;
        bootSqSums[idx] += wb * wb;

        if (method === 'stability') {
          // Count if bootstrap weight falls outside consistency range
          if (wb <= wo * consistencyRange[0] || wb >= wo * consistencyRange[1]) {
            pCounts[idx]++;
          }
        } else {
          // threshold method: count if below threshold
          if (wb < threshold!) {
            pCounts[idx]++;
          }
        }
      }
    }
  }

  // P-values: (count + 1) / (iter + 1)
  const pValues = new Float64Array(a * a);
  for (let i = 0; i < a * a; i++) {
    pValues[i] = (pCounts[i]! + 1) / (iter + 1);
  }

  // Confidence intervals
  const ciLower = new Float64Array(a * a);
  const ciUpper = new Float64Array(a * a);
  const halfLevel = level / 2;
  for (let idx = 0; idx < a * a; idx++) {
    const sorted = Float64Array.from(bootWeights[idx]!).sort();
    const loIdx = Math.floor(sorted.length * halfLevel);
    const hiIdx = Math.floor(sorted.length * (1 - halfLevel));
    ciLower[idx] = sorted[loIdx]!;
    ciUpper[idx] = sorted[Math.min(hiIdx, sorted.length - 1)]!;
  }

  // Build edge stats (column-major to match R ordering)
  const edges: BootstrapEdge[] = [];
  for (let j = 0; j < a; j++) {
    for (let i = 0; i < a; i++) {
      const idx = i * a + j;
      const w = weights.get(i, j);
      if (w <= 0) continue; // Only report non-zero edges
      edges.push({
        from: labels[i]!,
        to: labels[j]!,
        weight: w,
        pValue: pValues[idx]!,
        significant: pValues[idx]! < level,
        crLower: w * consistencyRange[0],
        crUpper: w * consistencyRange[1],
        ciLower: ciLower[idx]!,
        ciUpper: ciUpper[idx]!,
      });
    }
  }

  // Build pruned model with significant-only weights
  const sigWeightsData = new Float64Array(a * a);
  for (let i = 0; i < a; i++) {
    for (let j = 0; j < a; j++) {
      const idx = i * a + j;
      sigWeightsData[idx] = pValues[idx]! < level ? weights.get(i, j) : 0;
    }
  }

  // Create a Matrix-compatible object
  // Since we can't easily construct a Matrix from Float64Array without the class,
  // we'll use createTNA with the weights as a 2D array
  const sigWeights2D: number[][] = [];
  for (let i = 0; i < a; i++) {
    const row: number[] = [];
    for (let j = 0; j < a; j++) {
      row.push(sigWeightsData[i * a + j]!);
    }
    sigWeights2D.push(row);
  }

  const sigModel = createTNA(
    // We pass the 2D array - createTNA expects a Matrix but we can construct via buildModel
    // Actually, let's use the fromMatrix approach
    weights, // Use original weights placeholder, we'll fix after
    model.inits,
    labels,
    model.data,
    model.type,
    model.scaling,
  );

  // Override the weights with significant-only values
  // Since TNA.weights is a Matrix, we need to set individual cells
  for (let i = 0; i < a; i++) {
    for (let j = 0; j < a; j++) {
      sigModel.weights.set(i, j, sigWeightsData[i * a + j]!);
    }
  }

  return {
    edges,
    model: sigModel,
    labels,
    method,
    iter,
    level,
  };
}

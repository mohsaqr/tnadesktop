import { describe, it, expect } from 'vitest';
import { buildModel } from 'tnaj';
import {
  reliabilityAnalysis,
  compareWeightMatrices,
  RELIABILITY_METRICS,
} from '../analysis/reliability';
import { makeTNAFromSequences, SAMPLE_SEQUENCES } from './helpers';

// ── R equivalence (reference values from R tna:::compare_) ──────────────────

describe('R numerical equivalence', () => {
  // Same matrices used in the R reference run (byrow=TRUE in R)
  const A_2D = [
    [0,   0.6, 0.4],
    [0.3, 0,   0.7],
    [0.5, 0.5, 0  ],
  ];
  const B_2D = [
    [0,   0.4, 0.6],
    [0.5, 0,   0.5],
    [0.3, 0.7, 0  ],
  ];
  const modelA = buildModel(A_2D, { type: 'matrix', labels: ['A', 'B', 'C'] });
  const modelB = buildModel(B_2D, { type: 'matrix', labels: ['A', 'B', 'C'] });

  // Reference values produced by: tna:::compare_(A, B, scaling='none')$summary_metrics
  const R_REF: Record<string, number> = {
    mad:        0.1333333333,
    median_ad:  0.2000000000,
    rmsd:       0.1632993162,
    max_ad:     0.2000000000,
    rel_mad:    0.4000000000,
    cv_ratio:   1.0000000000,
    pearson:    0.8000000000,
    spearman:   0.6260869565,
    kendall:    0.5312500000,
    dcor:       0.7834224599,
    euclidean:  0.4898979486,
    manhattan:  1.2000000000,
    canberra:   1.2333333333,
    braycurtis: 0.2000000000,
    frobenius:  0.4000000000,
    cosine:     0.9250000000,
    jaccard:    0.6666666667,
    dice:       0.8000000000,
    overlap:    0.8000000000,
    rv:         0.9748163694,
    rank_agree: 0.6666666667,
    sign_agree: 1.0000000000,
  };

  it('all 22 metrics match R tna:::compare_ to within 1e-6', () => {
    const result = compareWeightMatrices(modelA, modelB);
    for (const [key, rVal] of Object.entries(R_REF)) {
      const tsVal = result[key];
      expect(tsVal, `metric '${key}'`).toBeDefined();
      expect(Math.abs(tsVal! - rVal), `metric '${key}' diff`)
        .toBeLessThan(1e-6);
    }
  });
});

// ── compareWeightMatrices ────────────────────────────────────────────────────

describe('compareWeightMatrices', () => {
  const model = makeTNAFromSequences(SAMPLE_SEQUENCES, 'relative');

  it('returns all 22 metrics when comparing a model to itself', () => {
    const result = compareWeightMatrices(model, model);
    expect(Object.keys(result)).toHaveLength(RELIABILITY_METRICS.length);
  });

  it('deviations are zero when comparing identical models', () => {
    const result = compareWeightMatrices(model, model);
    expect(result['mad']).toBeCloseTo(0, 10);
    expect(result['rmsd']).toBeCloseTo(0, 10);
    expect(result['max_ad']).toBeCloseTo(0, 10);
    expect(result['euclidean']).toBeCloseTo(0, 10);
    expect(result['frobenius']).toBeCloseTo(0, 10);
  });

  it('correlations are 1 (or NaN) when comparing identical models', () => {
    const result = compareWeightMatrices(model, model);
    // Pearson/Spearman of x with itself = 1 (unless all-zero = NaN)
    if (!isNaN(result['pearson']!)) expect(result['pearson']).toBeCloseTo(1, 5);
    if (!isNaN(result['spearman']!)) expect(result['spearman']).toBeCloseTo(1, 5);
  });

  it('similarities are 1 when comparing identical non-zero models', () => {
    const result = compareWeightMatrices(model, model);
    if (!isNaN(result['cosine']!)) expect(result['cosine']).toBeCloseTo(1, 5);
    if (!isNaN(result['jaccard']!)) expect(result['jaccard']).toBeCloseTo(1, 5);
  });

  it('rank_agree is in [0,1] when comparing identical models', () => {
    const result = compareWeightMatrices(model, model);
    // Kendall tau with ties can be < 1 even for identical arrays
    if (!isNaN(result['rank_agree']!)) {
      expect(result['rank_agree']).toBeGreaterThanOrEqual(0);
      expect(result['rank_agree']).toBeLessThanOrEqual(1.0001);
    }
  });

  it('returns all-NaN when alphabet sizes differ', () => {
    const small = makeTNAFromSequences([['A', 'B']], 'relative');
    const large = makeTNAFromSequences([['A', 'B', 'C']], 'relative');
    const result = compareWeightMatrices(small, large);
    for (const m of RELIABILITY_METRICS) {
      expect(isNaN(result[m.key]!)).toBe(true);
    }
  });

  it('metric keys match RELIABILITY_METRICS keys exactly', () => {
    const result = compareWeightMatrices(model, model);
    for (const m of RELIABILITY_METRICS) {
      expect(m.key in result).toBe(true);
    }
  });
});

// ── reliabilityAnalysis ──────────────────────────────────────────────────────

describe('reliabilityAnalysis', () => {
  const data = SAMPLE_SEQUENCES; // 10 sequences

  it('returns the correct number of iterations per metric', () => {
    const result = reliabilityAnalysis(data, 'tna', { iter: 5, seed: 1 });
    for (const m of RELIABILITY_METRICS) {
      expect(result.iterations[m.key]).toHaveLength(5);
    }
  });

  it('summary contains 22 rows', () => {
    const result = reliabilityAnalysis(data, 'tna', { iter: 5, seed: 1 });
    expect(result.summary).toHaveLength(22);
  });

  it('summary rows have expected fields', () => {
    const result = reliabilityAnalysis(data, 'tna', { iter: 5, seed: 1 });
    for (const row of result.summary) {
      expect(typeof row.metric).toBe('string');
      expect(typeof row.category).toBe('string');
      expect(typeof row.mean).toBe('number');
      expect(typeof row.sd).toBe('number');
      expect(typeof row.median).toBe('number');
      expect(typeof row.min).toBe('number');
      expect(typeof row.max).toBe('number');
      expect(typeof row.q25).toBe('number');
      expect(typeof row.q75).toBe('number');
    }
  });

  it('result preserves iter and split parameters', () => {
    const result = reliabilityAnalysis(data, 'tna', { iter: 7, split: 0.6, seed: 99 });
    expect(result.iter).toBe(7);
    expect(result.split).toBe(0.6);
    expect(result.modelType).toBe('tna');
  });

  it('is deterministic with the same seed', () => {
    const r1 = reliabilityAnalysis(data, 'tna', { iter: 5, seed: 42 });
    const r2 = reliabilityAnalysis(data, 'tna', { iter: 5, seed: 42 });
    for (const m of RELIABILITY_METRICS) {
      expect(r1.iterations[m.key]).toEqual(r2.iterations[m.key]);
    }
  });

  it('produces different results with different seeds', () => {
    const r1 = reliabilityAnalysis(data, 'tna', { iter: 5, seed: 1 });
    const r2 = reliabilityAnalysis(data, 'tna', { iter: 5, seed: 9999 });
    // Iteration values should differ across most metrics
    const pearsonVals1 = r1.iterations['pearson']!;
    const pearsonVals2 = r2.iterations['pearson']!;
    const allSame = pearsonVals1.every((v, i) => v === pearsonVals2[i]);
    expect(allSame).toBe(false);
  });

  it('correlations are in [-1, 1] (excluding NaN)', () => {
    const result = reliabilityAnalysis(data, 'tna', { iter: 10, seed: 42 });
    for (const key of ['pearson', 'spearman', 'kendall', 'dcor']) {
      const vals = result.iterations[key]!.filter(v => isFinite(v));
      for (const v of vals) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1.0001); // dcor in [0,1]
      }
    }
  });

  it('similarities are in [0, 1] (excluding NaN)', () => {
    const result = reliabilityAnalysis(data, 'tna', { iter: 10, seed: 42 });
    for (const key of ['cosine', 'jaccard', 'dice', 'overlap', 'rv']) {
      const vals = result.iterations[key]!.filter(v => isFinite(v));
      for (const v of vals) {
        expect(v).toBeGreaterThanOrEqual(-0.0001);
        expect(v).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('deviations are non-negative (excluding NaN)', () => {
    const result = reliabilityAnalysis(data, 'tna', { iter: 10, seed: 42 });
    for (const key of ['mad', 'median_ad', 'rmsd', 'max_ad', 'rel_mad']) {
      const vals = result.iterations[key]!.filter(v => isFinite(v));
      for (const v of vals) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('rank_agree is in [0, 1] (excluding NaN)', () => {
    const result = reliabilityAnalysis(data, 'tna', { iter: 10, seed: 42 });
    const vals = result.iterations['rank_agree']!.filter(v => isFinite(v));
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.0001);
    }
  });

  it('sign_agree is in [0, 1] (excluding NaN)', () => {
    const result = reliabilityAnalysis(data, 'tna', { iter: 10, seed: 42 });
    const vals = result.iterations['sign_agree']!.filter(v => isFinite(v));
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.0001);
    }
  });

  it('throws with fewer than 4 sequences', () => {
    const tiny = [['A', 'B'], ['B', 'A'], ['A', 'A']];
    expect(() => reliabilityAnalysis(tiny as any, 'tna')).toThrow();
  });

  it('works with ftna model type', () => {
    expect(() =>
      reliabilityAnalysis(data, 'ftna', { iter: 3, seed: 1 }),
    ).not.toThrow();
  });

  it('summary mean is within [min, max]', () => {
    const result = reliabilityAnalysis(data, 'tna', { iter: 10, seed: 42 });
    for (const row of result.summary) {
      if (!isFinite(row.mean) || !isFinite(row.min) || !isFinite(row.max)) continue;
      expect(row.mean).toBeGreaterThanOrEqual(row.min - 1e-9);
      expect(row.mean).toBeLessThanOrEqual(row.max + 1e-9);
    }
  });

  it('RELIABILITY_METRICS has exactly 22 entries', () => {
    expect(RELIABILITY_METRICS).toHaveLength(22);
  });

  it('all 5 categories are represented in RELIABILITY_METRICS', () => {
    const cats = new Set(RELIABILITY_METRICS.map(m => m.category));
    expect(cats.has('Deviations')).toBe(true);
    expect(cats.has('Correlations')).toBe(true);
    expect(cats.has('Dissimilarities')).toBe(true);
    expect(cats.has('Similarities')).toBe(true);
    expect(cats.has('Pattern')).toBe(true);
  });
});

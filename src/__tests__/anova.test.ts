import { describe, it, expect } from 'vitest';
import { oneWayAnova, kruskalWallis, postHocPairwise } from '../analysis/anova';
import type { GroupData } from '../analysis/anova';

// R ground truth dataset:
// g1 <- c(2.1, 3.4, 2.8, 3.1, 2.5)
// g2 <- c(5.2, 4.8, 5.5, 4.9, 5.1)
// g3 <- c(3.5, 3.8, 4.1, 3.2, 3.9)
const groups: GroupData[] = [
  { label: 'A', values: [2.1, 3.4, 2.8, 3.1, 2.5] },
  { label: 'B', values: [5.2, 4.8, 5.5, 4.9, 5.1] },
  { label: 'C', values: [3.5, 3.8, 4.1, 3.2, 3.9] },
];

describe('oneWayAnova', () => {
  it('matches R aov() F-statistic and p-value', () => {
    const result = oneWayAnova(groups);
    // R: F = 44.7965, df1 = 2, df2 = 12, p = 2.715844e-06, eta² = 0.8818816
    expect(result.statistic).toBeCloseTo(44.7965, 2);
    expect(result.df1).toBe(2);
    expect(result.df2).toBe(12);
    expect(result.pValue).toBeCloseTo(2.715844e-06, 8);
    expect(result.effectSize).toBeCloseTo(0.8818816, 4);
    expect(result.method).toBe('anova');
    expect(result.effectLabel).toBe('η²');
  });

  it('returns p=1 for identical groups', () => {
    const same: GroupData[] = [
      { label: 'A', values: [1, 1, 1] },
      { label: 'B', values: [1, 1, 1] },
    ];
    const result = oneWayAnova(same);
    expect(result.statistic).toBe(0);
    expect(result.pValue).toBe(1);
  });

  it('handles 2-group case', () => {
    const twoGroups: GroupData[] = [
      { label: 'A', values: [2.1, 3.4, 2.8, 3.1, 2.5] },
      { label: 'B', values: [5.2, 4.8, 5.5, 4.9, 5.1] },
    ];
    const result = oneWayAnova(twoGroups);
    expect(result.df1).toBe(1);
    expect(result.df2).toBe(8);
    expect(result.pValue).toBeLessThan(0.001);
  });
});

describe('kruskalWallis', () => {
  it('matches R kruskal.test() H-statistic and p-value', () => {
    const result = kruskalWallis(groups);
    // R: H = 12.02, df = 2, p = 0.002454088
    expect(result.statistic).toBeCloseTo(12.02, 1);
    expect(result.df1).toBe(2);
    expect(result.pValue).toBeCloseTo(0.002454088, 4);
    expect(result.method).toBe('kruskal');
    expect(result.effectLabel).toBe('ε²');
  });

  it('handles tied values', () => {
    const tied: GroupData[] = [
      { label: 'A', values: [1, 1, 2, 3] },
      { label: 'B', values: [4, 5, 5, 6] },
    ];
    const result = kruskalWallis(tied);
    expect(result.pValue).toBeLessThan(0.05);
  });
});

describe('postHocPairwise — parametric (Welch t-test)', () => {
  it('Bonferroni-adjusted p-values match R pairwise.t.test(pool.sd=FALSE)', () => {
    const results = postHocPairwise(groups, true, 'bonferroni', 0.05);
    expect(results).toHaveLength(3); // C(3,2) = 3 pairs

    // R: A vs B Bonferroni p = 0.000273482
    const ab = results.find(r => r.groupA === 'A' && r.groupB === 'B')!;
    expect(ab.pValue).toBeCloseTo(0.000273482, 4);
    expect(ab.significant).toBe(true);

    // R: A vs C Bonferroni p = 0.036728249
    const ac = results.find(r => r.groupA === 'A' && r.groupB === 'C')!;
    expect(ac.pValue).toBeCloseTo(0.036728249, 3);
    expect(ac.significant).toBe(true);

    // R: B vs C Bonferroni p = 0.000451336
    const bc = results.find(r => r.groupA === 'B' && r.groupB === 'C')!;
    expect(bc.pValue).toBeCloseTo(0.0004513364, 4);
    expect(bc.significant).toBe(true);
  });

  it('Holm-adjusted p-values match R', () => {
    const results = postHocPairwise(groups, true, 'holm', 0.05);

    // R: A vs B Holm p = 0.000273482
    const ab = results.find(r => r.groupA === 'A' && r.groupB === 'B')!;
    expect(ab.pValue).toBeCloseTo(0.000273482, 4);

    // R: A vs C Holm p = 0.012242750
    const ac = results.find(r => r.groupA === 'A' && r.groupB === 'C')!;
    expect(ac.pValue).toBeCloseTo(0.012242750, 4);

    // R: B vs C Holm p = 0.000300891
    const bc = results.find(r => r.groupA === 'B' && r.groupB === 'C')!;
    expect(bc.pValue).toBeCloseTo(0.000300891, 4);
  });

  it('FDR-adjusted p-values match R', () => {
    const results = postHocPairwise(groups, true, 'fdr', 0.05);

    // R: A vs B FDR p = 0.0002256682
    const ab = results.find(r => r.groupA === 'A' && r.groupB === 'B')!;
    expect(ab.pValue).toBeCloseTo(0.0002256682, 4);

    // R: A vs C FDR p = 0.0122427495
    const ac = results.find(r => r.groupA === 'A' && r.groupB === 'C')!;
    expect(ac.pValue).toBeCloseTo(0.0122427495, 4);

    // R: B vs C FDR p = 0.0002256682
    const bc = results.find(r => r.groupA === 'B' && r.groupB === 'C')!;
    expect(bc.pValue).toBeCloseTo(0.0002256682, 4);
  });
});

describe('postHocPairwise — non-parametric (Mann-Whitney)', () => {
  it('Bonferroni-adjusted p-values are in reasonable range', () => {
    const results = postHocPairwise(groups, false, 'bonferroni', 0.05);
    expect(results).toHaveLength(3);

    // R: A vs B Bonferroni p = 0.02380952
    const ab = results.find(r => r.groupA === 'A' && r.groupB === 'B')!;
    expect(ab.pValue).toBeCloseTo(0.02380952, 1);

    // All should be significant at 0.05
    for (const r of results) {
      expect(r.pValue).toBeLessThan(0.06);
    }
  });
});

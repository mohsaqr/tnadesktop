import { describe, it, expect } from 'vitest';
import { lgamma, gammaP, chiSqCDF, fDistCDF, tDistCDF, normalCDF, betaI } from '../analysis/stats-utils';

describe('lgamma', () => {
  it('lgamma(1) = 0', () => {
    expect(lgamma(1)).toBeCloseTo(0, 10);
  });

  it('lgamma(0.5) = ln(sqrt(pi))', () => {
    expect(lgamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 8);
  });

  it('lgamma(5) = ln(24)', () => {
    expect(lgamma(5)).toBeCloseTo(Math.log(24), 8);
  });
});

describe('gammaP', () => {
  it('P(1, 1) ≈ 1 - e^-1', () => {
    expect(gammaP(1, 1)).toBeCloseTo(1 - Math.exp(-1), 10);
  });

  it('P(a, 0) = 0', () => {
    expect(gammaP(2, 0)).toBe(0);
  });
});

describe('chiSqCDF', () => {
  // R: pchisq(3.841, 1) ≈ 0.95
  it('chi-sq CDF at 3.841, df=1 ≈ 0.95', () => {
    expect(chiSqCDF(3.841, 1)).toBeCloseTo(0.95, 2);
  });

  // R: pchisq(5.991, 2) ≈ 0.95
  it('chi-sq CDF at 5.991, df=2 ≈ 0.95', () => {
    expect(chiSqCDF(5.991, 2)).toBeCloseTo(0.95, 2);
  });
});

describe('betaI', () => {
  it('betaI(0, a, b) = 0', () => {
    expect(betaI(0, 2, 3)).toBe(0);
  });

  it('betaI(1, a, b) = 1', () => {
    expect(betaI(1, 2, 3)).toBe(1);
  });

  // R: pbeta(0.5, 2, 3) ≈ 0.6875
  it('betaI(0.5, 2, 3) ≈ 0.6875', () => {
    expect(betaI(0.5, 2, 3)).toBeCloseTo(0.6875, 4);
  });
});

describe('fDistCDF', () => {
  // R: pf(44.7965, 2, 12) ≈ 0.999997284
  it('fDistCDF matches R pf()', () => {
    const p = fDistCDF(44.7965, 2, 12);
    expect(p).toBeCloseTo(1 - 2.715844e-06, 6);
  });

  it('fDistCDF(0, d1, d2) = 0', () => {
    expect(fDistCDF(0, 2, 12)).toBe(0);
  });
});

describe('tDistCDF', () => {
  // R: pt(0, 10) = 0.5
  it('tDistCDF(0, df) = 0.5', () => {
    expect(tDistCDF(0, 10)).toBeCloseTo(0.5, 10);
  });

  // R: pt(2.228, 10) ≈ 0.975
  it('tDistCDF(2.228, 10) ≈ 0.975', () => {
    expect(tDistCDF(2.228, 10)).toBeCloseTo(0.975, 2);
  });

  // Symmetric
  it('tDistCDF(-t, df) + tDistCDF(t, df) ≈ 1', () => {
    const t = 1.5;
    const df = 8;
    expect(tDistCDF(t, df) + tDistCDF(-t, df)).toBeCloseTo(1, 8);
  });
});

describe('normalCDF', () => {
  it('normalCDF(0) = 0.5', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 6);
  });

  // R: pnorm(1.96) ≈ 0.975
  it('normalCDF(1.96) ≈ 0.975', () => {
    expect(normalCDF(1.96)).toBeCloseTo(0.975, 2);
  });

  // R: pnorm(-1.96) ≈ 0.025
  it('normalCDF(-1.96) ≈ 0.025', () => {
    expect(normalCDF(-1.96)).toBeCloseTo(0.025, 2);
  });
});

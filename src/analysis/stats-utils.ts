/**
 * Shared statistical distribution functions.
 *
 * Extracted from mosaic.ts and extended with F, t, and normal CDFs
 * needed for ANOVA, post-hoc tests, and Kruskal-Wallis.
 */

/** Log-gamma via Lanczos approximation. */
export function lgamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) { y += 1; ser += c[j]! / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/** Regularized lower incomplete gamma P(a,x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = 1 / a;
    for (let n = 0; n < 200; n++) {
      ap += 1; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  let b = x + 1 - a, c2 = 1e30, d = 1 / b, h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-30) d = 1e-30;
    c2 = b + an / c2; if (Math.abs(c2) < 1e-30) c2 = 1e-30;
    d = 1 / d; const del = d * c2; h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - h * Math.exp(-x + a * Math.log(x) - lgamma(a));
}

/** Chi-square CDF: P(X <= x) for X ~ chi-sq(df). */
export function chiSqCDF(x: number, df: number): number {
  if (x <= 0 || df <= 0) return 0;
  return gammaP(df / 2, x / 2);
}

/**
 * Regularized incomplete beta function I_x(a, b).
 * Uses continued fraction from Numerical Recipes (3rd ed, section 6.4).
 */
export function betaI(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta);

  // Use reflection for numerical stability
  if (x < (a + 1) / (a + b + 2)) {
    return front * betaCF(x, a, b) / a;
  }
  return 1 - front * betaCF(1 - x, b, a) / b;
}

/**
 * Continued fraction for the incomplete beta function.
 * Numerical Recipes betacf() — modified Lentz's method.
 * c and d are independent convergent trackers; h accumulates the product.
 */
function betaCF(x: number, a: number, b: number): number {
  const maxIter = 200;
  const eps = 3e-14;
  const fpmin = 1e-30;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;

    // Even step: a_{2m} = m(b-m)x / ((a+2m-1)(a+2m))
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < fpmin) d = fpmin; d = 1 / d;
    c = 1 + aa / c; if (Math.abs(c) < fpmin) c = fpmin;
    h *= d * c;

    // Odd step: a_{2m+1} = -(a+m)(a+b+m)x / ((a+2m)(a+2m+1))
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < fpmin) d = fpmin; d = 1 / d;
    c = 1 + aa / c; if (Math.abs(c) < fpmin) c = fpmin;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < eps) break;
  }

  return h;
}

/** F-distribution CDF: P(X <= x) for X ~ F(d1, d2). */
export function fDistCDF(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  const z = (d1 * x) / (d1 * x + d2);
  return betaI(z, d1 / 2, d2 / 2);
}

/** Student's t CDF: P(T <= t) for T ~ t(df). */
export function tDistCDF(t: number, df: number): number {
  const x = df / (df + t * t);
  const ib = betaI(x, df / 2, 0.5);
  if (t >= 0) {
    return 1 - 0.5 * ib;
  }
  return 0.5 * ib;
}

/** Standard normal CDF: P(Z <= z) via Abramowitz & Stegun approximation. */
export function normalCDF(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;

  const t = z / Math.SQRT2;
  return 0.5 * (1 + erf(t));
}

/** Error function via Horner form (max error ~1.5e-7). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);

  // Abramowitz & Stegun 7.1.26
  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;

  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

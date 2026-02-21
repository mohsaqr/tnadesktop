/**
 * Numerical equivalence check: TS reliability metrics vs R tna:::compare_ reference values.
 * Run with: npx tsx tmp/equiv_check.ts
 */
import { buildModel } from 'tnaj';
import { compareWeightMatrices } from '../src/analysis/reliability';

// Same matrices used in the R check (row-major definition)
// A[i][j] set by byrow=TRUE in R
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

const result = compareWeightMatrices(modelA, modelB);

// R reference values (from check_compare.R output)
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

const TOL = 1e-6;
let allPass = true;

console.log('\n=== Numerical Equivalence: TypeScript vs R ===\n');
console.log(String('Metric').padEnd(20), String('TS Value').padEnd(18), String('R Value').padEnd(18), 'Pass?');
console.log('-'.repeat(70));

for (const [key, rVal] of Object.entries(R_REF)) {
  const tsVal = result[key];
  if (tsVal === undefined) {
    console.log(key.padEnd(20), 'MISSING'.padEnd(18), String(rVal.toFixed(10)).padEnd(18), 'FAIL');
    allPass = false;
    continue;
  }
  const diff = Math.abs(tsVal - rVal);
  const pass = diff < TOL;
  if (!pass) allPass = false;
  const status = pass ? 'OK' : `FAIL (diff=${diff.toFixed(8)})`;
  console.log(key.padEnd(20), String(tsVal.toFixed(10)).padEnd(18), String(rVal.toFixed(10)).padEnd(18), status);
}

console.log('\n' + (allPass ? '✓ ALL METRICS MATCH R (tol 1e-6)' : '✗ SOME METRICS DIVERGE — fix required'));
process.exit(allPass ? 0 : 1);

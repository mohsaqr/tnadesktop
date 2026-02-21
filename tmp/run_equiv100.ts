/**
 * Read the 100 R-generated datasets from tmp/equiv100.json,
 * run compareWeightMatrices() on each, and report max abs diff per metric.
 */
import * as fs from 'fs';
import { buildModel } from 'tnaj';
import { compareWeightMatrices, RELIABILITY_METRICS } from '../src/analysis/reliability';

const raw = JSON.parse(fs.readFileSync('tmp/equiv100.json', 'utf8')) as Array<{
  seed: number;
  n_states: number;
  labels: string[];
  weights_a: number[];
  weights_b: number[];
  r_metrics: Record<string, number>;
}>;

// column-major flat vector → row-major 2D array
function flatToMatrix(flat: number[], n: number): number[][] {
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let k = 0; k < flat.length; k++) {
    const row = k % n;
    const col = Math.floor(k / n);
    m[row]![col] = flat[k]!;
  }
  return m;
}

const maxDiff: Record<string, number> = {};
const nanCount: Record<string, number> = {};
for (const m of RELIABILITY_METRICS) { maxDiff[m.key] = 0; nanCount[m.key] = 0; }

for (const entry of raw) {
  const { n_states, labels, weights_a, weights_b, r_metrics } = entry;
  const matA = flatToMatrix(weights_a, n_states);
  const matB = flatToMatrix(weights_b, n_states);

  const mA = buildModel(matA, { type: 'matrix', labels });
  const mB = buildModel(matB, { type: 'matrix', labels });

  const ts = compareWeightMatrices(mA, mB);

  for (const m of RELIABILITY_METRICS) {
    const rVal = r_metrics[m.key];
    const tVal = ts[m.key];
    if (rVal === undefined || tVal === undefined) continue;
    if (!isFinite(rVal) || !isFinite(tVal)) { nanCount[m.key]!++; continue; }
    const diff = Math.abs(tVal - rVal);
    if (diff > maxDiff[m.key]!) maxDiff[m.key] = diff;
  }
}

const TOL = 1e-9;
let allPass = true;

console.log('\n=== 100-dataset equivalence: TypeScript vs R tna:::compare_() ===\n');
console.log(
  'Metric'.padEnd(26),
  'Max |TS−R|'.padStart(14),
  'NaN skips'.padStart(10),
  'Pass?'.padStart(8),
);
console.log('-'.repeat(62));

for (const m of RELIABILITY_METRICS) {
  const d   = maxDiff[m.key]!;
  const nan = nanCount[m.key]!;
  const pass = d < TOL;
  if (!pass) allPass = false;
  console.log(
    m.label.padEnd(26),
    d.toExponential(3).padStart(14),
    String(nan).padStart(10),
    (pass ? 'OK' : `FAIL`).padStart(8),
  );
}

console.log('\n' + (allPass
  ? '✓ ALL 22 METRICS MATCH R across 100 datasets (tol 1e-9)'
  : '✗ DIVERGENCE DETECTED — fix required'));
process.exit(allPass ? 0 : 1);

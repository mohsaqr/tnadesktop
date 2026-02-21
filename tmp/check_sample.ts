import { reliabilityAnalysis } from '../src/analysis/reliability';

const SAMPLE_SEQUENCES = [
  ['A','B','C','A','B'],
  ['B','C','A','B','C'],
  ['A','C','B','A','C'],
  ['C','A','B','C','A'],
  ['A','B','A','C','B'],
  ['B','A','C','B','A'],
  ['C','B','A','C','B'],
  ['A','C','A','B','C'],
  ['B','C','B','A','C'],
  ['C','A','C','B','A'],
] as [string, ...string[]][];

const r = reliabilityAnalysis(SAMPLE_SEQUENCES, 'tna', { iter: 100, split: 0.5, seed: 42 });
console.log('\n=== Sample Data (10 seqs, split=0.5, 100 iter) ===');
for (const row of r.summary) {
  const meanStr = isFinite(row.mean) ? row.mean.toFixed(4) : 'NaN    ';
  const sdStr   = isFinite(row.sd)   ? row.sd.toFixed(4)   : 'NaN   ';
  console.log(`${row.category.padEnd(16)} ${row.metric.padEnd(22)} mean=${meanStr}  sd=${sdStr}`);
}

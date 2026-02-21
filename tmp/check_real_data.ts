/**
 * Verify reliability analysis using the real group regulation CSV.
 * Columns: Actor(0), Achiever(1), Group(2), Course(3), Time(4), Action(5)
 * Sequences: grouped by Actor, sorted by Time, state = Action
 */
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import { longToSequences } from '../src/data';
import { reliabilityAnalysis } from '../src/analysis/reliability';

const csvPath = path.resolve('src/sample-data.csv');
const raw = fs.readFileSync(csvPath, 'utf8');

const parsed = Papa.parse<string[]>(raw, { header: false, skipEmptyLines: true });
const allRows = parsed.data as string[][];
const header = allRows[0]!;
console.log('Columns:', header.join(', '));

const rows = allRows.slice(1); // skip header
console.log(`Total data rows: ${rows.length}`);

// Actor=0, Time=4, Action=5, no group split
const { sequences } = longToSequences(rows, 0, 4, 5, -1);
console.log(`Sequences: ${sequences.length}`);
console.log(`States: ${[...new Set(sequences.flat())].sort().join(', ')}`);
console.log(`Avg sequence length: ${(sequences.reduce((s, q) => s + q.length, 0) / sequences.length).toFixed(1)}`);

// Run reliability
console.log('\nRunning reliability (100 iter, split=0.5)...');
const r = reliabilityAnalysis(sequences, 'tna', { iter: 100, split: 0.5, seed: 42 });

console.log('\n=== Reliability Results (real data) ===');
console.log(`${'Category'.padEnd(16)} ${'Metric'.padEnd(22)} ${'Mean'.padStart(8)} ${'SD'.padStart(8)} ${'Min'.padStart(8)} ${'Max'.padStart(8)}`);
console.log('-'.repeat(72));
for (const row of r.summary) {
  const fmt = (v: number) => isFinite(v) ? v.toFixed(4).padStart(8) : '     NaN';
  console.log(`${row.category.padEnd(16)} ${row.metric.padEnd(22)} ${fmt(row.mean)} ${fmt(row.sd)} ${fmt(row.min)} ${fmt(row.max)}`);
}

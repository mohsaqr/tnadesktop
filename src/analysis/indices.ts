/**
 * Per-sequence index computation: entropy, diversity, complexity, etc.
 */
import type { SequenceData } from 'tnaj';

export interface SequenceIndex {
  id: number;
  length: number;
  nUniqueStates: number;
  entropy: number;         // Shannon entropy of state distribution
  normalizedEntropy: number; // entropy / log2(nUniqueStates)
  complexity: number;      // number of state transitions (changes)
  turbulence: number;      // normalized complexity
  selfLoopRate: number;    // fraction of consecutive same-state pairs
}

/**
 * Compute per-sequence indices for all sequences.
 */
export function computeSequenceIndices(data: SequenceData): SequenceIndex[] {
  const results: SequenceIndex[] = [];

  for (let i = 0; i < data.length; i++) {
    const seq = data[i]!.filter(s => s !== null) as string[];
    const n = seq.length;

    if (n === 0) {
      results.push({
        id: i,
        length: 0,
        nUniqueStates: 0,
        entropy: 0,
        normalizedEntropy: 0,
        complexity: 0,
        turbulence: 0,
        selfLoopRate: 0,
      });
      continue;
    }

    // State frequencies
    const freq = new Map<string, number>();
    for (const s of seq) {
      freq.set(s, (freq.get(s) ?? 0) + 1);
    }
    const nUnique = freq.size;

    // Shannon entropy
    let entropy = 0;
    for (const count of freq.values()) {
      const p = count / n;
      if (p > 0) entropy -= p * Math.log2(p);
    }

    const normalizedEntropy = nUnique > 1 ? entropy / Math.log2(nUnique) : 0;

    // Complexity: number of state changes
    let transitions = 0;
    let selfLoops = 0;
    for (let j = 1; j < n; j++) {
      if (seq[j] !== seq[j - 1]) {
        transitions++;
      } else {
        selfLoops++;
      }
    }

    const maxTransitions = n - 1;
    const turbulence = maxTransitions > 0 ? transitions / maxTransitions : 0;
    const selfLoopRate = maxTransitions > 0 ? selfLoops / maxTransitions : 0;

    results.push({
      id: i,
      length: n,
      nUniqueStates: nUnique,
      entropy,
      normalizedEntropy,
      complexity: transitions,
      turbulence,
      selfLoopRate,
    });
  }

  return results;
}

export interface IndicesSummary {
  metric: string;
  mean: number;
  sd: number;
  min: number;
  max: number;
  median: number;
}

/**
 * Compute summary statistics across all sequences for each index.
 */
export function summarizeIndices(indices: SequenceIndex[]): IndicesSummary[] {
  const metrics: { key: keyof SequenceIndex; label: string }[] = [
    { key: 'length', label: 'Sequence Length' },
    { key: 'nUniqueStates', label: 'Unique States' },
    { key: 'entropy', label: 'Shannon Entropy' },
    { key: 'normalizedEntropy', label: 'Normalized Entropy' },
    { key: 'complexity', label: 'Transitions (Changes)' },
    { key: 'turbulence', label: 'Turbulence' },
    { key: 'selfLoopRate', label: 'Self-Loop Rate' },
  ];

  return metrics.map(({ key, label }) => {
    const vals = indices.map(idx => idx[key] as number).sort((a, b) => a - b);
    const n = vals.length;
    const mean = vals.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1 || 1));
    const median = n % 2 === 0
      ? (vals[n / 2 - 1]! + vals[n / 2]!) / 2
      : vals[Math.floor(n / 2)]!;

    return {
      metric: label,
      mean,
      sd,
      min: vals[0]!,
      max: vals[n - 1]!,
      median,
    };
  });
}

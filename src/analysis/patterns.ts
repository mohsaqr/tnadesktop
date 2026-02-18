/**
 * Pattern (n-gram) extraction from sequence data.
 */
import type { SequenceData } from 'tnaj';

export interface PatternResult {
  pattern: string;
  count: number;
  support: number; // fraction of sequences containing this pattern
  frequency: number; // total occurrences / total possible windows
}

export interface PatternOptions {
  minN?: number;
  maxN?: number;
  minCount?: number;
  minSupport?: number;
}

/**
 * Extract n-gram patterns from sequence data.
 */
export function extractPatterns(
  data: SequenceData,
  options: PatternOptions = {},
): PatternResult[] {
  const {
    minN = 2,
    maxN = 3,
    minCount = 2,
    minSupport = 0,
  } = options;

  const patternCounts = new Map<string, number>();
  const patternSeqs = new Map<string, Set<number>>(); // which sequences contain each pattern
  let totalWindows = 0;

  for (let si = 0; si < data.length; si++) {
    const seq = data[si]!.filter(s => s !== null) as string[];

    for (let n = minN; n <= maxN; n++) {
      for (let i = 0; i <= seq.length - n; i++) {
        const gram = seq.slice(i, i + n).join('->');
        patternCounts.set(gram, (patternCounts.get(gram) ?? 0) + 1);
        if (!patternSeqs.has(gram)) patternSeqs.set(gram, new Set());
        patternSeqs.get(gram)!.add(si);
        totalWindows++;
      }
    }
  }

  const nSeqs = data.length;
  const results: PatternResult[] = [];

  for (const [pattern, count] of patternCounts) {
    const support = patternSeqs.get(pattern)!.size / nSeqs;
    if (count < minCount) continue;
    if (support < minSupport) continue;

    results.push({
      pattern,
      count,
      support,
      frequency: totalWindows > 0 ? count / totalWindows : 0,
    });
  }

  results.sort((a, b) => b.count - a.count);
  return results;
}

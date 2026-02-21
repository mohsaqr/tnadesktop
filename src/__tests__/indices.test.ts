import { describe, it, expect } from 'vitest';
import { computeSequenceIndices, summarizeIndices } from '../analysis/indices';
import type { SequenceData } from 'tnaj';

describe('computeSequenceIndices', () => {
  it('uniform distribution has entropy = log2(nUnique)', () => {
    // 4 states each appearing once → entropy = log2(4) = 2
    const data: SequenceData = [['A', 'B', 'C', 'D']];
    const [idx] = computeSequenceIndices(data);
    expect(idx!.entropy).toBeCloseTo(Math.log2(4), 10);
    expect(idx!.normalizedEntropy).toBeCloseTo(1, 10);
  });

  it('single state repeated has entropy=0, turbulence=0, selfLoopRate=1', () => {
    const data: SequenceData = [['A', 'A', 'A', 'A', 'A']];
    const [idx] = computeSequenceIndices(data);
    expect(idx!.entropy).toBe(0);
    expect(idx!.normalizedEntropy).toBe(0);
    expect(idx!.turbulence).toBe(0);
    expect(idx!.selfLoopRate).toBe(1);
    expect(idx!.nUniqueStates).toBe(1);
    // New metrics
    expect(idx!.gini).toBe(0); // single state → no inequality
    expect(idx!.persistence).toBe(5); // whole sequence is one run
    expect(idx!.transitionDiversity).toBe(1); // 1 unique type (A→A) / 1 possible = 1
    expect(idx!.integrativeComplexity).toBe(0); // only one transition type → 1 - 1² = 0
    expect(idx!.routine).toBe(1); // 100% in most frequent state
  });

  it('alternating A,B,A,B has turbulence=1, selfLoopRate=0', () => {
    const data: SequenceData = [['A', 'B', 'A', 'B']];
    const [idx] = computeSequenceIndices(data);
    expect(idx!.turbulence).toBe(1);
    expect(idx!.selfLoopRate).toBe(0);
    expect(idx!.complexity).toBe(3); // 3 transitions, all changes
  });

  it('empty sequence (all null) returns all zeros', () => {
    const data: SequenceData = [[null, null, null]];
    const [idx] = computeSequenceIndices(data);
    expect(idx!.length).toBe(0);
    expect(idx!.nUniqueStates).toBe(0);
    expect(idx!.entropy).toBe(0);
    expect(idx!.turbulence).toBe(0);
    expect(idx!.selfLoopRate).toBe(0);
    expect(idx!.gini).toBe(0);
    expect(idx!.persistence).toBe(0);
    expect(idx!.transitionDiversity).toBe(0);
    expect(idx!.integrativeComplexity).toBe(0);
    expect(idx!.routine).toBe(0);
  });

  it('mixed with nulls filters nulls before computing', () => {
    // Effective sequence: A, B, A
    const data: SequenceData = [['A', null, 'B', null, 'A']];
    const [idx] = computeSequenceIndices(data);
    expect(idx!.length).toBe(3);
    expect(idx!.nUniqueStates).toBe(2);
    expect(idx!.complexity).toBe(2); // A→B, B→A
    expect(idx!.turbulence).toBe(1); // all transitions are changes
  });

  it('computes correct length and unique states', () => {
    const data: SequenceData = [['A', 'B', 'C', 'A', 'B']];
    const [idx] = computeSequenceIndices(data);
    expect(idx!.length).toBe(5);
    expect(idx!.nUniqueStates).toBe(3);
  });

  it('handles multiple sequences', () => {
    const data: SequenceData = [
      ['A', 'B'],
      ['C', 'D', 'E'],
    ];
    const indices = computeSequenceIndices(data);
    expect(indices).toHaveLength(2);
    expect(indices[0]!.length).toBe(2);
    expect(indices[1]!.length).toBe(3);
  });

  it('assigns sequential IDs', () => {
    const data: SequenceData = [['A'], ['B'], ['C']];
    const indices = computeSequenceIndices(data);
    expect(indices[0]!.id).toBe(0);
    expect(indices[1]!.id).toBe(1);
    expect(indices[2]!.id).toBe(2);
  });
});

describe('summarizeIndices', () => {
  it('computes correct mean, SD, min, max, median for known values', () => {
    // 3 sequences with lengths 2, 4, 6
    const data: SequenceData = [
      ['A', 'B'],
      ['A', 'B', 'C', 'D'],
      ['A', 'B', 'C', 'D', 'E', 'F'],
    ];
    const indices = computeSequenceIndices(data);
    const summary = summarizeIndices(indices);

    const lengthSummary = summary.find(s => s.metric === 'Sequence Length')!;
    expect(lengthSummary.mean).toBe(4); // (2+4+6)/3
    expect(lengthSummary.min).toBe(2);
    expect(lengthSummary.max).toBe(6);
    expect(lengthSummary.median).toBe(4);
    // SD with Bessel correction: sqrt(((2-4)^2 + (4-4)^2 + (6-4)^2) / 2) = sqrt(8/2) = 2
    expect(lengthSummary.sd).toBe(2);
  });

  it('single sequence → SD uses (n-1||1) divisor', () => {
    const data: SequenceData = [['A', 'B', 'C']];
    const indices = computeSequenceIndices(data);
    const summary = summarizeIndices(indices);

    const lengthSummary = summary.find(s => s.metric === 'Sequence Length')!;
    expect(lengthSummary.mean).toBe(3);
    // n=1, divisor = max(n-1, 1) = 1
    expect(lengthSummary.sd).toBe(0);
  });

  it('even count gives correct median (average of middle two)', () => {
    const data: SequenceData = [
      ['A', 'B'],       // length 2
      ['A', 'B', 'C'],  // length 3
      ['A', 'B', 'C', 'D'],  // length 4
      ['A', 'B', 'C', 'D', 'E'],  // length 5
    ];
    const indices = computeSequenceIndices(data);
    const summary = summarizeIndices(indices);

    const lengthSummary = summary.find(s => s.metric === 'Sequence Length')!;
    expect(lengthSummary.median).toBe(3.5); // (3+4)/2
  });

  it('odd count gives correct median', () => {
    const data: SequenceData = [
      ['A', 'B'],           // length 2
      ['A', 'B', 'C'],      // length 3
      ['A', 'B', 'C', 'D'], // length 4
    ];
    const indices = computeSequenceIndices(data);
    const summary = summarizeIndices(indices);

    const lengthSummary = summary.find(s => s.metric === 'Sequence Length')!;
    expect(lengthSummary.median).toBe(3);
  });

  it('returns all expected metrics including new ones', () => {
    const data: SequenceData = [['A', 'B', 'C']];
    const indices = computeSequenceIndices(data);
    const summary = summarizeIndices(indices);
    const metricNames = summary.map(s => s.metric);
    expect(metricNames).toContain('Sequence Length');
    expect(metricNames).toContain('Unique States');
    expect(metricNames).toContain('Shannon Entropy');
    expect(metricNames).toContain('Normalized Entropy');
    expect(metricNames).toContain('Transitions (Changes)');
    expect(metricNames).toContain('Turbulence');
    expect(metricNames).toContain('Self-Loop Rate');
    expect(metricNames).toContain('Gini Coefficient');
    expect(metricNames).toContain('State Persistence');
    expect(metricNames).toContain('Transition Diversity');
    expect(metricNames).toContain('Integrative Complexity');
    expect(metricNames).toContain('Routine Index');
  });
});

describe('new sequence indices', () => {
  it('gini: uniform distribution → 0, skewed → positive', () => {
    // Uniform: A,B,C,D each once → gini = 0
    const uniform: SequenceData = [['A', 'B', 'C', 'D']];
    const [u] = computeSequenceIndices(uniform);
    expect(u!.gini).toBe(0);

    // Skewed: A appears 4 times, B once → positive gini
    const skewed: SequenceData = [['A', 'A', 'A', 'A', 'B']];
    const [s] = computeSequenceIndices(skewed);
    expect(s!.gini).toBeGreaterThan(0);
    // Gini = (|4-1| + |1-4|) * 2 / (2 * 2 * 5) = 12/20 = 0.6... let me compute:
    // counts = [1, 4], n=5, nUnique=2
    // sumAbsDiff = |1-1| + |1-4| + |4-1| + |4-4| = 0 + 3 + 3 + 0 = 6
    // gini = 6 / (2 * 2 * 5) = 6/20 = 0.3
    expect(s!.gini).toBeCloseTo(0.3, 10);
  });

  it('persistence: longest run length', () => {
    // A,A,B,B,B → longest run is 3 (B,B,B)
    const data: SequenceData = [['A', 'A', 'B', 'B', 'B']];
    const [idx] = computeSequenceIndices(data);
    expect(idx!.persistence).toBe(3);

    // All different → persistence = 1
    const allDiff: SequenceData = [['A', 'B', 'C', 'D']];
    const [idx2] = computeSequenceIndices(allDiff);
    expect(idx2!.persistence).toBe(1);
  });

  it('transitionDiversity: all unique transitions → high, few → low', () => {
    // A,B,C: transitions A→B, B→C → 2 unique out of 3*3=9 possible
    const data: SequenceData = [['A', 'B', 'C']];
    const [idx] = computeSequenceIndices(data);
    expect(idx!.transitionDiversity).toBeCloseTo(2 / 9, 10);

    // A,B,A,B: transitions A→B, B→A → 2 unique out of 2*2=4 possible
    const alt: SequenceData = [['A', 'B', 'A', 'B']];
    const [idx2] = computeSequenceIndices(alt);
    expect(idx2!.transitionDiversity).toBeCloseTo(2 / 4, 10);
  });

  it('integrativeComplexity: single transition type → 0, diverse → high', () => {
    // A,A,A: only A→A transitions → 1 - 1² = 0
    const data: SequenceData = [['A', 'A', 'A']];
    const [idx] = computeSequenceIndices(data);
    expect(idx!.integrativeComplexity).toBe(0);

    // A,B,C,D: transitions A→B, B→C, C→D → 3 types, each p=1/3
    // 1 - 3*(1/3)² = 1 - 1/3 = 2/3
    const diverse: SequenceData = [['A', 'B', 'C', 'D']];
    const [idx2] = computeSequenceIndices(diverse);
    expect(idx2!.integrativeComplexity).toBeCloseTo(2 / 3, 10);
  });

  it('routine: proportion of most frequent state', () => {
    // A,A,A,B → routine = 3/4 = 0.75
    const data: SequenceData = [['A', 'A', 'A', 'B']];
    const [idx] = computeSequenceIndices(data);
    expect(idx!.routine).toBeCloseTo(0.75, 10);

    // Uniform A,B,C,D → routine = 1/4 = 0.25
    const uniform: SequenceData = [['A', 'B', 'C', 'D']];
    const [idx2] = computeSequenceIndices(uniform);
    expect(idx2!.routine).toBeCloseTo(0.25, 10);
  });
});

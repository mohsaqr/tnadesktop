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

  it('returns all expected metrics', () => {
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
  });
});

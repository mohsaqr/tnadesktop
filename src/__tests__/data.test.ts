import { describe, it, expect } from 'vitest';
import {
  detectFormat,
  parseTimestamp,
  guessColumns,
  wideToSequences,
  longToSequences,
  guessEdgeListColumns,
  edgeListToMatrix,
} from '../data';

// ═══════════════════════════════════════════════════════════
//  detectFormat
// ═══════════════════════════════════════════════════════════
describe('detectFormat', () => {
  it('returns long when <= 5 columns', () => {
    expect(detectFormat(['id', 'time', 'state'], [['u1', '1', 'A']])).toBe('long');
  });

  it('returns long for 5 columns', () => {
    expect(detectFormat(['a', 'b', 'c', 'd', 'e'], [['1', '2', '3', '4', '5']])).toBe('long');
  });

  it('returns wide for >= 6 columns with few unique values', () => {
    const headers = ['s1', 's2', 's3', 's4', 's5', 's6'];
    const rows = [
      ['A', 'B', 'A', 'C', 'A', 'B'],
      ['C', 'A', 'B', 'A', 'B', 'C'],
      ['A', 'C', 'A', 'B', 'C', 'A'],
    ];
    expect(detectFormat(headers, rows)).toBe('wide');
  });

  it('returns long for >= 6 columns with many unique values', () => {
    const headers = ['id', 'time', 'state', 'val', 'x', 'y'];
    const rows = Array.from({ length: 50 }, (_, i) => [
      `user${i}`, `${i}`, `state${i}`, `${i * 10}`, `${i * 3.14}`, `${i * 2.71}`,
    ]);
    expect(detectFormat(headers, rows)).toBe('long');
  });
});

// ═══════════════════════════════════════════════════════════
//  parseTimestamp
// ═══════════════════════════════════════════════════════════
describe('parseTimestamp', () => {
  it('parses ISO 8601 with timezone', () => {
    const d = parseTimestamp('2024-01-15T10:30:00Z');
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2024);
    expect(d!.getUTCMonth()).toBe(0); // January
    expect(d!.getUTCDate()).toBe(15);
  });

  it('parses date + time without timezone', () => {
    const d = parseTimestamp('2024-01-15 10:30:00');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
  });

  it('parses date + time HH:MM', () => {
    const d = parseTimestamp('2024-06-01 14:30');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(5); // June
  });

  it('parses date only (ISO)', () => {
    const d = parseTimestamp('2024-01-15');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
  });

  it('parses US date (MM/DD/YYYY)', () => {
    const d = parseTimestamp('01/15/2024');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(15);
  });

  it('parses US date + time', () => {
    const d = parseTimestamp('01/15/2024 10:30:00');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
  });

  it('parses EU date (DD.MM.YYYY)', () => {
    const d = parseTimestamp('15.01.2024');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(15);
  });

  it('parses dash date (DD-MM-YYYY)', () => {
    const d = parseTimestamp('15-01-2024');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
  });

  it('parses year/month/day slashes', () => {
    const d = parseTimestamp('2024/01/15');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
  });

  it('parses Unix seconds (> 1e9)', () => {
    const d = parseTimestamp('1700000000');
    expect(d).not.toBeNull();
    expect(d!.getTime()).toBe(1700000000 * 1000);
  });

  it('parses Unix milliseconds (> 1e12)', () => {
    const d = parseTimestamp('1700000000000');
    expect(d).not.toBeNull();
    expect(d!.getTime()).toBe(1700000000000);
  });

  it('parses plain small numbers as synthetic dates', () => {
    const d = parseTimestamp('42');
    expect(d).not.toBeNull();
    expect(d!.getTime()).toBe(42);
  });

  it('returns null for empty string', () => {
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('  ')).toBeNull();
  });

  it('returns null for invalid string', () => {
    expect(parseTimestamp('not-a-date-at-all-xyz')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
//  guessColumns
// ═══════════════════════════════════════════════════════════
describe('guessColumns', () => {
  it('matches id/time/state header patterns', () => {
    const result = guessColumns(['student_id', 'timestamp', 'action'], [['u1', '1', 'A']]);
    expect(result.idCol).toBe(0);
    expect(result.timeCol).toBe(1);
    expect(result.stateCol).toBe(2);
  });

  it('matches case-insensitive patterns', () => {
    const result = guessColumns(['ID', 'Time', 'State'], [['u1', '1', 'A']]);
    expect(result.idCol).toBe(0);
    expect(result.timeCol).toBe(1);
    expect(result.stateCol).toBe(2);
  });

  it('falls back to heuristics when no patterns match', () => {
    const rows = Array.from({ length: 20 }, (_, i) => [
      `user${i}`, `${i}`, `${i % 3 === 0 ? 'X' : i % 3 === 1 ? 'Y' : 'Z'}`,
    ]);
    const result = guessColumns(['col_a', 'col_b', 'col_c'], rows);
    // Should assign all three columns
    expect(result.idCol).toBeGreaterThanOrEqual(0);
    expect(result.stateCol).toBeGreaterThanOrEqual(0);
    expect(result.idCol).not.toBe(result.stateCol);
  });

  it('handles single column headers without crashing', () => {
    const result = guessColumns(['data'], [['A']]);
    expect(result.idCol).toBeGreaterThanOrEqual(0);
    expect(result.stateCol).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  wideToSequences
// ═══════════════════════════════════════════════════════════
describe('wideToSequences', () => {
  it('converts normal rows to sequences', () => {
    const rows = [
      ['A', 'B', 'C'],
      ['B', 'C', 'A'],
    ];
    const result = wideToSequences(rows);
    expect(result).toEqual([
      ['A', 'B', 'C'],
      ['B', 'C', 'A'],
    ]);
  });

  it('converts NA, null, empty, undefined to null', () => {
    const rows = [['A', 'NA', 'null', '', 'undefined', 'B']];
    const result = wideToSequences(rows);
    expect(result[0]).toEqual(['A', null, null, null, null, 'B']);
  });

  it('trims whitespace', () => {
    const rows = [['  A ', ' B', 'C  ']];
    const result = wideToSequences(rows);
    expect(result[0]).toEqual(['A', 'B', 'C']);
  });
});

// ═══════════════════════════════════════════════════════════
//  longToSequences
// ═══════════════════════════════════════════════════════════
describe('longToSequences', () => {
  it('converts basic long format', () => {
    const rows = [
      ['u1', '1', 'A'],
      ['u1', '2', 'B'],
      ['u2', '1', 'C'],
      ['u2', '2', 'D'],
    ];
    const { sequences, groups } = longToSequences(rows, 0, 1, 2);
    expect(sequences).toHaveLength(2);
    expect(sequences[0]).toEqual(['A', 'B']);
    expect(sequences[1]).toEqual(['C', 'D']);
    expect(groups).toBeNull();
  });

  it('sorts by time column', () => {
    const rows = [
      ['u1', '3', 'C'],
      ['u1', '1', 'A'],
      ['u1', '2', 'B'],
    ];
    const { sequences } = longToSequences(rows, 0, 1, 2);
    expect(sequences[0]).toEqual(['A', 'B', 'C']);
  });

  it('extracts group labels when groupCol provided', () => {
    const rows = [
      ['u1', '1', 'A', 'G1'],
      ['u1', '2', 'B', 'G1'],
      ['u2', '1', 'C', 'G2'],
    ];
    const { sequences, groups } = longToSequences(rows, 0, 1, 2, 3);
    expect(sequences).toHaveLength(2);
    expect(groups).toEqual(['G1', 'G2']);
  });

  it('skips rows with empty ID or state', () => {
    const rows = [
      ['u1', '1', 'A'],
      ['', '2', 'B'],     // empty ID
      ['u1', '3', ''],    // empty state
      ['u1', '4', 'D'],
    ];
    const { sequences } = longToSequences(rows, 0, 1, 2);
    expect(sequences[0]).toEqual(['A', 'D']);
  });

  it('uses row order when timeCol = -1', () => {
    const rows = [
      ['u1', 'x', 'A'],
      ['u1', 'y', 'B'],
      ['u1', 'z', 'C'],
    ];
    const { sequences } = longToSequences(rows, 0, -1, 2);
    expect(sequences[0]).toEqual(['A', 'B', 'C']);
  });

  it('throws when all rows are invalid', () => {
    const rows = [
      ['', '1', 'A'],
      ['', '2', 'B'],
    ];
    expect(() => longToSequences(rows, 0, 1, 2)).toThrow('No valid sequences');
  });

  it('throws on empty rows', () => {
    expect(() => longToSequences([], 0, 1, 2)).toThrow('No data rows');
  });
});

// ═══════════════════════════════════════════════════════════
//  guessEdgeListColumns
// ═══════════════════════════════════════════════════════════
describe('guessEdgeListColumns', () => {
  it('matches from/to/weight patterns', () => {
    const result = guessEdgeListColumns(['source', 'target', 'weight']);
    expect(result.fromCol).toBe(0);
    expect(result.toCol).toBe(1);
    expect(result.weightCol).toBe(2);
  });

  it('matches alternative patterns', () => {
    const result = guessEdgeListColumns(['sender', 'receiver', 'freq']);
    expect(result.fromCol).toBe(0);
    expect(result.toCol).toBe(1);
    expect(result.weightCol).toBe(2);
  });

  it('falls back to first columns when no patterns match', () => {
    const result = guessEdgeListColumns(['col_a', 'col_b', 'col_c']);
    expect(result.fromCol).toBe(0);
    expect(result.toCol).toBe(1);
    expect(result.weightCol).toBe(-1); // no weight pattern matched
  });

  it('returns weightCol = -1 when only from/to match', () => {
    const result = guessEdgeListColumns(['from', 'to']);
    expect(result.fromCol).toBe(0);
    expect(result.toCol).toBe(1);
    expect(result.weightCol).toBe(-1);
  });
});

// ═══════════════════════════════════════════════════════════
//  edgeListToMatrix
// ═══════════════════════════════════════════════════════════
describe('edgeListToMatrix', () => {
  it('builds directed matrix from edge list', () => {
    const rows = [
      ['A', 'B', '2'],
      ['B', 'C', '3'],
    ];
    const { matrix, labels } = edgeListToMatrix(rows, 0, 1, 2, true);
    expect(labels).toEqual(['A', 'B', 'C']);
    const iA = labels.indexOf('A');
    const iB = labels.indexOf('B');
    const iC = labels.indexOf('C');
    expect(matrix[iA]![iB]).toBe(2);
    expect(matrix[iB]![iC]).toBe(3);
    expect(matrix[iB]![iA]).toBe(0); // not symmetric
  });

  it('builds undirected (symmetric) matrix', () => {
    const rows = [
      ['A', 'B', '2'],
    ];
    const { matrix, labels } = edgeListToMatrix(rows, 0, 1, 2, false);
    const iA = labels.indexOf('A');
    const iB = labels.indexOf('B');
    expect(matrix[iA]![iB]).toBe(2);
    expect(matrix[iB]![iA]).toBe(2); // symmetric
  });

  it('accumulates weights for duplicate edges', () => {
    const rows = [
      ['A', 'B', '1'],
      ['A', 'B', '2'],
    ];
    const { matrix, labels } = edgeListToMatrix(rows, 0, 1, 2, true);
    const iA = labels.indexOf('A');
    const iB = labels.indexOf('B');
    expect(matrix[iA]![iB]).toBe(3);
  });

  it('uses weight=1 when weightCol = -1', () => {
    const rows = [
      ['A', 'B'],
      ['B', 'C'],
    ];
    const { matrix, labels } = edgeListToMatrix(rows, 0, 1, -1, true);
    const iA = labels.indexOf('A');
    const iB = labels.indexOf('B');
    expect(matrix[iA]![iB]).toBe(1);
  });

  it('handles self-loops', () => {
    const rows = [
      ['A', 'A', '5'],
    ];
    const { matrix, labels } = edgeListToMatrix(rows, 0, 1, 2, true);
    const iA = labels.indexOf('A');
    expect(matrix[iA]![iA]).toBe(5);
  });

  it('does not double self-loops for undirected', () => {
    const rows = [
      ['A', 'A', '5'],
    ];
    const { matrix, labels } = edgeListToMatrix(rows, 0, 1, 2, false);
    const iA = labels.indexOf('A');
    expect(matrix[iA]![iA]).toBe(5); // only once, not doubled
  });
});

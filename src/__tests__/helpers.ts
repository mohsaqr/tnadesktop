/**
 * Shared test helpers and fixtures for tna-desktop tests.
 */
import { buildModel } from 'tnaj';
import type { TNA, SequenceData } from 'tnaj';

/**
 * Build a TNA model from a 2D weight matrix.
 */
export function makeTNA(
  matrix: number[][],
  labels?: string[],
  type: 'relative' | 'frequency' | 'co-occurrence' | 'attention' = 'relative',
): TNA {
  return buildModel(matrix, { type, labels });
}

/**
 * Build a TNA model from sequence data (for bootstrap/permutation/stability tests).
 */
export function makeTNAFromSequences(
  data: SequenceData,
  type: 'relative' | 'frequency' | 'co-occurrence' | 'attention' = 'relative',
): TNA {
  return buildModel(data, { type });
}

/** Simple 3-node triangle: A→B→C→A (equal weights). */
export const TRIANGLE_MATRIX = [
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 0],
];

/** Star graph: A→B, A→C, A→D (no back edges). */
export const STAR_MATRIX = [
  [0, 1, 1, 1],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];

/** Complete directed 3-node graph. */
export const COMPLETE3_MATRIX = [
  [0, 1, 1],
  [1, 0, 1],
  [1, 1, 0],
];

/** Disconnected graph: two pairs. */
export const DISCONNECTED_MATRIX = [
  [0, 1, 0, 0],
  [1, 0, 0, 0],
  [0, 0, 0, 1],
  [0, 0, 1, 0],
];

/** Single node graph. */
export const SINGLE_NODE_MATRIX = [[0]];

/** Graph with self-loops. */
export const SELF_LOOP_MATRIX = [
  [1, 1, 0],
  [0, 1, 1],
  [1, 0, 0],
];

/** Two-clique graph with weak bridge (for community tests). */
export const TWO_CLIQUE_MATRIX = [
  // Clique 1: nodes 0,1,2 fully connected
  // Clique 2: nodes 3,4,5 fully connected
  // Bridge: 2→3 weak
  [0, 5, 5, 0, 0, 0],
  [5, 0, 5, 0, 0, 0],
  [5, 5, 0, 1, 0, 0],
  [0, 0, 1, 0, 5, 5],
  [0, 0, 0, 5, 0, 5],
  [0, 0, 0, 5, 5, 0],
];

/** Sample sequence data for bootstrap/permutation tests. */
export const SAMPLE_SEQUENCES: SequenceData = [
  ['A', 'B', 'C', 'A', 'B'],
  ['B', 'C', 'A', 'B', 'C'],
  ['A', 'C', 'B', 'A', 'C'],
  ['C', 'A', 'B', 'C', 'A'],
  ['A', 'B', 'A', 'C', 'B'],
  ['B', 'A', 'C', 'B', 'A'],
  ['C', 'B', 'A', 'C', 'B'],
  ['A', 'C', 'A', 'B', 'C'],
  ['B', 'C', 'B', 'A', 'C'],
  ['C', 'A', 'C', 'B', 'A'],
];

/** Second set of sequences (slightly different distribution). */
export const SAMPLE_SEQUENCES_2: SequenceData = [
  ['A', 'A', 'B', 'C', 'C'],
  ['B', 'B', 'A', 'C', 'C'],
  ['A', 'A', 'A', 'B', 'C'],
  ['C', 'C', 'B', 'A', 'A'],
  ['B', 'B', 'B', 'A', 'C'],
];

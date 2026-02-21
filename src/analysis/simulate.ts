/**
 * Simulate sequence data in long and one-hot formats.
 * Port of Saqrlab::simulate_long_data() and Saqrlab::simulate_onehot_data().
 */

// ─── Seeded RNG (Mulberry32) ───
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUP_REGULATION_STATES = [
  'adapt', 'cohesion', 'consensus', 'coregulate',
  'discuss', 'emotion', 'monitor', 'plan', 'synthesis',
];

/** Generate random row-stochastic matrix (each row sums to 1). */
function randomTransitionMatrix(n: number, rng: () => number): number[][] {
  const mat: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    let sum = 0;
    for (let j = 0; j < n; j++) {
      // Exponential-like random for Dirichlet(1,...,1) simulation
      const v = -Math.log(1 - rng());
      row.push(v);
      sum += v;
    }
    for (let j = 0; j < n; j++) row[j] = row[j]! / sum;
    mat.push(row);
  }
  return mat;
}

/** Generate random probability vector summing to 1. */
function randomInitProbs(n: number, rng: () => number): number[] {
  const probs: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = -Math.log(1 - rng());
    probs.push(v);
    sum += v;
  }
  for (let i = 0; i < n; i++) probs[i] = probs[i]! / sum;
  return probs;
}

/** Sample from a discrete distribution. */
function sampleDiscrete(probs: number[], rng: () => number): number {
  const u = rng();
  let cum = 0;
  for (let i = 0; i < probs.length; i++) {
    cum += probs[i]!;
    if (u < cum) return i;
  }
  return probs.length - 1;
}

export interface SimLongParams {
  nGroups: number;
  nActors: number | [number, number];
  nStates: number;
  states?: string[];
  seqLengthRange: [number, number];
  seed: number;
}

export interface SimLongResult {
  headers: string[];
  rows: string[][];
}

/**
 * Simulate long-format sequence data.
 * Returns headers + rows as string[][] matching CSV-load conventions.
 */
export function simulateLongData(params: SimLongParams): SimLongResult {
  const { nGroups, nStates, seqLengthRange, seed } = params;
  const rng = mulberry32(seed);

  const actorRange: [number, number] = typeof params.nActors === 'number'
    ? [params.nActors, params.nActors]
    : params.nActors;

  // Determine states
  const states = params.states && params.states.length > 0
    ? params.states
    : nStates <= GROUP_REGULATION_STATES.length
      ? GROUP_REGULATION_STATES.slice(0, nStates)
      : Array.from({ length: nStates }, (_, i) => `S${i + 1}`);

  const n = states.length;
  const transMat = randomTransitionMatrix(n, rng);
  const initProbs = randomInitProbs(n, rng);

  const headers = ['Actor', 'Group', 'Time', 'Action'];
  const rows: string[][] = [];
  let actorId = 0;
  let timeCounter = 1;

  for (let g = 1; g <= nGroups; g++) {
    const nActorsInGroup = actorRange[0] === actorRange[1]
      ? actorRange[0]
      : actorRange[0] + Math.floor(rng() * (actorRange[1] - actorRange[0] + 1));

    for (let a = 0; a < nActorsInGroup; a++) {
      actorId++;
      const seqLen = seqLengthRange[0] + Math.floor(
        rng() * (seqLengthRange[1] - seqLengthRange[0] + 1),
      );

      // Generate Markov chain sequence
      let currentIdx = sampleDiscrete(initProbs, rng);
      for (let t = 0; t < seqLen; t++) {
        rows.push([
          String(actorId),
          String(g),
          String(timeCounter++),
          states[currentIdx]!,
        ]);
        currentIdx = sampleDiscrete(transMat[currentIdx]!, rng);
      }
    }
  }

  return { headers, rows };
}

export interface SimOnehotResult {
  headers: string[];
  rows: string[][];
}

/**
 * Simulate one-hot encoded sequence data.
 * Returns headers + rows as string[][] matching CSV-load conventions.
 */
export function simulateOnehotData(params: SimLongParams): SimOnehotResult {
  const longResult = simulateLongData(params);

  // Determine states from the Action column
  const actionIdx = longResult.headers.indexOf('Action');
  const statesSet = new Set<string>();
  for (const row of longResult.rows) {
    statesSet.add(row[actionIdx]!);
  }
  const states = Array.from(statesSet).sort();

  // Build one-hot headers: Actor, Group, Time, then one column per state
  const headers = ['Actor', 'Group', 'Time', ...states];
  const rows: string[][] = [];

  for (const row of longResult.rows) {
    const action = row[actionIdx]!;
    const base = [row[0]!, row[1]!, row[2]!]; // Actor, Group, Time
    const onehotCols = states.map(s => s === action ? '1' : '0');
    rows.push([...base, ...onehotCols]);
  }

  return { headers, rows };
}

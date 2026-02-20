/**
 * Data loading and parsing: CSV (Papa Parse) and Excel (SheetJS).
 */
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { SequenceData } from 'tnaj';

export interface ParsedFile {
  headers: string[];
  rows: string[][];
  format: 'wide' | 'long';
}

/** Read file bytes and detect type by extension. */
export function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    return parseCsv(file);
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return parseExcel(file);
  }
  return Promise.reject(new Error(`Unsupported file type: .${ext}`));
}

/** Parse a CSV/TSV file. */
function parseCsv(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete(results) {
        const raw = results.data as string[][];
        if (raw.length < 2) {
          reject(new Error('File has fewer than 2 rows'));
          return;
        }
        const headers = raw[0]!.map(h => String(h).trim());
        const rows = raw.slice(1).map(row => row.map(c => String(c).trim()));
        const format = detectFormat(headers, rows);
        resolve({ headers, rows, format });
      },
      error(err) { reject(err); },
    });
  });
}

/** Parse an Excel file. */
function parseExcel(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]!]!;
        const raw: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (raw.length < 2) {
          reject(new Error('Sheet has fewer than 2 rows'));
          return;
        }
        const headers = raw[0]!.map(h => String(h).trim());
        const rows = raw.slice(1).map(row => row.map(c => String(c).trim()));
        const format = detectFormat(headers, rows);
        resolve({ headers, rows, format });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Auto-detect wide vs long format.
 * Default: long (more common for event logs).
 * Wide: only if many columns with few unique values (sequence-per-row).
 */
export function detectFormat(headers: string[], rows: string[][]): 'wide' | 'long' {
  // Heuristic: if <= 5 columns, likely long format
  if (headers.length <= 5) return 'long';

  // If many columns with small set of unique values across them → wide
  if (headers.length >= 6) {
    const sample = rows.slice(0, 50);
    const allVals = new Set<string>();
    for (const row of sample) {
      for (const cell of row) {
        if (cell.trim()) allVals.add(cell.trim());
      }
    }
    // Wide format typically has a small alphabet repeated across columns
    if (allVals.size < headers.length * 2) return 'wide';
  }

  return 'long';
}

/** Column name patterns for guessing long-format columns. */
const ID_PATTERNS = /^(id|user|student|actor|person|participant|subject|name|user_?id|student_?id|actor_?id|uid|pid|sid)$/i;
const TIME_PATTERNS = /^(time|timestamp|date|datetime|step|order|t|seq|sequence|time_?stamp|created_?at|event_?time|ts|period|week|day|hour|minute|second)$/i;
const STATE_PATTERNS = /^(state|action|event|activity|behavior|behaviour|status|code|category|type|phase|stage|strategy|tactic|regulation)$/i;

/**
 * Guess which columns are ID, time, and state from header names.
 * Returns { idCol, timeCol, stateCol } with -1 for time if "none" is appropriate.
 */
export function guessColumns(headers: string[], rows: string[][]): { idCol: number; timeCol: number; stateCol: number } {
  let idCol = -1, timeCol = -1, stateCol = -1;

  // Match by name patterns
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    if (idCol === -1 && ID_PATTERNS.test(h)) idCol = i;
    else if (timeCol === -1 && TIME_PATTERNS.test(h)) timeCol = i;
    else if (stateCol === -1 && STATE_PATTERNS.test(h)) stateCol = i;
  }

  // Fallback heuristics if patterns didn't match all columns
  if (idCol === -1 || stateCol === -1) {
    const sample = rows.slice(0, 50);
    const colStats = headers.map((_, i) => {
      const vals = sample.map(r => (r[i] ?? '').trim()).filter(v => v);
      const unique = new Set(vals);
      const allNumeric = vals.every(v => !isNaN(Number(v)));
      return { idx: i, nUnique: unique.size, nVals: vals.length, allNumeric };
    });

    // ID column: many unique values (most rows different)
    if (idCol === -1) {
      const candidates = colStats.filter(c => c.idx !== timeCol && c.idx !== stateCol);
      const best = candidates.sort((a, b) => b.nUnique - a.nUnique)[0];
      if (best) idCol = best.idx;
    }

    // State column: few unique values (small alphabet)
    if (stateCol === -1) {
      const candidates = colStats.filter(c => c.idx !== idCol && c.idx !== timeCol && !c.allNumeric);
      const best = candidates.sort((a, b) => a.nUnique - b.nUnique)[0];
      if (best) stateCol = best.idx;
    }

    // Time column: numeric or parseable, if not already found
    if (timeCol === -1) {
      const candidates = colStats.filter(c => c.idx !== idCol && c.idx !== stateCol && c.allNumeric);
      if (candidates.length > 0) timeCol = candidates[0]!.idx;
    }
  }

  // Final fallback: assign sequentially to unassigned slots
  const used = new Set([idCol, timeCol, stateCol].filter(x => x >= 0));
  if (idCol === -1) { idCol = findUnused(headers.length, used); used.add(idCol); }
  if (stateCol === -1) { stateCol = findUnused(headers.length, used); used.add(stateCol); }
  // timeCol can remain -1 (= "none")

  return { idCol, timeCol, stateCol };
}

function findUnused(n: number, used: Set<number>): number {
  for (let i = 0; i < n; i++) { if (!used.has(i)) return i; }
  return 0;
}

// ═══════════════════════════════════════════════════════════
//  Timestamp parsing (modeled after R/Python's robust parsing)
// ═══════════════════════════════════════════════════════════

/** Common date/time format patterns to try in order. */
const DATE_PATTERNS: { regex: RegExp; parse: (m: RegExpMatchArray) => Date }[] = [
  // ISO 8601: 2024-01-15T10:30:00Z, 2024-01-15T10:30:00+05:00, 2024-01-15T10:30:00.123Z
  {
    regex: /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-]\d{2}:?\d{2}))?$/,
    parse: (m) => new Date(m[0]!),
  },
  // Date + time without timezone: 2024-01-15 10:30:00
  {
    regex: /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2}):(\d{2})$/,
    parse: (m) => new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!),
  },
  // Date + time HH:MM: 2024-01-15 10:30
  {
    regex: /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})$/,
    parse: (m) => new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!),
  },
  // ISO date only: 2024-01-15
  {
    regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    parse: (m) => new Date(+m[1]!, +m[2]! - 1, +m[3]!),
  },
  // US date: 01/15/2024, 1/15/2024
  {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    parse: (m) => new Date(+m[3]!, +m[1]! - 1, +m[2]!),
  },
  // US date + time: 01/15/2024 10:30:00
  {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
    parse: (m) => new Date(+m[3]!, +m[1]! - 1, +m[2]!, +m[4]!, +m[5]!, +m[6]!),
  },
  // EU date: 15.01.2024
  {
    regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    parse: (m) => new Date(+m[3]!, +m[2]! - 1, +m[1]!),
  },
  // EU date + time: 15.01.2024 10:30:00
  {
    regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
    parse: (m) => new Date(+m[3]!, +m[2]! - 1, +m[1]!, +m[4]!, +m[5]!, +m[6]!),
  },
  // Dash-separated: 15-01-2024
  {
    regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    parse: (m) => new Date(+m[3]!, +m[2]! - 1, +m[1]!),
  },
  // Dash-separated + time: 15-01-2024 10:30:00
  {
    regex: /^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
    parse: (m) => new Date(+m[3]!, +m[2]! - 1, +m[1]!, +m[4]!, +m[5]!, +m[6]!),
  },
  // Year/month/day slashes: 2024/01/15
  {
    regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
    parse: (m) => new Date(+m[1]!, +m[2]! - 1, +m[3]!),
  },
  // Year/month/day slashes + time: 2024/01/15 10:30:00
  {
    regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})$/,
    parse: (m) => new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!),
  },
];

/**
 * Parse a single timestamp string into a Date, or return null if unparseable.
 * Tries: numeric (plain number / Unix timestamp), then common date formats.
 */
export function parseTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // 1. Plain numeric → treat as sortable number (step index or Unix timestamp)
  const num = Number(trimmed);
  if (!isNaN(num) && isFinite(num)) {
    // Large numbers (> 1e9) look like Unix seconds; very large (> 1e12) like milliseconds
    if (num > 1e12) return new Date(num);
    if (num > 1e9) return new Date(num * 1000);
    // Small numbers are just ordinal steps; return a synthetic date for sorting
    return new Date(num);
  }

  // 2. Try each date pattern
  for (const { regex, parse } of DATE_PATTERNS) {
    const m = trimmed.match(regex);
    if (m) {
      const d = parse(m);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 3. Fallback: native Date constructor (handles many locale strings)
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) return fallback;

  return null;
}

/**
 * Parse an entire column of time values into sortable numbers.
 * Returns { values, errors } where errors lists unparseable rows.
 */
function parseTimeColumn(
  rows: string[][], timeCol: number,
): { values: Map<number, number>; errors: { row: number; value: string }[] } {
  const values = new Map<number, number>();
  const errors: { row: number; value: string }[] = [];

  // First pass: try plain numeric (fastest path)
  let allNumeric = true;
  for (let i = 0; i < rows.length; i++) {
    const raw = (rows[i]![timeCol] ?? '').trim();
    if (!raw) continue;
    const n = Number(raw);
    if (isNaN(n)) { allNumeric = false; break; }
  }

  if (allNumeric) {
    for (let i = 0; i < rows.length; i++) {
      const raw = (rows[i]![timeCol] ?? '').trim();
      if (!raw) continue;
      const n = Number(raw);
      if (isNaN(n)) {
        errors.push({ row: i + 2, value: raw }); // +2 for 1-indexed + header
      } else {
        values.set(i, n);
      }
    }
    return { values, errors };
  }

  // Second pass: parse as timestamps
  for (let i = 0; i < rows.length; i++) {
    const raw = (rows[i]![timeCol] ?? '').trim();
    if (!raw) continue;
    const d = parseTimestamp(raw);
    if (d === null) {
      errors.push({ row: i + 2, value: raw });
    } else {
      values.set(i, d.getTime());
    }
  }

  return { values, errors };
}

/** Convert wide-format rows into SequenceData. */
export function wideToSequences(rows: string[][]): SequenceData {
  return rows.map(row =>
    row.map(cell => {
      const v = cell.trim();
      return v === '' || v === 'NA' || v === 'null' || v === 'undefined' ? null : v;
    })
  );
}

/**
 * Convert long-format rows into SequenceData given column indices.
 * timeCol = -1 means "none" (use row order within each ID group).
 * groupCol = -1 means no grouping; >= 0 extracts one group label per sequence.
 * Supports numeric, ISO 8601, and many common date/time formats.
 * Throws with descriptive error messages on parse failures.
 */
export function longToSequences(
  rows: string[][], idCol: number, timeCol: number, stateCol: number, groupCol: number = -1,
): { sequences: SequenceData; groups: string[] | null } {
  if (rows.length === 0) {
    throw new Error('No data rows found.');
  }

  // Parse time column (unless "none")
  let timeValues: Map<number, number> | null = null;
  if (timeCol >= 0) {
    const { values, errors } = parseTimeColumn(rows, timeCol);
    if (errors.length > 0) {
      const maxShow = 5;
      const samples = errors.slice(0, maxShow).map(e => `  Row ${e.row}: "${e.value}"`).join('\n');
      const more = errors.length > maxShow ? `\n  ... and ${errors.length - maxShow} more` : '';
      throw new Error(
        `Could not parse ${errors.length} time value(s) in the time column.\n` +
        `Supported formats: numbers, ISO 8601 (2024-01-15T10:30:00Z), ` +
        `dates (2024-01-15, 01/15/2024, 15.01.2024), ` +
        `date+time, Unix timestamps.\n\n` +
        `Unparseable values:\n${samples}${more}`
      );
    }
    timeValues = values;
  }

  // Group rows by ID, sort by time (or preserve row order), extract states
  const idGroups = new Map<string, { time: number; state: string; group: string }[]>();
  let skippedEmpty = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const id = (row[idCol] ?? '').trim();
    const st = (row[stateCol] ?? '').trim();
    const grp = groupCol >= 0 ? (row[groupCol] ?? '').trim() : '';

    if (!id) { skippedEmpty++; continue; }
    if (!st) { skippedEmpty++; continue; }

    let time: number;
    if (timeValues) {
      const tv = timeValues.get(i);
      if (tv === undefined) continue; // empty time cell
      time = tv;
    } else {
      time = i; // row order
    }

    if (!idGroups.has(id)) idGroups.set(id, []);
    idGroups.get(id)!.push({ time, state: st, group: grp });
  }

  if (idGroups.size === 0) {
    const hint = skippedEmpty > 0
      ? ` (${skippedEmpty} rows had empty ID or state values)`
      : '';
    throw new Error(
      `No valid sequences could be constructed from the data.${hint}\n` +
      `Check that the ID, time, and state column selections are correct.`
    );
  }

  const sequences: SequenceData = [];
  const groupLabels: string[] | null = groupCol >= 0 ? [] : null;
  for (const entries of idGroups.values()) {
    entries.sort((a, b) => a.time - b.time);
    sequences.push(entries.map(e => e.state));
    if (groupLabels !== null) groupLabels.push(entries[0]!.group);
  }
  return { sequences, groups: groupLabels };
}

// ═══════════════════════════════════════════════════════════
//  Edge list parsing (SNA mode)
// ═══════════════════════════════════════════════════════════

export interface EdgeListResult {
  matrix: number[][];
  labels: string[];
}

/** Column name patterns for guessing edge list columns. */
const FROM_PATTERNS = /^(from|source|sender|origin|start|node1|node_1|src)$/i;
const TO_PATTERNS = /^(to|target|receiver|destination|end|node2|node_2|dst|dest)$/i;
const WEIGHT_PATTERNS = /^(weight|value|strength|count|freq|frequency|w|score)$/i;

/**
 * Guess which columns are From, To, Weight from header names.
 * Returns { fromCol, toCol, weightCol } with -1 for weight if not found.
 */
export function guessEdgeListColumns(headers: string[]): { fromCol: number; toCol: number; weightCol: number } {
  let fromCol = -1, toCol = -1, weightCol = -1;

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    if (fromCol === -1 && FROM_PATTERNS.test(h)) fromCol = i;
    else if (toCol === -1 && TO_PATTERNS.test(h)) toCol = i;
    else if (weightCol === -1 && WEIGHT_PATTERNS.test(h)) weightCol = i;
  }

  // Fallback: assign first two unused columns as from/to
  const used = new Set([fromCol, toCol, weightCol].filter(x => x >= 0));
  if (fromCol === -1) { fromCol = findUnused(headers.length, used); used.add(fromCol); }
  if (toCol === -1) { toCol = findUnused(headers.length, used); used.add(toCol); }
  // weightCol can stay -1 (= unweighted)

  return { fromCol, toCol, weightCol };
}

/**
 * Convert edge list rows into a weight matrix.
 * @param rows - Data rows (excluding header)
 * @param fromCol - Index of the "from" column
 * @param toCol - Index of the "to" column
 * @param weightCol - Index of the "weight" column (-1 = unweighted, all edges = 1)
 * @param directed - If false, symmetrize the matrix
 */
export function edgeListToMatrix(
  rows: string[][], fromCol: number, toCol: number, weightCol: number, directed: boolean,
): EdgeListResult {
  // Collect unique node names
  const nodeSet = new Set<string>();
  for (const row of rows) {
    const from = (row[fromCol] ?? '').trim();
    const to = (row[toCol] ?? '').trim();
    if (from) nodeSet.add(from);
    if (to) nodeSet.add(to);
  }
  const labels = [...nodeSet].sort();
  const idx = new Map(labels.map((l, i) => [l, i]));
  const n = labels.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0) as number[]);

  for (const row of rows) {
    const from = (row[fromCol] ?? '').trim();
    const to = (row[toCol] ?? '').trim();
    if (!from || !to) continue;
    const i = idx.get(from);
    const j = idx.get(to);
    if (i === undefined || j === undefined) continue;

    const w = weightCol >= 0 ? (parseFloat((row[weightCol] ?? '').trim()) || 1) : 1;
    matrix[i]![j]! += w;
    if (!directed && i !== j) {
      matrix[j]![i]! += w;
    }
  }

  return { matrix, labels };
}

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
 * Long format: 3 columns where col1=ID, col2=time/step, col3=state.
 * Wide format: each row is a full sequence, columns are time steps.
 */
function detectFormat(headers: string[], rows: string[][]): 'wide' | 'long' {
  if (headers.length === 3) {
    // Check if column 2 looks numeric (time steps)
    const allNumeric = rows.slice(0, 20).every(r => !isNaN(Number(r[1])));
    if (allNumeric) return 'long';
  }
  // If we have many columns that look like they have a small number of unique values → wide
  return 'wide';
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

/** Convert long-format rows into SequenceData given column indices. */
export function longToSequences(rows: string[][], idCol: number, timeCol: number, stateCol: number): SequenceData {
  // Group rows by ID, sort by time, extract states
  const groups = new Map<string, { time: number; state: string }[]>();
  for (const row of rows) {
    const id = row[idCol] ?? '';
    const time = Number(row[timeCol]);
    const st = (row[stateCol] ?? '').trim();
    if (!id || isNaN(time) || !st) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push({ time, state: st });
  }

  const sequences: SequenceData = [];
  for (const entries of groups.values()) {
    entries.sort((a, b) => a.time - b.time);
    sequences.push(entries.map(e => e.state));
  }
  return sequences;
}

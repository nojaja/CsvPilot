import * as fs from 'fs';
import { parse } from 'csv-parse';
import type { CsvRecord } from './types';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const rbql = require('rbql');

/** CSVパース結果 */
export interface CsvParseResult {
  headers: string[];
  records: CsvRecord[];
}

/**
 * CSVファイルをストリーミングで全レコード読み込む
 */
async function streamAllRecords(
  filePath: string,
  delimiter: string
): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    const headers: string[] = [];
    const records: CsvRecord[] = [];
    let isFirstRow = true;

    const parser = parse({ delimiter, trim: true });

    parser.on('data', (row: string[]) => {
      if (isFirstRow) {
        headers.push(...row);
        isFirstRow = false;
        return;
      }
      const record: CsvRecord = {};
      headers.forEach((h, i) => {
        record[h] = row[i] ?? '';
      });
      records.push(record);
    });

    parser.on('end', () => resolve({ headers, records }));
    parser.on('error', reject);

    fs.createReadStream(filePath).pipe(parser);
  });
}

/**
 * RBQLクエリをrecordの配列に適用する
 */
async function applyRbqlFilter(
  records: CsvRecord[],
  headers: string[],
  query: string
): Promise<CsvRecord[]> {
  const inputTable = records.map(r => headers.map(h => r[h] ?? ''));
  const outputTable: string[][] = [];
  const warnings: string[] = [];

  await rbql.query_table(query, inputTable, outputTable, warnings);

  if (warnings.length > 0) {
    warnings.forEach(w => console.warn(`[RBQL] ${w}`));
  }

  return outputTable.map(row => {
    const record: CsvRecord = {};
    row.forEach((val, i) => {
      const header = headers[i] ?? `col${i + 1}`;
      record[header] = val;
    });
    return record;
  });
}

/**
 * CSVファイルを読み込みRBQLフィルタを適用してレコード配列を返す。
 * queryなしの場合はストリーミング読み込みのみ。
 */
export async function loadCsvRecords(
  filePath: string,
  delimiter: string,
  query?: string
): Promise<CsvParseResult> {
  const { headers, records } = await streamAllRecords(filePath, delimiter);

  if (!query) {
    return { headers, records };
  }

  const filtered = await applyRbqlFilter(records, headers, query);
  return { headers, records: filtered };
}

/**
 * CSVファイルをストリーミングで1行ずつ処理する（RBQLなしの場合専用）
 */
export function streamCsvRows(
  filePath: string,
  delimiter: string,
  onRow: (_record: CsvRecord, _headers: string[], _rowIndex: number) => Promise<void>
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const headers: string[] = [];
    let rowIndex = 0;
    let isFirstRow = true;
    const promises: Promise<void>[] = [];

    const parser = parse({ delimiter, trim: true });

    parser.on('data', (row: string[]) => {
      if (isFirstRow) {
        headers.push(...row);
        isFirstRow = false;
        return;
      }
      const record: CsvRecord = {};
      headers.forEach((h, i) => {
        record[h] = row[i] ?? '';
      });
      rowIndex++;
      promises.push(onRow(record, headers, rowIndex));
    });

    parser.on('end', () => {
      Promise.all(promises)
        .then(() => resolve(headers))
        .catch(reject);
    });

    parser.on('error', reject);

    fs.createReadStream(filePath).pipe(parser);
  });
}

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
 * 処理名: CSV行データハンドラ生成
 *
 * 処理概要:
 * CSVパーサの `data` イベントハンドラを生成する。
 * 1行目をヘッダとして取り込み、2行目以降をレコードに変換してコールバックへ渡す。
 *
 * 実装理由:
 * streamAllRecords と streamCsvRows で同一のヘッダ解析・レコード変換ロジックが
 * 重複するため、共通ファクトリ関数として抽出し重複を排除する。
 *
 * @param headers ヘッダ格納先配列（参照渡し）
 * @param onRecord レコード生成後に呼び出すコールバック
 * @returns csv-parse の data イベント用ハンドラ
 */
function createCsvDataHandler(
  headers: string[],
  onRecord: (_record: CsvRecord) => void
): (_row: string[]) => void {
  let isFirstRow = true;
  return (row: string[]) => {
    if (isFirstRow) {
      headers.push(...row);
      isFirstRow = false;
      return;
    }
    const record: CsvRecord = {};
    headers.forEach((h, i) => {
      record[h] = row[i] ?? '';
    });
    onRecord(record);
  };
}

/**
 * CSVファイルをストリーミングで全レコード読み込む
 * @param filePath 対象CSVファイルパス
 * @param delimiter CSV区切り文字
 * @returns ヘッダとレコードの配列
 */
async function streamAllRecords(
  filePath: string,
  delimiter: string
): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    const headers: string[] = [];
    const records: CsvRecord[] = [];

    const parser = parse({ delimiter, trim: true });

    parser.on('data', createCsvDataHandler(headers, (record) => {
      records.push(record);
    }));

    parser.on('end', () => resolve({ headers, records }));
    parser.on('error', reject);

    fs.createReadStream(filePath).pipe(parser);
  });
}

/**
 * RBQLクエリをrecordの配列に適用する
 * @param records CSVレコード配列
 * @param headers CSVヘッダ列名配列
 * @param query RBQLクエリ文字列
 * @returns フィルタ済み CSVレコード配列
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
 * @param filePath 対象CSVファイルパス
 * @param delimiter CSV区切り文字
 * @param query RBQLクエリ文字列（オプション）
 * @returns ヘッダとレコードの配列
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
 * @param filePath 対象CSVファイルパス
 * @param delimiter CSV区切り文字
 * @param onRow 行コールバック関数
 * @returns ヘッダ列名配列
 */
export function streamCsvRows(
  filePath: string,
  delimiter: string,
  onRow: (_record: CsvRecord, _headers: string[], _rowIndex: number) => Promise<void>
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const headers: string[] = [];
    let rowIndex = 0;
    const promises: Promise<void>[] = [];

    const parser = parse({ delimiter, trim: true });

    parser.on('data', createCsvDataHandler(headers, (record) => {
      rowIndex++;
      promises.push(onRow(record, headers, rowIndex));
    }));

    parser.on('end', () => {
      Promise.all(promises)
        .then(() => resolve(headers))
        .catch(reject);
    });

    parser.on('error', reject);

    fs.createReadStream(filePath).pipe(parser);
  });
}

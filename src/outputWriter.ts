import * as fs from 'fs';
import * as path from 'path';
import { stringify } from 'csv-stringify';
import type { CsvRecord } from './types';

/** 出力CSVライター */
export interface CsvOutputWriter {
  writeRow(_record: CsvRecord, _responseValues: Record<string, string>): Promise<void>;
  close(): Promise<void>;
}

/**
 * 出力ファイルパスを生成する
 * @param outputDir 出力先ディレクトリ
 * @param csvBasename 入力CSVのファイル名（拡張子なし）
 * @param promptBasename プロンプトのベース名
 * @returns 出力ファイルパス
 */
export function buildOutputPath(
  outputDir: string,
  csvBasename: string,
  promptBasename: string
): string {
  const filename = `${csvBasename}__${promptBasename}.csv`;
  return path.join(outputDir, filename);
}

/**
 * 出力ディレクトリが存在しない場合は作成する
 * @param outputPath 出力ファイルパス
 * @returns void
 */
async function ensureOutputDir(outputPath: string): Promise<void> {
  const dir = path.dirname(outputPath);
  await fs.promises.mkdir(dir, { recursive: true });
}

/**
 * ストリーミングCSV出力ライターを作成する。
 * @param outputPath 出力ファイルパス
 * @param inputHeaders 入力CSVのヘッダ列名配列
 * @param additionalColumns 追加する出力列名配列（output.columns から生成）
 * @returns CsvOutputWriter インスタンス
 */
export async function createOutputWriter(
  outputPath: string,
  inputHeaders: string[],
  additionalColumns: string[]
): Promise<CsvOutputWriter> {
  await ensureOutputDir(outputPath);

  const outputHeaders = [...inputHeaders, ...additionalColumns];
  const stringifier = stringify({ header: true, columns: outputHeaders });
  const fileStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });

  stringifier.pipe(fileStream);

  const writeRow = (record: CsvRecord, responseValues: Record<string, string>): Promise<void> => {
    return new Promise((resolve, reject) => {
      const row = outputHeaders.map(h => {
        if (inputHeaders.includes(h)) return record[h] ?? '';
        return responseValues[h] ?? '';
      });
      const canWrite = stringifier.write(row);
      if (canWrite) {
        resolve();
      } else {
        stringifier.once('drain', resolve);
        stringifier.once('error', reject);
      }
    });
  };

  const close = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      stringifier.end();
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });
  };

  return { writeRow, close };
}

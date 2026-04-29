import * as fs from 'fs';
import * as path from 'path';
import { stringify } from 'csv-stringify';
import type { CsvRecord } from './types';

const RESPONSE_COLUMN = '_copilot_response';

/** 出力CSVライター */
export interface CsvOutputWriter {
  writeRow(_record: CsvRecord, _response: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * 出力ファイルパスを生成する
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
 */
async function ensureOutputDir(outputPath: string): Promise<void> {
  const dir = path.dirname(outputPath);
  await fs.promises.mkdir(dir, { recursive: true });
}

/**
 * ストリーミングCSV出力ライターを作成する
 */
export async function createOutputWriter(
  outputPath: string,
  headers: string[]
): Promise<CsvOutputWriter> {
  await ensureOutputDir(outputPath);

  const outputHeaders = [...headers, RESPONSE_COLUMN];
  const stringifier = stringify({ header: true, columns: outputHeaders });
  const fileStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });

  stringifier.pipe(fileStream);

  const writeRow = (record: CsvRecord, response: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const row = outputHeaders.map(h =>
        h === RESPONSE_COLUMN ? response : (record[h] ?? '')
      );
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

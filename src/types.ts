/**
 * CsvPilot 共有型定義
 */

/** セッションモード */
export type SessionMode = 'whole' | 'record';

/** CLIオプション */
export interface CsvPilotOptions {
  prompts: string[];
  input: string[];
  query?: string;
  output: string;
  mode: SessionMode;
  token?: string;
  model?: string;
  delimiter: string;
}

/** prompt.mdファイルの種類 */
export type PromptFileType = 'session' | 'record';

/** 読み込んだprompt.mdファイル */
export interface PromptFile {
  path: string;
  type: PromptFileType;
  content: string;
  basename: string;
}

/** CSVレコード（ヘッダー名 + インデックスでアクセス可能） */
export interface CsvRecord {
  /** ヘッダー名によるフィールドアクセス */
  [key: string]: string;
}

/** テンプレート変数コンテキスト */
export interface TemplateContext {
  /** a1, a2, ... インデックスアクセス */
  [key: string]: string | number;
}

/** 処理結果1行分 */
export interface ProcessedRow {
  original: CsvRecord;
  response: string;
}

/** 出力ファイル情報 */
export interface OutputFileInfo {
  csvBasename: string;
  promptBasename: string;
  outputPath: string;
}

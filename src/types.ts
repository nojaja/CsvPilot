/**
 * CsvPilot 共有型定義
 */

import type { ProviderConfig } from '@github/copilot-sdk';

/** セッションモード */
export type SessionMode = 'whole' | 'folder' | 'file' | 'record';

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
  byok?: ByokConfig;
  proxy?: ProxyConfig;
}

/** BYOK設定 */
export interface ByokConfig {
  provider: ProviderConfig;
}

/** Proxy設定 */
export interface ProxyConfig {
  http?: string;
  https?: string;
  noProxy?: string;
}

/** 設定ファイルの構造 */
export interface CsvPilotConfigFile {
  prompts?: string[];
  input?: string[];
  query?: string;
  output?: string;
  mode?: SessionMode;
  token?: string;
  model?: string;
  delimiter?: string;
  byok?: ByokConfig;
  proxy?: ProxyConfig;
}

/** prompt.mdファイルの種類 */
export type PromptFileType = 'session' | 'record';

/** output.columns の1列定義 */
export interface OutputColumnDef {
  name: string;
  path: string;
  required?: boolean;
  default?: string;
}

/** record.prompt.md の出力スキーマ宣言 */
export interface OutputSchema {
  columns: OutputColumnDef[];
}

/** 読み込んだprompt.mdファイル */
export interface PromptFile {
  path: string;
  type: PromptFileType;
  /** frontmatter を除いた Markdown 本文 */
  content: string;
  basename: string;
  /** record type の場合のみ設定される出力スキーマ */
  outputSchema?: OutputSchema;
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

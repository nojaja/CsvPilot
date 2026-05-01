import * as fs from 'fs';
import * as path from 'path';
import ConfigLoder from 'nodeconfigloder';

export type OutputFormat = 'text' | 'json';

/**
 * 処理名: 出力フォーマット解決
 *
 * 処理概要: 入力値が 'json' であれば 'json'、それ以外は 'text' を返す
 *
 * 実装理由: 各コマンドで統一したフォーマット解決ロジックを持つため
 * @param value フォーマット指定値
 * @returns 解決された出力フォーマット
 */
export function resolveOutputFormat(value: unknown): OutputFormat {
  return value === 'json' ? 'json' : 'text';
}

/**
 * 処理名: パス存在確認
 *
 * 処理概要: 指定パスが存在するかを確認する
 *
 * 実装理由: ファイル/ディレクトリの存在チェックを一元化するため
 * @param targetPath 確認するパス
 * @returns 存在する場合 true
 */
export function isExistingPath(targetPath: string): boolean {
  return fs.existsSync(targetPath);
}

/**
 * 処理名: 絶対パスリスト変換
 *
 * 処理概要: 相対パスの配列を絶対パスに変換する
 *
 * 実装理由: パス解決の一元化と undefined 安全性確保のため
 * @param values パス文字列配列（undefined 可）
 * @returns 絶対パス配列
 */
export function toAbsList(values: string[] | undefined): string[] {
  if (!values) return [];
  return values.map(v => path.resolve(v));
}

/**
 * 処理名: JSON/YAML 読み込み
 *
 * 処理概要: 指定ファイルを JSON または YAML として読み込む
 *
 * 実装理由: verify spec などの設定ファイル読み込みを一元化するため
 * @param filePath 読み込むファイルパス
 * @returns パース済みオブジェクト
 */
export function loadJsonOrYaml(filePath: string): unknown {
  const loader = new ConfigLoder();
  const text = loader.readConfigSync(filePath);
  return JSON.parse(text);
}

/**
 * 処理名: フォーマット別出力
 *
 * 処理概要: フォーマットに応じて JSON またはテキストで出力する
 *
 * 実装理由: 各コマンドの出力処理を統一するため
 * @param format 出力フォーマット
 * @param payload JSON出力時のペイロード
 * @param text テキスト出力時の文字列
 * @returns void
 */
export function printByFormat(format: OutputFormat, payload: unknown, text: string): void {
  if (format === 'json') {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(text);
}

/**
 * 処理名: トークン解決
 *
 * 処理概要: オプション指定または環境変数から GitHub トークンを取得する
 *
 * 実装理由: トークン取得ロジックを一元化し、複数の環境変数をフォールバック付きで確認するため
 * @param token 明示的なトークン文字列（オプション）
 * @returns 解決されたトークン文字列、または undefined
 */
export function resolveToken(token?: string): string | undefined {
  if (token) return token;
  const candidates = [
    process.env['GITHUB_TOKEN'],
    process.env['GH_TOKEN'],
    process.env['COPILOT_GITHUB_TOKEN'],
  ];
  return candidates.find(t => typeof t === 'string' && t.length > 0);
}

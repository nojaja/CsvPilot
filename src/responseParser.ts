import type { OutputColumnDef, OutputSchema } from './types';

/**
 * コードブロック(```...```)からJSONを取り出す正規表現
 */
const CODE_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/;

/**
 * Copilot応答テキストをJSONオブジェクトとしてパースする。
 * Markdownコードブロックに包まれている場合は中身を取り出してパースする。
 * JSON配列はエラーとする（オブジェクトのみ受け入れ）。
 * @param text Copilot応答テキスト
 * @returns パース済み JSON オブジェクト
 */
export function parseJsonResponse(text: string): Record<string, unknown> {
  const trimmed = text.trim();

  // Markdownコードブロックがあれば中身を優先
  const match = CODE_BLOCK_RE.exec(trimmed);
  const raw = match ? match[1].trim() : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Copilot応答がJSONとしてパースできません: ${raw.slice(0, 200)}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Copilot応答はJSONオブジェクトである必要があります（配列・プリミティブは不可）: ${raw.slice(0, 200)}`
    );
  }

  return parsed as Record<string, unknown>;
}

/**
 * ドット記法パス（例: "summary.label"）でJSONオブジェクトから値を取得する。
 * パスが存在しない場合は undefined を返す。
 * @param obj 対象オブジェクト
 * @param dotPath ドット記法パス
 * @returns 取得した値、または undefined
 */
export function extractByPath(
  obj: Record<string, unknown>,
  dotPath: string
): unknown {
  const keys = dotPath.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * unknown値をCSVセルに格納できる文字列へ変換する。
 * 配列・オブジェクトはJSON文字列化する。
 * @param value 変換対象値
 * @returns CSVセル用文字列
 */
function toCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * OutputSchema の宣言に従って応答オブジェクトから列値を抽出する。
 * - required: true の列が欠落した場合はエラー（ファイル名・行番号付き）
 * - required: false で欠落した場合は default または空文字
 * - 宣言外のキーは無視する
 * @param obj 応答JSONオブジェクト
 * @param schema 出力スキーマ
 * @param context ファイル名と行番号情報
 * @param context.file ファイル名
 * @param context.rowIndex 行番号
 * @returns 列名をキー、値を値とするレコード
 */
export function extractColumns(
  obj: Record<string, unknown>,
  schema: OutputSchema,
  context: { file: string; rowIndex: number }
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const col of schema.columns) {
    const value = extractByPath(obj, col.path);

    if (value === undefined || value === null) {
      if (col.required === true) {
        throw new Error(
          `必須出力列 "${col.name}" が応答に存在しません ` +
          `(ファイル: ${context.file}, 行: ${context.rowIndex})`
        );
      }
      result[col.name] = col.default ?? '';
    } else {
      result[col.name] = toCell(value);
    }
  }

  return result;
}

/**
 * OutputColumnDef 配列から出力列名の配列だけを返す
 * @param columns 出力列定義配列
 * @returns 出力列名配列
 */
export function getOutputColumnNames(columns: OutputColumnDef[]): string[] {
  return columns.map(c => c.name);
}

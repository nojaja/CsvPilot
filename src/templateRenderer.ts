import Handlebars from 'handlebars/dist/cjs/handlebars';
import type { CsvRecord, TemplateContext } from './types';

const compiledCache = new Map<string, ReturnType<typeof Handlebars.compile>>();

/**
 * テンプレートをコンパイルしてキャッシュする
 * @param templateContent テンプレート文字列
 * @returns コンパイル済みテンプレート関数
 */
function getCompiledTemplate(templateContent: string): ReturnType<typeof Handlebars.compile> {
  const cached = compiledCache.get(templateContent);
  if (cached) return cached;

  const compiled = Handlebars.compile(templateContent);
  compiledCache.set(templateContent, compiled);
  return compiled;
}

/**
 * CSVレコードからテンプレートコンテキストを生成する
 * - ヘッダー名でのアクセス: {{fieldName}}
 * - インデックスでのアクセス: {{a1}}, {{a2}}, ...
 * - レコード番号: {{NR}}
 * @param record CSVレコード
 * @param headers ヘッダ列名配列
 * @param recordNumber レコード番号
 * @returns テンプレートコンテキスト
 */
export function buildTemplateContext(
  record: CsvRecord,
  headers: string[],
  recordNumber: number
): TemplateContext {
  const context: TemplateContext = { NR: recordNumber };

  headers.forEach((header, idx) => {
    const value = record[header] ?? '';
    context[header] = value;
    context[`a${idx + 1}`] = value;
  });

  return context;
}

/**
 * テンプレートをレコードデータで展開する
 * @param templateContent テンプレート文字列
 * @param record CSVレコード
 * @param headers ヘッダ列名配列
 * @param recordNumber レコード番号
 * @returns 展開済みテンプレート文字列
 */
export function renderTemplate(
  templateContent: string,
  record: CsvRecord,
  headers: string[],
  recordNumber: number
): string {
  const template = getCompiledTemplate(templateContent);
  const context = buildTemplateContext(record, headers, recordNumber);
  return template(context);
}

/**
 * テンプレートキャッシュをクリアする（テスト用）
 */
export function clearTemplateCache(): void {
  compiledCache.clear();
}

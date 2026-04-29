import Handlebars from 'handlebars';
import type { CsvRecord, TemplateContext } from './types';

const compiledCache = new Map<string, HandlebarsTemplateDelegate>();

/**
 * テンプレートをコンパイルしてキャッシュする
 */
function getCompiledTemplate(templateContent: string): HandlebarsTemplateDelegate {
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

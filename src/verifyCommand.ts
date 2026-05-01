import type { CsvRecord } from './types';
import { loadCsvRecords } from './csvProcessor';
import { loadJsonOrYaml } from './commandCommon';

interface RowCountRule {
  equals?: number;
  min?: number;
  max?: number;
}

interface VerifyRules {
  requiredColumns?: string[];
  rowCount?: RowCountRule;
}

interface VerifySpec {
  rules?: VerifyRules;
}

export interface VerifyIssue {
  file: string;
  rule: string;
  message: string;
}

export interface VerifyReport {
  passed: boolean;
  issues: VerifyIssue[];
}

/**
 * 処理名: requiredColumns ルール検証
 *
 * 処理概要: 必須列が存在しない場合に VerifyIssue を生成する
 *
 * 実装理由: runVerify の Cognitive Complexity を下げるために分離
 * @param headers CSVヘッダ列名配列
 * @param rules 検証ルール
 * @param file 対象ファイルパス
 * @returns 検証結果の VerifyIssue 配列
 */
function checkRequiredColumns(headers: string[], rules: VerifyRules, file: string): VerifyIssue[] {
  if (!rules.requiredColumns) return [];
  return rules.requiredColumns
    .filter(col => !headers.includes(col))
    .map(col => ({ file, rule: 'requiredColumns', message: `必須列が不足: ${col}` }));
}

/**
 * 処理名: rowCount ルール検証
 *
 * 処理概要: 行数ルール（equals/min/max）の違反を検出して VerifyIssue を生成する
 *
 * 実装理由: runVerify の Cognitive Complexity を下げるために分離
 * @param records CSVレコード配列
 * @param rules 検証ルール
 * @param file 対象ファイルパス
 * @returns 検証結果の VerifyIssue 配列
 */
function checkRowCount(records: CsvRecord[], rules: VerifyRules, file: string): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const rc = rules.rowCount;
  if (!rc) return issues;
  if (rc.equals !== undefined && records.length !== rc.equals) {
    issues.push({ file, rule: 'rowCount.equals', message: `行数不一致: expected=${rc.equals}, actual=${records.length}` });
  }
  if (rc.min !== undefined && records.length < rc.min) {
    issues.push({ file, rule: 'rowCount.min', message: `行数が最小未満: min=${rc.min}, actual=${records.length}` });
  }
  if (rc.max !== undefined && records.length > rc.max) {
    issues.push({ file, rule: 'rowCount.max', message: `行数が最大超過: max=${rc.max}, actual=${records.length}` });
  }
  return issues;
}

/**
 * 処理名: 単一ファイル検証
 *
 * 処理概要: 1ファイルに対してすべての検証ルールを適用する
 *
 * 実装理由: runVerify の Cognitive Complexity を下げるために分離
 * @param file 検証対象ファイルパス
 * @param rules 検証ルール
 * @param delimiter CSV区切り文字
 * @returns 検証結果の VerifyIssue 配列
 */
async function verifyOneFile(file: string, rules: VerifyRules, delimiter: string): Promise<VerifyIssue[]> {
  const { headers, records } = await loadCsvRecords(file, delimiter);
  return [
    ...checkRequiredColumns(headers, rules, file),
    ...checkRowCount(records, rules, file),
  ];
}

/**
 * 処理名: 出力CSV検証実行
 *
 * 処理概要: 複数の実際の出力CSVファイルをスペックファイルのルールで検証する
 *
 * 実装理由: AIエージェントが自動的に出力品質を確認できるようにするため
 * @param actualFiles 検証対象CSVファイルパス配列
 * @param specPath 検証ルールYAML/JSONのパス
 * @param delimiter CSV区切り文字
 * @returns 検証レポート
 */
export async function runVerify(actualFiles: string[], specPath: string, delimiter: string): Promise<VerifyReport> {
  const parsed = loadJsonOrYaml(specPath) as VerifySpec;
  const rules = parsed.rules ?? {};
  const allIssues: VerifyIssue[] = [];

  for (const file of actualFiles) {
    const fileIssues = await verifyOneFile(file, rules, delimiter);
    allIssues.push(...fileIssues);
  }

  return { passed: allIssues.length === 0, issues: allIssues };
}

/**
 * 処理名: 検証レポートテキスト変換
 *
 * 処理概要: VerifyReport をテキスト形式に変換する
 *
 * 実装理由: --format text モードでの出力に使用するため
 * @param report 検証レポート
 * @returns テキスト形式の検証結果
 */
export function toVerifyText(report: VerifyReport): string {
  if (report.passed) return '[verify] passed';
  return ['[verify] failed', ...report.issues.map(i => `- ${i.file} ${i.rule}: ${i.message}`)].join('\n');
}

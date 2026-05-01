import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import type { CsvPilotOptions, PromptFile } from './types';
import { resolveCsvFiles, resolvePromptFiles } from './fileResolver';
import { getRecordPrompts, loadPromptFiles } from './promptLoader';
import { buildOutputPath } from './outputWriter';
import { getOutputColumnNames } from './responseParser';

export interface PlanIssue {
  code: string;
  message: string;
}

export interface PlannedOutput {
  input: string;
  prompt: string;
  output: string;
  additionalColumns: string[];
}

export interface ExecutionPlan {
  planId: string;
  generatedAt: string;
  resolvedOptions: CsvPilotOptions;
  inputs: string[];
  prompts: Array<{ path: string; columns: string[] }>;
  matrix: { combinations: number };
  plannedOutputs: PlannedOutput[];
  warnings: PlanIssue[];
  errors: PlanIssue[];
}

/**
 * 処理名: CSVヘッダ読み込み
 *
 * 処理概要: CSVファイルの1行目（ヘッダ行）のみを同期で読み込む
 *
 * 実装理由: plan コマンドで CSV 本文を全件読み込まずヘッダだけ取得するため
 * @param csvPath CSVファイルパス
 * @param delimiter CSV区切り文字
 * @returns ヘッダ列名配列
 */
function readCsvHeaders(csvPath: string, delimiter: string): string[] {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(content, {
    delimiter,
    to_line: 1,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];

  if (!records[0] || records[0].length === 0) {
    throw new Error(`CSVヘッダを読み取れません: ${csvPath}`);
  }
  return records[0];
}

/**
 * 処理名: プロンプト情報収集
 *
 * 処理概要: recordプロンプトファイルの出力スキーマ情報を収集し、エラーがあれば記録する
 *
 * 実装理由: createExecutionPlan の Cognitive Complexity を下げるために分離
 * @param promptFiles プロンプトファイル配列
 * @param errors エラー記録先配列
 * @returns プロンプト情報配列（パスと出力列名）
 */
function collectPromptInfo(promptFiles: PromptFile[], errors: PlanIssue[]): Array<{ path: string; columns: string[] }> {
  const info: Array<{ path: string; columns: string[] }> = [];
  const records = getRecordPrompts(promptFiles);

  for (const prompt of records) {
    if (!prompt.outputSchema) {
      errors.push({
        code: 'MISSING_OUTPUT_SCHEMA',
        message: `output.columns が未定義: ${prompt.path}`,
      });
      continue;
    }

    info.push({
      path: prompt.path,
      columns: getOutputColumnNames(prompt.outputSchema.columns),
    });
  }

  return info;
}

/**
 * 処理名: 単一CSV計画出力生成
 *
 * 処理概要: 1つのCSVに対する計画出力（PlannedOutput）を生成し、衝突があればエラーを記録する
 *
 * 実装理由: createExecutionPlan の Cognitive Complexity を下げるために分離
 * @param csvPath 入力CSVファイルパス
 * @param prompt プロンプト情報
 * @param prompt.path プロンプトファイルパス
 * @param prompt.columns 出力列名配列
 * @param headers CSVヘッダ列名配列
 * @param errors エラー記録先配列
 * @param outputDir 出力先ディレクトリ
 * @returns PlannedOutput（衝突エラー時は null）
 */
function buildPlannedOutput(
  csvPath: string,
  prompt: { path: string; columns: string[] },
  headers: string[],
  errors: PlanIssue[],
  outputDir: string
): PlannedOutput | null {
  const collision = prompt.columns.find(c => headers.includes(c));
  if (collision) {
    errors.push({
      code: 'HEADER_COLLISION',
      message: `出力列名 "${collision}" が入力ヘッダと衝突: ${csvPath} / ${prompt.path}`,
    });
    return null;
  }
  const csvBasename = path.basename(csvPath, '.csv');
  const promptBasename = path.basename(prompt.path).replace('.record.prompt.md', '');
  return {
    input: csvPath,
    prompt: prompt.path,
    output: buildOutputPath(outputDir, csvBasename, promptBasename),
    additionalColumns: prompt.columns,
  };
}

/**
 * 処理名: CSV別計画出力一覧生成
 *
 * 処理概要: 1つのCSVとプロンプト一覧の組み合わせ計画を生成する
 *
 * 実装理由: createExecutionPlan の Cognitive Complexity を下げるために分離
 * @param csvPath 入力CSVファイルパス
 * @param promptInfo プロンプト情報配列
 * @param options 実行オプション
 * @param errors エラー記録先配列
 * @returns PlannedOutput 配列
 */
function buildPlannedOutputsForCsv(
  csvPath: string,
  promptInfo: Array<{ path: string; columns: string[] }>,
  options: CsvPilotOptions,
  errors: PlanIssue[]
): PlannedOutput[] {
  let headers: string[];
  try {
    headers = readCsvHeaders(csvPath, options.delimiter);
  } catch (err) {
    errors.push({
      code: 'CSV_HEADER_READ_FAILED',
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const results: PlannedOutput[] = [];
  for (const prompt of promptInfo) {
    const output = buildPlannedOutput(csvPath, prompt, headers, errors, options.output);
    if (output) results.push(output);
  }
  return results;
}

/**
 * 処理名: 実行計画生成
 *
 * 処理概要: CSV/プロンプト/オプションから実行計画（ExecutionPlan）を生成する
 *
 * 実装理由: LLM呼び出しなしで実行前に失敗リスクを確定し、AIエージェントが安全に操作できるようにするため
 * @param options 実行オプション
 * @returns 実行計画
 */
export async function createExecutionPlan(options: CsvPilotOptions): Promise<ExecutionPlan> {
  const errors: PlanIssue[] = [];
  const warnings: PlanIssue[] = [];

  const promptFilePaths = await resolvePromptFiles(options.prompts);
  const csvPaths = await resolveCsvFiles(options.input);
  const promptFiles = await loadPromptFiles(promptFilePaths);

  const promptInfo = collectPromptInfo(promptFiles, errors);

  if (promptInfo.length === 0) {
    errors.push({ code: 'NO_RECORD_PROMPTS', message: '*.record.prompt.md が見つかりません。' });
  }

  const plannedOutputs: PlannedOutput[] = [];
  for (const csvPath of csvPaths) {
    const outputs = buildPlannedOutputsForCsv(csvPath, promptInfo, options, errors);
    plannedOutputs.push(...outputs);
  }

  if (csvPaths.length === 0) {
    warnings.push({ code: 'NO_INPUTS', message: '入力CSVが見つかりませんでした。' });
  }

  return {
    planId: `plan_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    resolvedOptions: options,
    inputs: csvPaths,
    prompts: promptInfo,
    matrix: { combinations: csvPaths.length * promptInfo.length },
    plannedOutputs,
    warnings,
    errors,
  };
}

/**
 * 処理名: 計画ファイル保存
 *
 * 処理概要: 実行計画をJSONファイルに保存する
 *
 * 実装理由: 計画を保存して run コマンドで再利用できるようにするため
 * @param planPath 保存先ファイルパス
 * @param plan 実行計画
 * @returns void
 */
export function writePlanFile(planPath: string, plan: ExecutionPlan): void {
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
}

/**
 * 処理名: 計画テキスト変換
 *
 * 処理概要: ExecutionPlan をテキスト形式に変換する
 *
 * 実装理由: --format text モードでの出力に使用するため
 * @param plan 実行計画
 * @returns テキスト形式の計画内容
 */
export function toPlanText(plan: ExecutionPlan): string {
  const lines: string[] = [];
  lines.push(`[plan] id: ${plan.planId}`);
  lines.push(`[plan] inputs: ${plan.inputs.length}`);
  lines.push(`[plan] prompts: ${plan.prompts.length}`);
  lines.push(`[plan] combinations: ${plan.matrix.combinations}`);
  lines.push(`[plan] outputs: ${plan.plannedOutputs.length}`);

  if (plan.warnings.length > 0) {
    lines.push('[warnings]');
    for (const w of plan.warnings) lines.push(`- ${w.code}: ${w.message}`);
  }

  if (plan.errors.length > 0) {
    lines.push('[errors]');
    for (const e of plan.errors) lines.push(`- ${e.code}: ${e.message}`);
  }

  return lines.join('\n');
}

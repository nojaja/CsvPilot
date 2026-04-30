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
    let headers: string[] = [];
    try {
      headers = readCsvHeaders(csvPath, options.delimiter);
    } catch (err) {
      errors.push({
        code: 'CSV_HEADER_READ_FAILED',
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    for (const prompt of promptInfo) {
      const collision = prompt.columns.find(c => headers.includes(c));
      if (collision) {
        errors.push({
          code: 'HEADER_COLLISION',
          message: `出力列名 "${collision}" が入力ヘッダと衝突: ${csvPath} / ${prompt.path}`,
        });
        continue;
      }

      const csvBasename = path.basename(csvPath, '.csv');
      const promptBasename = path.basename(prompt.path).replace('.record.prompt.md', '');
      plannedOutputs.push({
        input: csvPath,
        prompt: prompt.path,
        output: buildOutputPath(options.output, csvBasename, promptBasename),
        additionalColumns: prompt.columns,
      });
    }
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

export function writePlanFile(planPath: string, plan: ExecutionPlan): void {
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
}

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

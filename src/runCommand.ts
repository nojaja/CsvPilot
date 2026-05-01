import * as fs from 'fs';
import { run } from './orchestrator';
import type { CsvPilotOptions } from './types';
import type { ExecutionPlan } from './planCommand';

/**
 * 処理名: 実行コマンド（計画任意）
 *
 * 処理概要: planPath が指定された場合は計画からオプションを読み込み処理する
 *
 * 実装理由: run サブコマンドが plan 出力を入力として全て処理できるようにするため
 * @param options 実行オプション
 * @param planPath planコマンドが保存した計画JSONパス（オプション）
 * @returns void
 */
export async function runWithOptionalPlan(options: CsvPilotOptions, planPath?: string): Promise<void> {
  if (!planPath) {
    await run(options);
    return;
  }

  const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8')) as ExecutionPlan;
  console.warn(`[CsvPilot] --plan を使用して実行します: ${plan.planId}`);
  await run(plan.resolvedOptions);
}

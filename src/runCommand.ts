import * as fs from 'fs';
import * as readline from 'readline';
import { run } from './orchestrator';
import type { CsvPilotOptions } from './types';
import type { ExecutionPlan } from './planCommand';

const PREMIUM_REQUEST_WARNING = `
[CsvPilot] ⚠️  Premium Request Consumption Notice
  - Regardless of session mode (whole / folder / file / record),
    premium requests are consumed based on the number of records processed.
  - Model multipliers are applied per mode
    (e.g., Claude Opus 4.6 = ×3, Claude Sonnet 4.6 = ×1, GPT-4o = free)
  - For details: https://docs.github.com/en/copilot/concepts/billing/copilot-requests
`;

/**
 * 処理名: 標準入力から1行読み取る
 *
 * 処理概要: Node.js readline を使って stdin から1行読み取る
 *
 * 実装理由: テスト時に差し替え可能にするためデフォルト実装を分離
 * @returns 入力された文字列
 */
export function defaultInputReader(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('続行しますか？ [yes/no]: ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * 処理名: プレミアムリクエスト消費確認
 *
 * 処理概要: 警告を表示し yes/no で確認する。force が true の場合はスキップする
 *
 * 実装理由: ユーザーが意図せずプレミアムリクエストを大量消費することを防ぐため
 * @param force true の場合は確認をスキップする
 * @param inputReader 入力読み取り関数（省略時は標準入力）
 * @returns void
 * @throws ユーザーが no を選択した場合
 */
export async function confirmPremiumUsage(
  force: boolean,
  inputReader: () => Promise<string> = defaultInputReader
): Promise<void> {
  if (force) return;

  process.stdout.write(PREMIUM_REQUEST_WARNING);
  const answer = await inputReader();

  if (answer !== 'yes' && answer !== 'y') {
    throw new Error('Processing cancelled by user.');
  }
}

/**
 * 処理名: 実行コマンド（計画任意）
 *
 * 処理概要: planPath が指定された場合は計画からオプションを読み込み処理する
 *
 * 実装理由: run サブコマンドが plan 出力を入力として全て処理できるようにするため
 * @param options 実行オプション
 * @param planPath planコマンドが保存した計画JSONパス（オプション）
 * @param inputReader 入力読み取り関数（省略時は標準入力）
 * @returns void
 */
export async function runWithOptionalPlan(
  options: CsvPilotOptions,
  planPath?: string,
  inputReader?: () => Promise<string>
): Promise<void> {
  await confirmPremiumUsage(options.force ?? false, inputReader);

  if (!planPath) {
    await run(options);
    return;
  }

  const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8')) as ExecutionPlan;
  console.warn(`[CsvPilot] --plan を使用して実行します: ${plan.planId}`);
  await run(plan.resolvedOptions);
}

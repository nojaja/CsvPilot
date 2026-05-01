import type { CsvPilotOptions } from './types';
import { resolveToken } from './commandCommon';
import { createExecutionPlan } from './planCommand';

export interface DoctorCheckResult {
  item: string;
  status: 'pass' | 'warn' | 'fail';
  remediation?: string;
  detail?: string;
}

export interface DoctorReport {
  checks: DoctorCheckResult[];
}

/**
 * 処理名: Node.jsバージョンチェック
 *
 * 処理概要: 現在の Node.js バージョンが要件を満たすかを確認する
 *
 * 実装理由: doctor チェック項目の1つとして分離するため
 * @returns DoctorCheckResult
 */
function nodeCheck(): DoctorCheckResult {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 18) {
    return { item: 'node', status: 'pass', detail: process.versions.node };
  }
  return {
    item: 'node',
    status: 'fail',
    detail: process.versions.node,
    remediation: 'Node.js 18 以上を利用してください。',
  };
}

/**
 * 処理名: 実行前診断実行
 *
 * 処理概要: 環境と設定の健全性を診断してレポートを返す
 *
 * 実装理由: AIAgentが実行前に失敗要因を自己修復できるようにするため
 * @param options 実行オプション
 * @returns DoctorReport
 */
export async function runDoctor(options: CsvPilotOptions): Promise<DoctorReport> {
  const checks: DoctorCheckResult[] = [nodeCheck()];

  const token = resolveToken(options.token);
  checks.push(
    token
      ? { item: 'token', status: 'pass' }
      : {
          item: 'token',
          status: 'warn',
          remediation: '--token または GITHUB_TOKEN を設定してください。',
        }
  );

  const plan = await createExecutionPlan(options);
  if (plan.errors.length > 0) {
    checks.push({
      item: 'paths/prompts',
      status: 'fail',
      detail: `${plan.errors.length} errors`,
      remediation: 'plan の errors を修正してください。',
    });
  } else {
    checks.push({ item: 'paths/prompts', status: 'pass' });
  }

  if (options.byok?.provider && !options.model) {
    checks.push({
      item: 'model',
      status: 'fail',
      remediation: 'byok.provider 利用時は --model を指定してください。',
    });
  } else {
    checks.push({ item: 'model', status: 'pass' });
  }

  if (options.proxy?.http || options.proxy?.https) {
    checks.push({ item: 'proxy', status: 'pass' });
  }

  return { checks };
}

/**
 * 処理名: 診断レポートテキスト変換
 *
 * 処理概要: DoctorReport をテキスト形式に変換する
 *
 * 実装理由: --format text モードでの出力に使用するため
 * @param report 診断Report
 * @returns テキスト形式の診断結果
 */
export function toDoctorText(report: DoctorReport): string {
  return report.checks
    .map(c => {
      const suffix = c.remediation ? ` / fix: ${c.remediation}` : '';
      const detail = c.detail ? ` (${c.detail})` : '';
      return `[${c.status}] ${c.item}${detail}${suffix}`;
    })
    .join('\n');
}

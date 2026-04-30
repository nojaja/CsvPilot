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

export function toDoctorText(report: DoctorReport): string {
  return report.checks
    .map(c => {
      const suffix = c.remediation ? ` / fix: ${c.remediation}` : '';
      const detail = c.detail ? ` (${c.detail})` : '';
      return `[${c.status}] ${c.item}${detail}${suffix}`;
    })
    .join('\n');
}

import * as fs from 'fs';
import { run } from './orchestrator';
import type { CsvPilotOptions } from './types';
import type { ExecutionPlan } from './planCommand';

export async function runWithOptionalPlan(options: CsvPilotOptions, planPath?: string): Promise<void> {
  if (!planPath) {
    await run(options);
    return;
  }

  const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8')) as ExecutionPlan;
  console.warn(`[CsvPilot] --plan を使用して実行します: ${plan.planId}`);
  await run(plan.resolvedOptions);
}

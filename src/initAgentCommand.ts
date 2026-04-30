import * as fs from 'fs';
import * as path from 'path';

export interface InitAgentResult {
  outputDir: string;
  files: string[];
}

function mustWrite(filePath: string, force: boolean): void {
  if (!force && fs.existsSync(filePath)) {
    throw new Error(`既存ファイルがあるため生成できません: ${filePath} (--force で上書き可)`);
  }
}

export function runInitAgent(outputDir: string, force: boolean): InitAgentResult {
  const abs = path.resolve(outputDir);
  fs.mkdirSync(abs, { recursive: true });

  const configPath = path.join(abs, 'agent.config.yaml');
  const verifyPath = path.join(abs, 'verify.spec.yaml');
  const tasksPath = path.join(abs, 'tasks.md');

  mustWrite(configPath, force);
  mustWrite(verifyPath, force);
  mustWrite(tasksPath, force);

  fs.writeFileSync(
    configPath,
    [
      'prompts:',
      '  - sample/prompt',
      'input:',
      '  - sample/csv/reviews.csv',
      'output: sample/output',
      'mode: record',
      'model: gpt-5.3-codex',
      'delimiter: ","',
    ].join('\n'),
    'utf-8'
  );

  fs.writeFileSync(
    verifyPath,
    [
      'rules:',
      '  requiredColumns:',
      '    - sentiment',
      '    - reason',
      '  rowCount:',
      '    min: 1',
    ].join('\n'),
    'utf-8'
  );

  fs.writeFileSync(
    tasksPath,
    [
      '# Agent Tasks',
      '',
      '1. csvpilot doctor -c .csvpilot/agent.config.yaml',
      '2. csvpilot plan -c .csvpilot/agent.config.yaml --format json',
      '3. csvpilot run -c .csvpilot/agent.config.yaml',
      '4. csvpilot verify --actual sample/output --spec .csvpilot/verify.spec.yaml',
    ].join('\n'),
    'utf-8'
  );

  return { outputDir: abs, files: [configPath, verifyPath, tasksPath] };
}

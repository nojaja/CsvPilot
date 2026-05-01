import * as fs from 'fs';
import * as path from 'path';

export interface InitAgentResult {
  outputDir: string;
  files: string[];
}

/**
 * 処理名: ファイル上書きガード
 *
 * 処理概要: force フラグなしで既存ファイルに書き込もうとした場合にエラーをスローする
 *
 * 実装理由: 既存ファイルの誤上書きを防止するため
 * @param filePath 確認対象ファイルパス
 * @param force true の場合は既存ファイルを許可
 * @returns void
 */
function mustWrite(filePath: string, force: boolean): void {
  if (!force && fs.existsSync(filePath)) {
    throw new Error(`既存ファイルがあるため生成できません: ${filePath} (--force で上書き可)`);
  }
}

/**
 * 処理名: AIAgent向テンプレート生成
 *
 * 処理概要: AIAgentが最短で着手できる設定テンプレートを生成する
 *
 * 実装理由: init agent サブコマンドでAIエージェントが追加説明なしで操作できるようにするため
 * @param outputDir 出力先ディレクトリ
 * @param force 既存ファイルを上書きするかどうか
 * @returns 生成結果情報
 */
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

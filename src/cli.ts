import { Command } from 'commander';
import { run } from './orchestrator';
import type { CsvPilotOptions, SessionMode } from './types';

declare const __VERSION__: string | undefined;

/**
 * Commanderプログラムを生成する
 */
export function createCli(): Command {
  const program = new Command();
  const version = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

  program
    .name('csvpilot')
    .description('GitHub Copilot SDK を使ってCSVを1行ずつ処理するCLIアプリ')
    .version(version);

  program
    .requiredOption('-p, --prompts <paths...>', 'prompt.mdファイルまたはフォルダ（複数可）')
    .requiredOption('-i, --input <paths...>', 'CSVファイルまたはフォルダ（複数可）')
    .option('-q, --query <query>', 'RBQLクエリ（省略時は全行処理）')
    .requiredOption('-o, --output <dir>', '出力先フォルダ')
    .option('-m, --mode <mode>', 'セッションモード: whole | record', 'whole')
    .option('--token <token>', 'GitHub認証トークン（省略時は環境変数）')
    .option('--model <model>', '使用モデル名')
    .option('--delimiter <char>', 'CSV区切り文字', ',');

  program.action(async () => {
    const opts = program.opts();
    const options: CsvPilotOptions = buildOptions(opts);

    try {
      await run(options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[CsvPilot] 処理エラー: ${msg}`);
      process.exit(1);
    }
  });

  return program;
}

/**
 * Commander optsからCsvPilotOptionsを生成する
 */
function buildOptions(opts: Record<string, unknown>): CsvPilotOptions {
  const mode: SessionMode = opts['mode'] === 'record' ? 'record' : 'whole';
  return {
    prompts: opts['prompts'] as string[],
    input: opts['input'] as string[],
    query: opts['query'] as string | undefined,
    output: opts['output'] as string,
    mode,
    token: opts['token'] as string | undefined,
    model: opts['model'] as string | undefined,
    delimiter: (opts['delimiter'] as string) ?? ',',
  };
}

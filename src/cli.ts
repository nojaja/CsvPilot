import { Command } from 'commander';
import { run } from './orchestrator';
import { loadConfigFiles } from './configLoader';
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
    .option('-p, --prompts <paths...>', 'prompt.mdファイルまたはフォルダ（複数可）')
    .option('-i, --input <paths...>', 'CSVファイルまたはフォルダ（複数可）')
    .option('-q, --query <query>', 'RBQLクエリ（省略時は全行処理）')
    .option('-o, --output <dir>', '出力先フォルダ')
    .option('-m, --mode <mode>', 'セッションモード: whole | record')
    .option('--token <token>', 'GitHub認証トークン（省略時は環境変数）')
    .option('--model <model>', '使用モデル名')
    .option('--delimiter <char>', 'CSV区切り文字')
    .option('-c, --config <path...>', '設定ファイル（json/yaml、複数指定可）');

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
export function buildOptions(opts: Record<string, unknown>): CsvPilotOptions {
  const configPaths = asStringArray(opts['config']);
  const config = loadConfigFiles(configPaths);

  const prompts = asStringArray(opts['prompts']) ?? config.prompts;
  const input = asStringArray(opts['input']) ?? config.input;
  const output = asString(opts['output']) ?? config.output;

  if (!prompts || prompts.length === 0) {
    throw new Error('prompts is required. Use --prompts or set prompts in --config.');
  }
  if (!input || input.length === 0) {
    throw new Error('input is required. Use --input or set input in --config.');
  }
  if (!output) {
    throw new Error('output is required. Use --output or set output in --config.');
  }

  const modeValue = asString(opts['mode']) ?? config.mode;
  const mode: SessionMode = modeValue === 'record' ? 'record' : 'whole';

  const model = asString(opts['model']) ?? config.model;
  const delimiter = asString(opts['delimiter']) ?? config.delimiter ?? ',';

  if (config.byok?.provider && !model) {
    throw new Error('model is required when byok.provider is configured.');
  }

  return {
    prompts,
    input,
    query: asString(opts['query']) ?? config.query,
    output,
    mode,
    token: asString(opts['token']) ?? config.token,
    model,
    delimiter,
    byok: config.byok,
    proxy: config.proxy,
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === 'string');
}

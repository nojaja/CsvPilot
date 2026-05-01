import { Command } from 'commander';
import { runWithOptionalPlan } from './runCommand';
import { loadConfigFiles } from './configLoader';
import { resolveCsvFiles } from './fileResolver';
import { resolveOutputFormat, printByFormat } from './commandCommon';
import { runDoctor, toDoctorText } from './doctorCommand';
import { createExecutionPlan, toPlanText, writePlanFile } from './planCommand';
import { runVerify, toVerifyText } from './verifyCommand';
import { runInitAgent } from './initAgentCommand';
import type { CsvPilotOptions, SessionMode } from './types';

declare const __VERSION__: string | undefined;

const FORMAT_OPTION_FLAG = '--format <format>';
const FORMAT_OPTION_DESC = '出力形式: text | json';

/**
 * Commanderプログラムを生成する
 * @returns Commander プログラムインスタンス
 */
export function createCli(): Command {
  const program = new Command();
  const version = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';

  program
    .name('csvpilot')
    .description('GitHub Copilot SDK を使ってCSVを1行ずつ処理するCLIアプリ')
    .version(version)
    .showHelpAfterError()
    .enablePositionalOptions();

  const addRunOptions = (cmd: Command): Command => cmd
    .option('-p, --prompts <paths...>', 'prompt.mdファイルまたはフォルダ（複数可）')
    .option('-i, --input <paths...>', 'CSVファイルまたはフォルダ（複数可）')
    .option('-q, --query <query>', 'RBQLクエリ（省略時は全行処理）')
    .option('-o, --output <dir>', '出力先フォルダ')
    .option('-m, --mode <mode>', 'セッションモード: whole | folder | file | record')
    .option('--token <token>', 'GitHub認証トークン（省略時は環境変数）')
    .option('--model <model>', '使用モデル名')
    .option('--delimiter <char>', 'CSV区切り文字')
    .option('-c, --config <path...>', '設定ファイル（json/yaml、複数指定可）');

  addRunOptions(program.command('run').description('CSV処理を実行する'))
    .option('--plan <path>', 'plan コマンドが出力した計画JSON')
    .action(async (opts) => {
      const options: CsvPilotOptions = buildOptions(opts);

      try {
        await runWithOptionalPlan(options, asString(opts['plan']));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[CsvPilot] 処理エラー: ${msg}`);
        process.exit(1);
      }
    });

  addRunOptions(program.command('doctor').description('実行前の環境/設定診断を行う'))
    .option(FORMAT_OPTION_FLAG, FORMAT_OPTION_DESC)
    .action(async (opts) => {
      const options: CsvPilotOptions = buildOptions(opts);
      const report = await runDoctor(options);
      const hasFail = report.checks.some(c => c.status === 'fail');

      printByFormat(
        resolveOutputFormat(opts['format']),
        report,
        toDoctorText(report)
      );

      process.exit(hasFail ? 3 : 0);
    });

  addRunOptions(program.command('plan').description('dry run: 実行計画を作成する（LLM呼び出しなし）'))
    .option(FORMAT_OPTION_FLAG, FORMAT_OPTION_DESC)
    .option('--save-plan <path>', '計画JSONの保存先')
    .action(async (opts) => {
      const options: CsvPilotOptions = buildOptions(opts);
      const plan = await createExecutionPlan(options);
      const format = resolveOutputFormat(opts['format']);

      if (asString(opts['savePlan'])) {
        writePlanFile(asString(opts['savePlan'])!, plan);
      }

      printByFormat(format, plan, toPlanText(plan));

      if (plan.errors.length > 0) process.exit(3);
      if (plan.warnings.length > 0) process.exit(2);
      process.exit(0);
    });

  program.command('verify')
    .description('出力CSVを検証する')
    .requiredOption('--actual <paths...>', '検証対象CSVファイル/フォルダ')
    .requiredOption('--spec <path>', '検証ルールYAML/JSON')
    .option('--delimiter <char>', 'CSV区切り文字')
    .option(FORMAT_OPTION_FLAG, FORMAT_OPTION_DESC)
    .action(async (opts) => {
      try {
        const actual = asStringArray(opts['actual']) ?? [];
        const csvFiles = await resolveCsvFiles(actual);
        const report = await runVerify(
          csvFiles,
          asString(opts['spec'])!,
          asString(opts['delimiter']) ?? ','
        );

        printByFormat(
          resolveOutputFormat(opts['format']),
          report,
          toVerifyText(report)
        );

        process.exit(report.passed ? 0 : 5);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[CsvPilot] verify エラー: ${msg}`);
        process.exit(1);
      }
    });

  program.command('init')
    .description('テンプレート生成')
    .command('agent')
    .description('AIエージェント向け設定テンプレートを生成')
    .option('--output <dir>', '出力先ディレクトリ', '.csvpilot')
    .option('--force', '既存ファイルを上書き')
    .action((opts) => {
      try {
        const result = runInitAgent(asString(opts['output']) ?? '.csvpilot', Boolean(opts['force']));
        console.log(`[CsvPilot] テンプレート生成完了: ${result.outputDir}`);
        console.log('次の手順:');
        console.log('1. csvpilot doctor -c .csvpilot/agent.config.yaml');
        console.log('2. csvpilot plan -c .csvpilot/agent.config.yaml --format json');
        console.log('3. csvpilot run -c .csvpilot/agent.config.yaml');
        console.log('4. csvpilot verify --actual sample/output --spec .csvpilot/verify.spec.yaml');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[CsvPilot] init agent エラー: ${msg}`);
        process.exit(1);
      }
    });

  program.action(() => {
    program.help();
  });

  return program;
}

/**
 * Commander optsからCsvPilotOptionsを生成する
 * @param opts Commander opts オブジェクト
 * @returns 解決済み実行オプション
 */
export function buildOptions(opts: Record<string, unknown>): CsvPilotOptions {
  const configPaths = asStringArray(opts['config']);
  const config = loadConfigFiles(configPaths);
  const resolved = resolveCliValues(opts, config);

  validateRequiredOptions(resolved.prompts, resolved.input, resolved.output);

  if (config.byok?.provider && !resolved.model) {
    throw new Error('model is required when byok.provider is configured.');
  }

  return {
    prompts: resolved.prompts!,
    input: resolved.input!,
    query: resolved.query,
    output: resolved.output!,
    mode: resolveSessionMode(resolved.modeValue),
    token: resolved.token,
    model: resolved.model,
    delimiter: resolved.delimiter,
    byok: config.byok,
    proxy: config.proxy,
  };
}

/**
 * 処理名: CLIオプション値解決
 *
 * 処理概要: Commander opts と設定ファイルの値を統合して解決済み値オブジェクトを返す
 *
 * 実装理由: buildOptions の Cognitive Complexity を下げるために分離
 * @param opts Commander opts オブジェクト
 * @param config 設定ファイルの値
 * @returns 解決済みオプション値
 */
function resolveCliValues(opts: Record<string, unknown>, config: ReturnType<typeof loadConfigFiles>): {
  prompts: string[] | undefined;
  input: string[] | undefined;
  output: string | undefined;
  modeValue: string | undefined;
  model: string | undefined;
  delimiter: string;
  query: string | undefined;
  token: string | undefined;
} {
  return {
    prompts: asStringArray(opts['prompts']) ?? config.prompts,
    input: asStringArray(opts['input']) ?? config.input,
    output: asString(opts['output']) ?? config.output,
    modeValue: asString(opts['mode']) ?? config.mode,
    model: asString(opts['model']) ?? config.model,
    delimiter: asString(opts['delimiter']) ?? config.delimiter ?? ',',
    query: asString(opts['query']) ?? config.query,
    token: asString(opts['token']) ?? config.token,
  };
}

/**
 * 処理名: 必須オプション検証
 *
 * 処理概要: prompts/input/output が設定されているかを検証する
 *
 * 実装理由: buildOptions の Cognitive Complexity を下げるために分離
 * @param prompts プロンプトパス配列
 * @param input 入力CSVパス配列
 * @param output 出力先ディレクトリ
 * @returns void
 */
function validateRequiredOptions(
  prompts: string[] | undefined,
  input: string[] | undefined,
  output: string | undefined
): void {
  if (!prompts || prompts.length === 0) {
    throw new Error('prompts is required. Use --prompts or set prompts in --config.');
  }
  if (!input || input.length === 0) {
    throw new Error('input is required. Use --input or set input in --config.');
  }
  if (!output) {
    throw new Error('output is required. Use --output or set output in --config.');
  }
}

/**
 * 処理名: セッションモード解決
 *
 * 処理概要: 文字列をセッションモードに変換する
 *
 * 実装理由: 不正値をデフォルト（whole）に統一するため
 * @param modeValue モード文字列（undefined 可）
 * @returns セッションモード
 */
function resolveSessionMode(modeValue: string | undefined): SessionMode {
  if (modeValue === 'folder' || modeValue === 'file' || modeValue === 'record') {
    return modeValue;
  }
  return 'whole';
}

/**
 * 処理名: 文字列変換
 *
 * 処理概要: unknown を string に変換する。文字列以外は undefined を返す
 *
 * 実装理由: Commander opts の型安全な取り出しを一元化するため
 * @param value 変換対象の値
 * @returns 文字列、または undefined
 */
function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * 処理名: 文字列配列変換
 *
 * 処理概要: unknown を string[] に変換する。変換不可の場合は undefined を返す
 *
 * 実装理由: Commander opts の型安全な取り出しを一元化するため
 * @param value 変換対象の値
 * @returns 文字列配列、または undefined
 */
function asStringArray(value: unknown): string[] | undefined {
  if (typeof value === 'string') {
    return [value];
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === 'string');
}


import * as path from 'path';
import type { CopilotClient } from '@github/copilot-sdk';
import type { CopilotSession } from '@github/copilot-sdk';
import type { ProviderConfig } from '@github/copilot-sdk';
import type { CsvPilotOptions, CsvRecord, PromptFile, SessionMode } from './types';
import { resolvePromptFiles, resolveCsvFiles } from './fileResolver';
import { loadPromptFiles, buildSystemMessage, getRecordPrompts } from './promptLoader';
import { loadCsvRecords, loadCsvHeaders } from './csvProcessor';
import { renderTemplate } from './templateRenderer';
import { buildOutputPath, createOutputWriter, isOutputFilePath } from './outputWriter';
import type { CsvOutputWriter } from './outputWriter';
import { parseJsonResponse, extractColumns, getOutputColumnNames } from './responseParser';
import {
  startClient,
  createCopilotSession,
  sendPrompt,
  disconnectSession,
  stopClient,
} from './sessionManager';

/**
 * 1レコードをCopilotに送信して結果を出力する
 * @param session Copilotセッション
 * @param record CSVレコード
 * @param headers CSVヘッダ列名配列
 * @param rowIndex 行番号（1始まり）
 * @param recordPrompt recordプロンプトファイル
 * @param writer CSVライター
 * @param csvPath 入力CSVファイルパス
 * @returns void
 */
async function processRecord(
  session: CopilotSession,
  record: CsvRecord,
  headers: string[],
  rowIndex: number,
  recordPrompt: PromptFile,
  writer: CsvOutputWriter,
  csvPath: string
): Promise<void> {
  const prompt = renderTemplate(recordPrompt.content, record, headers, rowIndex);
  const response = await sendPrompt(session, prompt);

  const parsed = parseJsonResponse(response);
  const responseValues = extractColumns(
    parsed,
    recordPrompt.outputSchema!,
    { file: path.basename(csvPath), rowIndex }
  );

  await writer.writeRow(record, responseValues);
}

/**
 * 全レコードを単一セッションで処理する（wholeモード）
 * @param session Copilotセッション
 * @param records CSVレコード配列
 * @param headers CSVヘッダ列名配列
 * @param recordPrompt recordプロンプトファイル
 * @param writer CSVライター
 * @param csvPath 入力CSVファイルパス
 * @returns void
 */
async function processWithWholeSession(
  session: CopilotSession,
  records: CsvRecord[],
  headers: string[],
  recordPrompt: PromptFile,
  writer: CsvOutputWriter,
  csvPath: string
): Promise<void> {
  for (let i = 0; i < records.length; i++) {
    await processRecord(session, records[i], headers, i + 1, recordPrompt, writer, csvPath);
  }
}

/**
 * 各レコードを独立セッションで処理する（recordモード）
 * @param client CopilotClient
 * @param records CSVレコード配列
 * @param headers CSVヘッダ列名配列
 * @param recordPrompt recordプロンプトファイル
 * @param writer CSVライター
 * @param systemMessage システムメッセージ
 * @param csvPath 入力CSVファイルパス
 * @param model 使用モデル名
 * @param provider プロバイダー設定
 * @returns void
 */
async function processWithRecordSession(
  client: CopilotClient,
  records: CsvRecord[],
  headers: string[],
  recordPrompt: PromptFile,
  writer: CsvOutputWriter,
  systemMessage: string,
  csvPath: string,
  model?: string,
  provider?: ProviderConfig
): Promise<void> {
  for (let i = 0; i < records.length; i++) {
    const session = await createCopilotSession(client, systemMessage, model, provider);
    await processRecord(session, records[i], headers, i + 1, recordPrompt, writer, csvPath);
    await disconnectSession(session);
  }
}

/**
 * record.prompt.md の出力スキーマを検証し、入力ヘッダとの衝突を確認する
 * @param recordPrompt recordプロンプトファイル
 * @param inputHeaders 入力CSVのヘッダ列名配列
 * @returns void
 */
function validateSchemaAgainstHeaders(
  recordPrompt: PromptFile,
  inputHeaders: string[]
): void {
  if (!recordPrompt.outputSchema) {
    throw new Error(
      `"${recordPrompt.path}" には output.columns の宣言がありません。` +
      ' frontmatter に output: columns: を追加してください。'
    );
  }

  const outputNames = getOutputColumnNames(recordPrompt.outputSchema.columns);
  const headerSet = new Set(inputHeaders);

  for (const name of outputNames) {
    if (headerSet.has(name)) {
      throw new Error(
        `出力列名 "${name}" が入力CSVのヘッダ列名と衝突しています ` +
        `(プロンプト: ${recordPrompt.path})`
      );
    }
  }
}

/**
 * (CSVファイル, record.prompt.md) の1組み合わせを処理する
 * @param csvPath 入力CSVファイルパス
 * @param recordPrompt recordプロンプトファイル
 * @param options 実行オプション
 * @param client CopilotClient
 * @param sharedSession 共有セッション（nullの場合はレコード別セッション）
 * @param systemMessage システムメッセージ
 * @returns void
 */
async function processOneCombo(
  csvPath: string,
  recordPrompt: PromptFile,
  options: CsvPilotOptions,
  client: CopilotClient,
  sharedSession: CopilotSession | null,
  systemMessage: string,
  sharedWriter?: CsvOutputWriter
): Promise<void> {
  const csvBasename = path.basename(csvPath, '.csv');
  const { headers, records } = await loadCsvRecords(csvPath, options.delimiter, options.query);

  validateSchemaAgainstHeaders(recordPrompt, headers);

  const additionalColumns = getOutputColumnNames(recordPrompt.outputSchema!.columns);

  let writer: CsvOutputWriter;
  let outputPath: string;
  if (sharedWriter) {
    writer = sharedWriter;
    outputPath = options.output;
  } else {
    outputPath = buildOutputPath(options.output, csvBasename, recordPrompt.basename);
    writer = await createOutputWriter(outputPath, headers, additionalColumns);
  }

  if (sharedSession) {
    await processWithWholeSession(
      sharedSession, records, headers, recordPrompt, writer, csvPath
    );
  } else {
    await processWithRecordSession(
      client,
      records,
      headers,
      recordPrompt,
      writer,
      systemMessage,
      csvPath,
      options.model,
      options.byok?.provider
    );
  }

  if (!sharedWriter) {
    await writer.close();
    console.log(`[CsvPilot] 出力完了: ${outputPath} (${records.length}件)`);
  } else {
    console.log(`[CsvPilot] 書き込み完了: ${csvPath} / ${recordPrompt.basename} (${records.length}件)`);
  }
}

/**
 * 全(CSV×record.prompt.md)の組み合わせを処理する（wholeモード専用）
 * @param csvPaths 入力CSVファイルパス配列
 * @param recordPrompts recordプロンプトファイル配列
 * @param options 実行オプション
 * @param client CopilotClient
 * @param wholeSession 共有セッション
 * @param systemMessage システムメッセージ
 * @returns void
 */
async function processWholeMode(
  csvPaths: string[],
  recordPrompts: PromptFile[],
  options: CsvPilotOptions,
  client: CopilotClient,
  wholeSession: CopilotSession,
  systemMessage: string,
  sharedWriter?: CsvOutputWriter
): Promise<void> {
  for (const csvPath of csvPaths) {
    for (const recordPrompt of recordPrompts) {
      await processOneCombo(csvPath, recordPrompt, options, client, wholeSession, systemMessage, sharedWriter);
    }
  }
}

/**
 * 全(CSV×record.prompt.md)の組み合わせを処理する（recordモード専用）
 * @param csvPaths 入力CSVファイルパス配列
 * @param recordPrompts recordプロンプトファイル配列
 * @param options 実行オプション
 * @param client CopilotClient
 * @param systemMessage システムメッセージ
 * @returns void
 */
async function processRecordMode(
  csvPaths: string[],
  recordPrompts: PromptFile[],
  options: CsvPilotOptions,
  client: CopilotClient,
  systemMessage: string,
  sharedWriter?: CsvOutputWriter
): Promise<void> {
  for (const csvPath of csvPaths) {
    for (const recordPrompt of recordPrompts) {
      await processOneCombo(csvPath, recordPrompt, options, client, null, systemMessage, sharedWriter);
    }
  }
}

/**
 * 全(CSV×record.prompt.md)の組み合わせを処理する（folder/fileモード専用）
 * @param csvPaths 入力CSVファイルパス配列
 * @param recordPrompts recordプロンプトファイル配列
 * @param options 実行オプション
 * @param client CopilotClient
 * @param systemMessage システムメッセージ
 * @returns void
 */
async function processGroupedMode(
  csvPaths: string[],
  recordPrompts: PromptFile[],
  options: CsvPilotOptions,
  client: CopilotClient,
  systemMessage: string,
  sharedWriter?: CsvOutputWriter
): Promise<void> {
  const sessionGroups = buildSessionGroups(csvPaths, options.mode);
  for (const groupedCsvPaths of sessionGroups.values()) {
    const session = await createCopilotSession(
      client,
      systemMessage,
      options.model,
      options.byok?.provider
    );
    try {
      for (const csvPath of groupedCsvPaths) {
        for (const recordPrompt of recordPrompts) {
          await processOneCombo(csvPath, recordPrompt, options, client, session, systemMessage, sharedWriter);
        }
      }
    } finally {
      await disconnectSession(session);
    }
  }
}

/**
 * 全(CSV×record.prompt.md)の組み合わせを処理する
 * @param csvPaths 入力CSVファイルパス配列
 * @param recordPrompts recordプロンプトファイル配列
 * @param options 実行オプション
 * @param client CopilotClient
 * @param wholeSession wholeモード用共有セッション（nullの場合はモード別処理）
 * @param systemMessage システムメッセージ
 * @returns void
 */
async function processAllCombos(
  csvPaths: string[],
  recordPrompts: PromptFile[],
  options: CsvPilotOptions,
  client: CopilotClient,
  wholeSession: CopilotSession | null,
  systemMessage: string,
  sharedWriter?: CsvOutputWriter
): Promise<void> {
  if (options.mode === 'whole' && wholeSession) {
    await processWholeMode(csvPaths, recordPrompts, options, client, wholeSession, systemMessage, sharedWriter);
    return;
  }
  if (options.mode === 'record') {
    await processRecordMode(csvPaths, recordPrompts, options, client, systemMessage, sharedWriter);
    return;
  }
  await processGroupedMode(csvPaths, recordPrompts, options, client, systemMessage, sharedWriter);
}

/**
 * 処理名: セッショングループ構築
 *
 * 処理概要: CSVパスをセッション共有グループ（フォルダ別またはファイル別）に分類する
 *
 * 実装理由: folder/file モードで適切なセッション境界を設定するため
 * @param csvPaths 入力CSVファイルパス配列
 * @param mode セッションモード
 * @returns セッションキーをキー、CSVパス配列を値とするMap
 */
function buildSessionGroups(csvPaths: string[], mode: SessionMode): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const csvPath of csvPaths) {
    const key = mode === 'folder' ? path.dirname(csvPath) : csvPath;
    const list = groups.get(key);
    if (list) {
      list.push(csvPath);
    } else {
      groups.set(key, [csvPath]);
    }
  }

  return groups;
}

/**
 * wholeモード用のセッションを条件付き作成する
 * @param client CopilotClient
 * @param options 実行オプション
 * @param systemMessage システムメッセージ
 * @returns wholeモードの場合 CopilotSession、それ以外は null
 */
async function createWholeSessionIfNeeded(
  client: CopilotClient,
  options: CsvPilotOptions,
  systemMessage: string
): Promise<CopilotSession | null> {
  if (options.mode !== 'whole') return null;
  return createCopilotSession(client, systemMessage, options.model, options.byok?.provider);
}

/**
 * ファイル出力モード用の共有ライターを作成する
 * 全CSVのヘッダと全プロンプトの追加列のユニオンでライターを初期化する
 * @param options 実行オプション
 * @param csvPaths 入力CSVファイルパス配列
 * @param recordPrompts recordプロンプトファイル配列
 * @returns CsvOutputWriter インスタンス
 */
async function createSharedFileWriter(
  options: CsvPilotOptions,
  csvPaths: string[],
  recordPrompts: PromptFile[]
): Promise<CsvOutputWriter> {
  const seenHeaders = new Set<string>();
  const allInputHeaders: string[] = [];

  for (const csvPath of csvPaths) {
    const headers = await loadCsvHeaders(csvPath, options.delimiter);
    for (const h of headers) {
      if (!seenHeaders.has(h)) {
        seenHeaders.add(h);
        allInputHeaders.push(h);
      }
    }
  }

  const seenCols = new Set<string>();
  const allAdditionalCols: string[] = [];

  for (const rp of recordPrompts) {
    if (rp.outputSchema) {
      const cols = getOutputColumnNames(rp.outputSchema.columns);
      for (const c of cols) {
        if (!seenCols.has(c)) {
          seenCols.add(c);
          allAdditionalCols.push(c);
        }
      }
    }
  }

  return createOutputWriter(options.output, allInputHeaders, allAdditionalCols);
}

/**
 * バイト値をMB単位にフォーマットする
 * @param byte バイト数
 * @returns MB単位の文字列
 */
function toMByte(byte: number): string {
  return `${Math.floor((byte / 1024 / 1024) * 100) / 100}MB`;
}

/**
 * メインオーケストレーション処理
 * @param options 実行オプション
 * @returns void
 */
export async function run(options: CsvPilotOptions): Promise<void> {
  const startTime = process.hrtime();
  process.on('exit', (_exitCode) => {
    const endTimeArray = process.hrtime(startTime);
    const memoryUsage = process.memoryUsage();
    const memoryUsageInfo = JSON.stringify({
      rss: toMByte(memoryUsage.rss),
      heapTotal: toMByte(memoryUsage.heapTotal),
      heapUsed: toMByte(memoryUsage.heapUsed),
      external: toMByte(memoryUsage.external),
      arrayBuffers: toMByte(memoryUsage.arrayBuffers),
    });
    console.log(
      `process statistics - Execution time: ${endTimeArray[0]}s ${endTimeArray[1] / 1000000
      }ms, memoryUsage: ${memoryUsageInfo}`
    );
  });
  const promptFilePaths = await resolvePromptFiles(options.prompts);
  const csvPaths = await resolveCsvFiles(options.input);
  const promptFiles = await loadPromptFiles(promptFilePaths);

  const systemMessage = buildSystemMessage(promptFiles);
  const recordPrompts = getRecordPrompts(promptFiles);

  if (recordPrompts.length === 0) {
    console.warn('[CsvPilot] *.record.prompt.md ファイルが見つかりません。処理をスキップします。');
    return;
  }

  const client = await startClient(options);
  const wholeSession = await createWholeSessionIfNeeded(client, options, systemMessage);

  let sharedWriter: CsvOutputWriter | undefined;
  if (isOutputFilePath(options.output)) {
    sharedWriter = await createSharedFileWriter(options, csvPaths, recordPrompts);
  }

  try {
    await processAllCombos(csvPaths, recordPrompts, options, client, wholeSession, systemMessage, sharedWriter);
    if (sharedWriter) {
      await sharedWriter.close();
      console.log(`[CsvPilot] 出力完了: ${options.output}`);
    }
  } finally {
    if (wholeSession) await disconnectSession(wholeSession);
    await stopClient(client);
  }
}

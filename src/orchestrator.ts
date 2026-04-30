import * as path from 'path';
import type { CopilotClient } from '@github/copilot-sdk';
import type { CopilotSession } from '@github/copilot-sdk';
import type { ProviderConfig } from '@github/copilot-sdk';
import type { CsvPilotOptions, CsvRecord, PromptFile, SessionMode } from './types';
import { resolvePromptFiles, resolveCsvFiles } from './fileResolver';
import { loadPromptFiles, buildSystemMessage, getRecordPrompts } from './promptLoader';
import { loadCsvRecords } from './csvProcessor';
import { renderTemplate } from './templateRenderer';
import { buildOutputPath, createOutputWriter } from './outputWriter';
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
 */
async function processOneCombo(
  csvPath: string,
  recordPrompt: PromptFile,
  options: CsvPilotOptions,
  client: CopilotClient,
  sharedSession: CopilotSession | null,
  systemMessage: string
): Promise<void> {
  const csvBasename = path.basename(csvPath, '.csv');
  const outputPath = buildOutputPath(options.output, csvBasename, recordPrompt.basename);
  const { headers, records } = await loadCsvRecords(csvPath, options.delimiter, options.query);

  validateSchemaAgainstHeaders(recordPrompt, headers);

  const additionalColumns = getOutputColumnNames(recordPrompt.outputSchema!.columns);
  const writer = await createOutputWriter(outputPath, headers, additionalColumns);

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

  await writer.close();
  console.log(`[CsvPilot] 出力完了: ${outputPath} (${records.length}件)`);
}

/**
 * 全(CSV×record.prompt.md)の組み合わせを処理する
 */
async function processAllCombos(
  csvPaths: string[],
  recordPrompts: PromptFile[],
  options: CsvPilotOptions,
  client: CopilotClient,
  wholeSession: CopilotSession | null,
  systemMessage: string
): Promise<void> {
  if (options.mode === 'whole') {
    for (const csvPath of csvPaths) {
      for (const recordPrompt of recordPrompts) {
        await processOneCombo(csvPath, recordPrompt, options, client, wholeSession, systemMessage);
      }
    }
    return;
  }

  if (options.mode === 'record') {
    for (const csvPath of csvPaths) {
      for (const recordPrompt of recordPrompts) {
        await processOneCombo(csvPath, recordPrompt, options, client, null, systemMessage);
      }
    }
    return;
  }

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
          await processOneCombo(csvPath, recordPrompt, options, client, session, systemMessage);
        }
      }
    } finally {
      await disconnectSession(session);
    }
  }
}

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
 * バイト値をMB単位にフォーマットする
 */
function toMByte(byte: number): string {
  return `${Math.floor((byte / 1024 / 1024) * 100) / 100}MB`;
}

/**
 * メインオーケストレーション処理
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
      `process statistics - Execution time: ${endTimeArray[0]}s ${
        endTimeArray[1] / 1000000
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

  try {
    await processAllCombos(csvPaths, recordPrompts, options, client, wholeSession, systemMessage);
  } finally {
    if (wholeSession) await disconnectSession(wholeSession);
    await stopClient(client);
  }
}

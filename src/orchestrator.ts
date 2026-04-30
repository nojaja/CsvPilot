import * as path from 'path';
import type { CopilotClient } from '@github/copilot-sdk';
import type { CopilotSession } from '@github/copilot-sdk';
import type { ProviderConfig } from '@github/copilot-sdk';
import type { CsvPilotOptions, CsvRecord, PromptFile } from './types';
import { resolvePromptFiles, resolveCsvFiles } from './fileResolver';
import { loadPromptFiles, buildSystemMessage, getRecordPrompts } from './promptLoader';
import { loadCsvRecords } from './csvProcessor';
import { renderTemplate } from './templateRenderer';
import { buildOutputPath, createOutputWriter } from './outputWriter';
import type { CsvOutputWriter } from './outputWriter';
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
  template: string,
  writer: CsvOutputWriter
): Promise<void> {
  const prompt = renderTemplate(template, record, headers, rowIndex);
  const response = await sendPrompt(session, prompt);
  await writer.writeRow(record, response);
}

/**
 * 全レコードを単一セッションで処理する（wholeモード）
 */
async function processWithWholeSession(
  session: CopilotSession,
  records: CsvRecord[],
  headers: string[],
  template: string,
  writer: CsvOutputWriter
): Promise<void> {
  for (let i = 0; i < records.length; i++) {
    await processRecord(session, records[i], headers, i + 1, template, writer);
  }
}

/**
 * 各レコードを独立セッションで処理する（recordモード）
 */
async function processWithRecordSession(
  client: CopilotClient,
  records: CsvRecord[],
  headers: string[],
  template: string,
  writer: CsvOutputWriter,
  systemMessage: string,
  model?: string,
  provider?: ProviderConfig
): Promise<void> {
  for (let i = 0; i < records.length; i++) {
    const session = await createCopilotSession(client, systemMessage, model, provider);
    await processRecord(session, records[i], headers, i + 1, template, writer);
    await disconnectSession(session);
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
  wholeSession: CopilotSession | null,
  systemMessage: string
): Promise<void> {
  const csvBasename = path.basename(csvPath, '.csv');
  const outputPath = buildOutputPath(options.output, csvBasename, recordPrompt.basename);
  const { headers, records } = await loadCsvRecords(csvPath, options.delimiter, options.query);
  const writer = await createOutputWriter(outputPath, headers);

  if (options.mode === 'whole' && wholeSession) {
    await processWithWholeSession(wholeSession, records, headers, recordPrompt.content, writer);
  } else {
    await processWithRecordSession(
      client,
      records,
      headers,
      recordPrompt.content,
      writer,
      systemMessage,
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
  for (const csvPath of csvPaths) {
    for (const recordPrompt of recordPrompts) {
      await processOneCombo(csvPath, recordPrompt, options, client, wholeSession, systemMessage);
    }
  }
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

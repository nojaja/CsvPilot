import * as fs from 'fs';
import * as path from 'path';
import { load as yamlLoad } from 'js-yaml';
import type { PromptFile, PromptFileType, OutputSchema, OutputColumnDef } from './types';

const SESSION_SUFFIX = '.session.prompt.md';
const RECORD_SUFFIX = '.record.prompt.md';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * ファイル名からpromptタイプを判別する
 */
function detectPromptType(filePath: string): PromptFileType | null {
  const basename = path.basename(filePath);
  if (basename.endsWith(SESSION_SUFFIX)) return 'session';
  if (basename.endsWith(RECORD_SUFFIX)) return 'record';
  return null;
}

/**
 * promptタイプからbasenameを生成する
 */
function buildPromptBasename(filePath: string, type: PromptFileType): string {
  const basename = path.basename(filePath);
  const suffix = type === 'session' ? SESSION_SUFFIX : RECORD_SUFFIX;
  return basename.replace(suffix, '').replace(/\.$/, '');
}

/**
 * OutputColumnDef 配列を検証する
 */
function validateOutputSchema(schema: OutputSchema, filePath: string): void {
  if (!schema.columns || schema.columns.length === 0) {
    throw new Error(
      `output.columns が空または未定義です (ファイル: ${filePath})`
    );
  }

  const names = new Set<string>();
  for (const col of schema.columns) {
    if (names.has(col.name)) {
      throw new Error(
        `output.columns に列名 "${col.name}" が重複しています (ファイル: ${filePath})`
      );
    }
    names.add(col.name);

    if (col.required === true && col.default !== undefined) {
      throw new Error(
        `列 "${col.name}": required: true と default は同時指定できません (ファイル: ${filePath})`
      );
    }
  }
}

/**
 * frontmatter を解析して本文と OutputSchema に分離する（record type 用）
 * session type には呼び出さないこと。
 */
function parseFrontmatter(
  rawContent: string,
  filePath: string
): { body: string; outputSchema: OutputSchema | undefined } {
  const match = FRONTMATTER_RE.exec(rawContent);

  if (!match) {
    return { body: rawContent, outputSchema: undefined };
  }

  const yamlText = match[1];
  const body = match[2];

  let parsed: unknown;
  try {
    parsed = yamlLoad(yamlText);
  } catch (err) {
    throw new Error(`frontmatter のYAML解析に失敗しました (ファイル: ${filePath}): ${err}`);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('output' in (parsed as object))
  ) {
    return { body, outputSchema: undefined };
  }

  const output = (parsed as Record<string, unknown>)['output'];
  if (typeof output !== 'object' || output === null) {
    return { body, outputSchema: undefined };
  }

  const columns = (output as Record<string, unknown>)['columns'];
  if (!Array.isArray(columns)) {
    return { body, outputSchema: undefined };
  }

  const schema: OutputSchema = {
    columns: columns as OutputColumnDef[],
  };

  validateOutputSchema(schema, filePath);

  return { body, outputSchema: schema };
}

/**
 * frontmatter を取り除いた本文だけを返す（session type 用）
 */
function stripFrontmatter(rawContent: string): string {
  const match = FRONTMATTER_RE.exec(rawContent);
  return match ? match[2] : rawContent;
}

/**
 * 単一のprompt.mdファイルを読み込む
 */
async function loadSinglePromptFile(filePath: string): Promise<PromptFile | null> {
  const type = detectPromptType(filePath);
  if (!type) return null;

  const rawContent = await fs.promises.readFile(filePath, 'utf-8');
  const basename = buildPromptBasename(filePath, type);

  if (type === 'record') {
    const { body, outputSchema } = parseFrontmatter(rawContent, filePath);
    return { path: filePath, type, content: body, basename, outputSchema };
  }

  // session type: frontmatter があっても outputSchema は設定せず、本文だけ返す
  const body = stripFrontmatter(rawContent);
  return { path: filePath, type, content: body, basename };
}

/**
 * 複数のprompt.mdファイルを読み込み、session/recordに分類する
 */
export async function loadPromptFiles(filePaths: string[]): Promise<PromptFile[]> {
  const loaded: PromptFile[] = [];

  for (const filePath of filePaths) {
    const promptFile = await loadSinglePromptFile(filePath);
    if (promptFile) {
      loaded.push(promptFile);
    }
  }

  return loaded;
}

/**
 * sessionタイプのpromptを結合してシステムメッセージを生成する
 */
export function buildSystemMessage(promptFiles: PromptFile[]): string {
  return promptFiles
    .filter(f => f.type === 'session')
    .map(f => f.content)
    .join('\n\n');
}

/**
 * recordタイプのpromptファイルのみを返す
 */
export function getRecordPrompts(promptFiles: PromptFile[]): PromptFile[] {
  return promptFiles.filter(f => f.type === 'record');
}

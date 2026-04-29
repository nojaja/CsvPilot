import * as fs from 'fs';
import * as path from 'path';
import type { PromptFile, PromptFileType } from './types';

const SESSION_SUFFIX = '.session.prompt.md';
const RECORD_SUFFIX = '.record.prompt.md';

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
 * 単一のprompt.mdファイルを読み込む
 */
async function loadSinglePromptFile(filePath: string): Promise<PromptFile | null> {
  const type = detectPromptType(filePath);
  if (!type) return null;

  const content = await fs.promises.readFile(filePath, 'utf-8');
  const basename = buildPromptBasename(filePath, type);

  return { path: filePath, type, content, basename };
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

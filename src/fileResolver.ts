import * as fs from 'fs';
import * as path from 'path';
import { normalizeSeparator, absolutePath } from '@nojaja/pathutil';
import { DirWalker } from '@nojaja/dirwalker';

const PROMPT_EXTENSION = '.prompt.md';
const CSV_EXTENSION = '.csv';

/**
 * pathutilの戻り値を安全にstring変換する
 */
function toSafePath(p: string | null): string {
  if (p === null) throw new Error('パスの正規化に失敗しました');
  return p;
}

/**
 * 単一パスがファイルかフォルダかを判定する
 */
async function isDirectory(targetPath: string): Promise<boolean> {
  const stat = await fs.promises.stat(targetPath);
  return stat.isDirectory();
}

/**
 * フォルダから指定拡張子のファイルを再帰探索する
 */
async function walkDirectory(
  dirPath: string,
  extension: string
): Promise<string[]> {
  const walker = new DirWalker();
  const results: string[] = [];

  await walker.walk(
    dirPath,
    { excludeDirs: [/node_modules/, /\.git/, /dist/] },
    (relativePath: string) => {
      if (relativePath.endsWith(extension)) {
        const absPath = path.join(dirPath, relativePath);
        const safe = normalizeSeparator(absPath);
        if (safe !== null) results.push(safe);
      }
    }
  );

  return results;
}

/**
 * 単一パス（ファイルまたはフォルダ）を解決してファイルパス配列を返す
 */
async function resolveSinglePath(
  rawPath: string,
  extension: string
): Promise<string[]> {
  const normalized = toSafePath(normalizeSeparator(toSafePath(absolutePath(rawPath))));

  const isDir = await isDirectory(normalized);

  if (isDir) {
    return walkDirectory(normalized, extension);
  }

  if (normalized.endsWith(extension)) {
    return [normalized as string];
  }

  return [];
}

/**
 * 複数パス（ファイル/フォルダ混在）を解決してファイルパス配列を返す
 */
export async function resolveFilePaths(
  rawPaths: string[],
  extension: string
): Promise<string[]> {
  const results: string[] = [];

  for (const rawPath of rawPaths) {
    const resolved = await resolveSinglePath(rawPath, extension);
    results.push(...resolved);
  }

  return results;
}

/**
 * prompt.mdファイルパスを解決する
 */
export async function resolvePromptFiles(rawPaths: string[]): Promise<string[]> {
  return resolveFilePaths(rawPaths, PROMPT_EXTENSION);
}

/**
 * CSVファイルパスを解決する
 */
export async function resolveCsvFiles(rawPaths: string[]): Promise<string[]> {
  return resolveFilePaths(rawPaths, CSV_EXTENSION);
}

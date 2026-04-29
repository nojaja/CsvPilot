import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveFilePaths, resolvePromptFiles, resolveCsvFiles } from '../../src/fileResolver';

describe('fileResolver', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'csvpilot-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('resolveFilePaths', () => {
    it('ファイルパスを直接指定した場合、そのパスを返す', async () => {
      const file = path.join(tmpDir, 'test.prompt.md');
      await fs.promises.writeFile(file, 'content');

      const result = await resolveFilePaths([file], '.prompt.md');
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('test.prompt.md');
    });

    it('フォルダ指定の場合、サブフォルダ含む該当ファイルを返す', async () => {
      const subDir = path.join(tmpDir, 'sub');
      await fs.promises.mkdir(subDir);
      await fs.promises.writeFile(path.join(tmpDir, 'a.prompt.md'), 'a');
      await fs.promises.writeFile(path.join(subDir, 'b.prompt.md'), 'b');
      await fs.promises.writeFile(path.join(tmpDir, 'other.txt'), 'other');

      const result = await resolveFilePaths([tmpDir], '.prompt.md');
      expect(result).toHaveLength(2);
      expect(result.every(r => r.endsWith('.prompt.md'))).toBe(true);
    });

    it('拡張子が一致しないファイルは除外する', async () => {
      const file = path.join(tmpDir, 'test.txt');
      await fs.promises.writeFile(file, 'content');

      const result = await resolveFilePaths([file], '.prompt.md');
      expect(result).toHaveLength(0);
    });

    it('複数パスを指定した場合、すべてのファイルを返す', async () => {
      const fileA = path.join(tmpDir, 'a.csv');
      const fileB = path.join(tmpDir, 'b.csv');
      await fs.promises.writeFile(fileA, 'col\n1');
      await fs.promises.writeFile(fileB, 'col\n2');

      const result = await resolveFilePaths([fileA, fileB], '.csv');
      expect(result).toHaveLength(2);
    });
  });

  describe('resolvePromptFiles', () => {
    it('.prompt.md ファイルを正しく解決する', async () => {
      const file = path.join(tmpDir, 'task.record.prompt.md');
      await fs.promises.writeFile(file, 'template');

      const result = await resolvePromptFiles([file]);
      expect(result).toHaveLength(1);
    });
  });

  describe('resolveCsvFiles', () => {
    it('.csv ファイルを正しく解決する', async () => {
      const file = path.join(tmpDir, 'data.csv');
      await fs.promises.writeFile(file, 'a,b\n1,2');

      const result = await resolveCsvFiles([file]);
      expect(result).toHaveLength(1);
    });
  });
});

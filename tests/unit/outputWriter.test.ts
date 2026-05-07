import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildOutputPath, createOutputWriter, isOutputFilePath } from '../../src/outputWriter';

describe('outputWriter', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'csvpilot-out-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('buildOutputPath', () => {
    it('CSVbasenameとpromptbasenameを組み合わせたパスを返す', () => {
      const result = buildOutputPath('/output', 'customers', 'analyze');
      expect(result).toBe(path.join('/output', 'customers__analyze.csv'));
    });

    it('ネストしたフォルダパスでも正しく生成する', () => {
      const result = buildOutputPath('/a/b/c', 'data', 'task');
      expect(result).toContain('data__task.csv');
    });
  });

  describe('createOutputWriter', () => {
    it('動的な追加カラムでヘッダを書き込む', async () => {
      const outputPath = path.join(tmpDir, 'output.csv');
      const writer = await createOutputWriter(outputPath, ['name', 'age'], ['sentiment', 'reason']);

      await writer.writeRow({ name: 'Alice', age: '30' }, { sentiment: 'positive', reason: 'good' });
      await writer.close();

      const content = await fs.promises.readFile(outputPath, 'utf-8');
      expect(content).toContain('name');
      expect(content).toContain('age');
      expect(content).toContain('sentiment');
      expect(content).toContain('reason');
    });

    it('_copilot_response 列が出力に含まれない', async () => {
      const outputPath = path.join(tmpDir, 'no_fixed.csv');
      const writer = await createOutputWriter(outputPath, ['id'], ['result']);

      await writer.writeRow({ id: '1' }, { result: 'ok' });
      await writer.close();

      const content = await fs.promises.readFile(outputPath, 'utf-8');
      expect(content).not.toContain('_copilot_response');
    });

    it('responseValues の値が対応するカラムへ書き込まれる', async () => {
      const outputPath = path.join(tmpDir, 'values.csv');
      const writer = await createOutputWriter(outputPath, ['col'], ['sentiment', 'confidence']);

      await writer.writeRow({ col: 'val' }, { sentiment: 'negative', confidence: '0.75' });
      await writer.close();

      const content = await fs.promises.readFile(outputPath, 'utf-8');
      expect(content).toContain('negative');
      expect(content).toContain('0.75');
    });

    it('additionalColumns に含まれないキーは無視される', async () => {
      const outputPath = path.join(tmpDir, 'extra.csv');
      const writer = await createOutputWriter(outputPath, ['id'], ['sentiment']);

      await writer.writeRow({ id: '1' }, { sentiment: 'positive', unknown_key: 'ignored' });
      await writer.close();

      const content = await fs.promises.readFile(outputPath, 'utf-8');
      expect(content).not.toContain('unknown_key');
    });

    it('出力ディレクトリが存在しない場合は作成する', async () => {
      const nestedDir = path.join(tmpDir, 'a', 'b', 'c');
      const outputPath = path.join(nestedDir, 'output.csv');
      const writer = await createOutputWriter(outputPath, ['col'], ['r']);

      await writer.writeRow({ col: 'val' }, { r: 'resp' });
      await writer.close();

      const exists = await fs.promises.access(outputPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('複数行を連続して書き込める', async () => {
      const outputPath = path.join(tmpDir, 'multi.csv');
      const writer = await createOutputWriter(outputPath, ['id', 'val'], ['result']);

      await writer.writeRow({ id: '1', val: 'a' }, { result: 'resp1' });
      await writer.writeRow({ id: '2', val: 'b' }, { result: 'resp2' });
      await writer.close();

      const content = await fs.promises.readFile(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(3); // header + 2 rows
    });
  });

  describe('isOutputFilePath', () => {
    it('.csv で終わる場合は true を返す', () => {
      expect(isOutputFilePath('output/result.csv')).toBe(true);
    });

    it('.tsv で終わる場合は true を返す', () => {
      expect(isOutputFilePath('output/result.tsv')).toBe(true);
    });

    it('拡張子なしの場合は false を返す', () => {
      expect(isOutputFilePath('output/folder')).toBe(false);
    });

    it('スラッシュで終わるフォルダパスは false を返す', () => {
      expect(isOutputFilePath('output/')).toBe(false);
    });

    it('拡張子なしの相対パスは false を返す', () => {
      expect(isOutputFilePath('output')).toBe(false);
    });
  });
});

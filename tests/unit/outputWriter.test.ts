import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildOutputPath, createOutputWriter } from '../../src/outputWriter';

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
    it('CSVファイルにヘッダー付きで行を書き込む', async () => {
      const outputPath = path.join(tmpDir, 'output.csv');
      const headers = ['name', 'age'];
      const writer = await createOutputWriter(outputPath, headers);

      await writer.writeRow({ name: 'Alice', age: '30' }, 'response text');
      await writer.close();

      const content = await fs.promises.readFile(outputPath, 'utf-8');
      expect(content).toContain('name');
      expect(content).toContain('age');
      expect(content).toContain('_copilot_response');
      expect(content).toContain('Alice');
      expect(content).toContain('response text');
    });

    it('出力ディレクトリが存在しない場合は作成する', async () => {
      const nestedDir = path.join(tmpDir, 'a', 'b', 'c');
      const outputPath = path.join(nestedDir, 'output.csv');
      const writer = await createOutputWriter(outputPath, ['col']);

      await writer.writeRow({ col: 'val' }, 'resp');
      await writer.close();

      const exists = await fs.promises.access(outputPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('複数行を連続して書き込める', async () => {
      const outputPath = path.join(tmpDir, 'multi.csv');
      const writer = await createOutputWriter(outputPath, ['id', 'val']);

      await writer.writeRow({ id: '1', val: 'a' }, 'resp1');
      await writer.writeRow({ id: '2', val: 'b' }, 'resp2');
      await writer.close();

      const content = await fs.promises.readFile(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(3); // header + 2 rows
    });
  });
});

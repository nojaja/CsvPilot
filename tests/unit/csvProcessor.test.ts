import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadCsvRecords, streamCsvRows } from '../../src/csvProcessor';

describe('csvProcessor', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'csvpilot-csv-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('loadCsvRecords', () => {
    it('CSVを読み込んでheadersとrecordsを返す', async () => {
      const csvPath = path.join(tmpDir, 'test.csv');
      await fs.promises.writeFile(csvPath, 'name,age\nAlice,30\nBob,25\n');

      const { headers, records } = await loadCsvRecords(csvPath, ',');

      expect(headers).toEqual(['name', 'age']);
      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({ name: 'Alice', age: '30' });
      expect(records[1]).toEqual({ name: 'Bob', age: '25' });
    });

    it('1行目をヘッダーとして扱う', async () => {
      const csvPath = path.join(tmpDir, 'test.csv');
      await fs.promises.writeFile(csvPath, 'id,value\n1,foo\n');

      const { headers } = await loadCsvRecords(csvPath, ',');
      expect(headers[0]).toBe('id');
      expect(headers[1]).toBe('value');
    });

    it('カスタム区切り文字を使用できる', async () => {
      const csvPath = path.join(tmpDir, 'test.tsv');
      await fs.promises.writeFile(csvPath, 'name\tage\nAlice\t30\n');

      const { headers, records } = await loadCsvRecords(csvPath, '\t');
      expect(headers).toEqual(['name', 'age']);
      expect(records[0]).toEqual({ name: 'Alice', age: '30' });
    });

    it('RBQLクエリで絞り込みを行う', async () => {
      const csvPath = path.join(tmpDir, 'test.csv');
      await fs.promises.writeFile(csvPath, 'name,age\nAlice,30\nBob,25\nCharlie,30\n');

      const { records } = await loadCsvRecords(csvPath, ',', 'SELECT * WHERE a2 == "30"');
      expect(records).toHaveLength(2);
    });
  });

  describe('streamCsvRows', () => {
    it('CSVを1行ずつコールバックで処理する', async () => {
      const csvPath = path.join(tmpDir, 'test.csv');
      await fs.promises.writeFile(csvPath, 'col1,col2\nA,1\nB,2\n');

      const rows: Array<{ record: Record<string, string>; idx: number }> = [];
      const headers = await streamCsvRows(csvPath, ',', async (record, _hdrs, idx) => {
        rows.push({ record, idx });
      });

      expect(headers).toEqual(['col1', 'col2']);
      expect(rows).toHaveLength(2);
      expect(rows[0].idx).toBe(1);
      expect(rows[1].idx).toBe(2);
      expect(rows[0].record['col1']).toBe('A');
    });
  });
});

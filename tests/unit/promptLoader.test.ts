import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadPromptFiles, buildSystemMessage, getRecordPrompts } from '../../src/promptLoader';

describe('promptLoader', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'csvpilot-prompt-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('loadPromptFiles', () => {
    it('session.prompt.md を session タイプとして読み込む', async () => {
      const file = path.join(tmpDir, 'system.session.prompt.md');
      await fs.promises.writeFile(file, 'You are a helpful assistant.');

      const result = await loadPromptFiles([file]);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('session');
      expect(result[0].content).toBe('You are a helpful assistant.');
    });

    it('record.prompt.md を record タイプとして読み込む', async () => {
      const file = path.join(tmpDir, 'analyze.record.prompt.md');
      await fs.promises.writeFile(file, 'Analyze: {{name}}');

      const result = await loadPromptFiles([file]);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('record');
    });

    it('basename からサフィックスを除いた値を返す', async () => {
      const file = path.join(tmpDir, 'my-task.record.prompt.md');
      await fs.promises.writeFile(file, 'content');

      const result = await loadPromptFiles([file]);
      expect(result[0].basename).toBe('my-task');
    });

    it('対象外のファイルは無視する', async () => {
      const file = path.join(tmpDir, 'other.txt');
      await fs.promises.writeFile(file, 'not a prompt');

      const result = await loadPromptFiles([file]);
      expect(result).toHaveLength(0);
    });

    it('複数ファイルを正しく分類する', async () => {
      const sessionFile = path.join(tmpDir, 'sys.session.prompt.md');
      const recordFile = path.join(tmpDir, 'task.record.prompt.md');
      await fs.promises.writeFile(sessionFile, 'system');
      await fs.promises.writeFile(recordFile, 'record {{a1}}');

      const result = await loadPromptFiles([sessionFile, recordFile]);
      expect(result).toHaveLength(2);
      expect(result.filter(f => f.type === 'session')).toHaveLength(1);
      expect(result.filter(f => f.type === 'record')).toHaveLength(1);
    });
  });

  describe('buildSystemMessage', () => {
    it('session タイプのみを結合してシステムメッセージを生成する', async () => {
      const files = await loadPromptFiles([]);
      expect(buildSystemMessage(files)).toBe('');
    });

    it('複数 session.prompt.md の内容を改行で結合する', () => {
      const promptFiles = [
        { path: 'a', type: 'session' as const, content: 'Line A', basename: 'a' },
        { path: 'b', type: 'session' as const, content: 'Line B', basename: 'b' },
        { path: 'c', type: 'record' as const, content: 'Record', basename: 'c' },
      ];
      expect(buildSystemMessage(promptFiles)).toBe('Line A\n\nLine B');
    });
  });

  describe('getRecordPrompts', () => {
    it('record タイプのみを返す', () => {
      const promptFiles = [
        { path: 'a', type: 'session' as const, content: 'sys', basename: 'a' },
        { path: 'b', type: 'record' as const, content: 'rec', basename: 'b' },
      ];
      const records = getRecordPrompts(promptFiles);
      expect(records).toHaveLength(1);
      expect(records[0].type).toBe('record');
    });
  });
});

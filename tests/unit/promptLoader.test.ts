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

  // ---- frontmatter ----
  describe('frontmatter の解析', () => {
    it('frontmatter なしの record.prompt.md は outputSchema が undefined', async () => {
      const file = path.join(tmpDir, 'plain.record.prompt.md');
      await fs.promises.writeFile(file, 'Analyze: {{name}}');

      const result = await loadPromptFiles([file]);
      expect(result[0].outputSchema).toBeUndefined();
    });

    it('frontmatter ありの場合、outputSchema が設定される', async () => {
      const file = path.join(tmpDir, 'schema.record.prompt.md');
      await fs.promises.writeFile(
        file,
        [
          '---',
          'output:',
          '  columns:',
          '    - name: sentiment',
          '      path: sentiment',
          '      required: true',
          '    - name: reason',
          '      path: reason',
          '      required: false',
          '      default: ""',
          '---',
          'Analyze: {{comment}}',
        ].join('\n')
      );

      const result = await loadPromptFiles([file]);
      expect(result[0].outputSchema).toBeDefined();
      expect(result[0].outputSchema!.columns).toHaveLength(2);
      expect(result[0].outputSchema!.columns[0].name).toBe('sentiment');
      expect(result[0].outputSchema!.columns[0].required).toBe(true);
      expect(result[0].outputSchema!.columns[1].name).toBe('reason');
      expect(result[0].outputSchema!.columns[1].required).toBe(false);
      expect(result[0].outputSchema!.columns[1].default).toBe('');
    });

    it('content は frontmatter を除いた本文のみ返す', async () => {
      const file = path.join(tmpDir, 'body.record.prompt.md');
      await fs.promises.writeFile(
        file,
        [
          '---',
          'output:',
          '  columns:',
          '    - name: result',
          '      path: result',
          '      required: true',
          '---',
          'This is the body.',
        ].join('\n')
      );

      const result = await loadPromptFiles([file]);
      expect(result[0].content).toBe('This is the body.');
    });

    it('session.prompt.md は frontmatter があっても outputSchema を設定しない', async () => {
      const file = path.join(tmpDir, 'sys.session.prompt.md');
      await fs.promises.writeFile(
        file,
        ['---', 'output:', '  columns: []', '---', 'system message'].join('\n')
      );

      const result = await loadPromptFiles([file]);
      expect(result[0].type).toBe('session');
      expect(result[0].outputSchema).toBeUndefined();
    });

    it('output.columns に name 重複があるとエラーをスローする', async () => {
      const file = path.join(tmpDir, 'dup.record.prompt.md');
      await fs.promises.writeFile(
        file,
        [
          '---',
          'output:',
          '  columns:',
          '    - name: sentiment',
          '      path: sentiment',
          '      required: true',
          '    - name: sentiment',
          '      path: sentiment2',
          '      required: true',
          '---',
          'body',
        ].join('\n')
      );

      await expect(loadPromptFiles([file])).rejects.toThrow(/sentiment/);
    });

    it('output.columns が空の場合はエラーをスローする', async () => {
      const file = path.join(tmpDir, 'empty.record.prompt.md');
      await fs.promises.writeFile(
        file,
        ['---', 'output:', '  columns: []', '---', 'body'].join('\n')
      );

      await expect(loadPromptFiles([file])).rejects.toThrow();
    });

    it('required: true と default を同時指定するとエラーをスローする', async () => {
      const file = path.join(tmpDir, 'conflict.record.prompt.md');
      await fs.promises.writeFile(
        file,
        [
          '---',
          'output:',
          '  columns:',
          '    - name: col',
          '      path: col',
          '      required: true',
          '      default: "fallback"',
          '---',
          'body',
        ].join('\n')
      );

      await expect(loadPromptFiles([file])).rejects.toThrow();
    });
  });
});

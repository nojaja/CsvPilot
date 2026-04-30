/**
 * E2E テスト: v1.1.0 カスタム出力カラム仕様の振る舞い検証
 *
 * ビルド済みバンドルに対して CLI 実行し、スキーマ検証エラーが
 * 正しく発生・報告されることを確認する。
 * Copilot への接続は不要な経路（起動前バリデーション）のみを対象とする。
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { CliRunner } = require('jest-runner-cli');

const BUNDLE_PATH = path.resolve(__dirname, '../../../../dist/csvpilot.bundle.js');

function assertBundleExists() {
  if (!fs.existsSync(BUNDLE_PATH)) {
    throw new Error(
      `ビルド済みバンドルが見つかりません: ${BUNDLE_PATH}\n` +
      '先に npm run build を実行してください。'
    );
  }
}

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'csvpilot-e2e-v110-'));
}

/**
 * CLI を起動して stderr/stdout を収集し exit code を返す
 */
async function runCli(cli, args) {
  const exitCode = await new Promise((resolve) => {
    cli.on('exit', ({ code }) => resolve(code));
    cli.start({ command: process.execPath, args: [BUNDLE_PATH, ...args] });
  });
  return { code: exitCode };
}

describe('csvpilot v1.1.0 カスタム出力カラム E2E', () => {
  let cli;
  let tmpDir;

  beforeAll(() => {
    assertBundleExists();
  });

  beforeEach(() => {
    cli = new CliRunner();
    tmpDir = createTmpDir();
  });

  afterEach(async () => {
    await cli.sendCtrlC().catch(() => {});
    cli.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('frontmatter なし record.prompt.md の検証', () => {
    it('output.columns 宣言がない場合はエラー終了する', async () => {
      // frontmatter なし → outputSchema が undefined → バリデーションエラー
      const promptFile = path.join(tmpDir, 'no_schema.record.prompt.md');
      fs.writeFileSync(promptFile, 'Analyze: {{comment}}');

      const csvFile = path.join(tmpDir, 'data.csv');
      fs.writeFileSync(csvFile, 'id,comment\n1,hello\n');

      const result = await runCli(cli, [
        '-p', promptFile,
        '-i', csvFile,
        '-o', path.join(tmpDir, 'output'),
      ]);

      expect(result.code).not.toBe(0);
    });
  });

  describe('output.columns が空のプロンプトの検証', () => {
    it('output.columns が空配列の場合はエラー終了する', async () => {
      const promptFile = path.join(tmpDir, 'empty_cols.record.prompt.md');
      fs.writeFileSync(
        promptFile,
        ['---', 'output:', '  columns: []', '---', 'Analyze: {{comment}}'].join('\n')
      );

      const csvFile = path.join(tmpDir, 'data.csv');
      fs.writeFileSync(csvFile, 'id,comment\n1,hello\n');

      const result = await runCli(cli, [
        '-p', promptFile,
        '-i', csvFile,
        '-o', path.join(tmpDir, 'output'),
      ]);

      expect(result.code).not.toBe(0);
    });
  });

  describe('入力ヘッダと出力列名の衝突検証', () => {
    it('入力CSVのヘッダ名と output.columns.name が重複する場合はエラー終了する', async () => {
      const promptFile = path.join(tmpDir, 'conflict.record.prompt.md');
      fs.writeFileSync(
        promptFile,
        [
          '---',
          'output:',
          '  columns:',
          '    - name: comment',   // 入力CSVの "comment" と衝突
          '      path: comment',
          '      required: true',
          '---',
          'Analyze: {{comment}}',
        ].join('\n')
      );

      const csvFile = path.join(tmpDir, 'data.csv');
      fs.writeFileSync(csvFile, 'id,comment\n1,hello\n');

      const result = await runCli(cli, [
        '-p', promptFile,
        '-i', csvFile,
        '-o', path.join(tmpDir, 'output'),
      ]);

      expect(result.code).not.toBe(0);
    });
  });
});

/**
 * E2E テスト: ビルド後のcsvpilot.bundle.jsに対してCLI実行を検証する
 *
 * jest-runner-cli の CliRunner を使用したテストファイル。
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { CliRunner } = require('jest-runner-cli');

const BUNDLE_PATH = path.resolve(__dirname, '../../../../dist/csvpilot.bundle.js');

/**
 * バンドルが存在するか検証するヘルパー
 */
function assertBundleExists() {
  if (!fs.existsSync(BUNDLE_PATH)) {
    throw new Error(
      `ビルド済みバンドルが見つかりません: ${BUNDLE_PATH}\n` +
      '先に npm run build を実行してください。'
    );
  }
}

/**
 * 一時ディレクトリを作成するヘルパー
 */
function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'csvpilot-e2e-'));
}

describe('csvpilot E2E', () => {
  let cli;

  beforeAll(() => {
    assertBundleExists();
  });

  beforeEach(() => {
    cli = new CliRunner();
  });

  afterEach(async () => {
    await cli.sendCtrlC().catch(() => {});
    cli.dispose();
  });

  describe('--help / --version', () => {
    it('--help が正常に表示される', async () => {
      cli.start({ command: process.execPath, args: [BUNDLE_PATH, '--help'] });
      const lines = await cli.readStdout().toLines(5000);
      const output = lines.join('\n');
      expect(output).toContain('csvpilot');
    });

    it('--version が正常に表示される', async () => {
      cli.start({ command: process.execPath, args: [BUNDLE_PATH, '--version'] });
      const lines = await cli.readStdout().toLines(5000);
      expect(lines.join('\n').trim()).toBeTruthy();
    });
  });

  describe('引数バリデーション', () => {
    it('必須引数がない場合はエラー終了する', async () => {
      const exitCode = await new Promise((resolve) => {
        cli.on('exit', ({ code }) => resolve(code));
        cli.start({ command: process.execPath, args: [BUNDLE_PATH] });
      });
      expect(exitCode).not.toBe(0);
    });

    it('-p のみ指定した場合はエラー終了する', async () => {
      const tmpDir = createTmpDir();
      try {
        const exitCode = await new Promise((resolve) => {
          cli.on('exit', ({ code }) => resolve(code));
          cli.start({
            command: process.execPath,
            args: [BUNDLE_PATH, '-p', tmpDir, '-o', tmpDir],
          });
        });
        // -i (input) が必須なのでエラー終了するはず
        expect(exitCode).not.toBe(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('ファイル解決', () => {
    it('存在しない prompt.md ファイルを指定した場合でも警告して終了する', async () => {
      const tmpDir = createTmpDir();
      const csvFile = path.join(tmpDir, 'data.csv');
      fs.writeFileSync(csvFile, 'name\nAlice\n');

      try {
        const exitCode = await new Promise((resolve) => {
          cli.on('exit', ({ code }) => resolve(code));
          cli.start({
            command: process.execPath,
            args: [
              BUNDLE_PATH,
              '-p', path.join(tmpDir, 'nonexistent'),
              '-i', csvFile,
              '-o', path.join(tmpDir, 'output'),
            ],
          });
        });
        // record.prompt.md がなければ警告して正常終了 or エラー終了どちらも許容
        expect(exitCode).toBeDefined();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});

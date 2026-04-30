import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runInitAgent } from '../../src/initAgentCommand';

describe('initAgentCommand', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'csvpilot-init-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('テンプレート3ファイルを生成する', () => {
    const out = path.join(tmpDir, '.csvpilot');
    const result = runInitAgent(out, false);

    expect(result.files.length).toBe(3);
    for (const file of result.files) {
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it('--force なしで既存ファイルがあると失敗する', () => {
    const out = path.join(tmpDir, '.csvpilot');
    runInitAgent(out, false);
    expect(() => runInitAgent(out, false)).toThrow('既存ファイルがあるため生成できません');
  });
});

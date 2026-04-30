import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runVerify } from '../../src/verifyCommand';

describe('verifyCommand', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'csvpilot-verify-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('requiredColumns と rowCount を検証する', async () => {
    const csvPath = path.join(tmpDir, 'out.csv');
    await fs.promises.writeFile(csvPath, 'id,sentiment\n1,positive\n');

    const specPath = path.join(tmpDir, 'verify.yaml');
    await fs.promises.writeFile(
      specPath,
      [
        'rules:',
        '  requiredColumns:',
        '    - id',
        '    - sentiment',
        '  rowCount:',
        '    equals: 1',
      ].join('\n')
    );

    const report = await runVerify([csvPath], specPath, ',');
    expect(report.passed).toBe(true);
    expect(report.issues.length).toBe(0);
  });

  it('不足列を検知して failed になる', async () => {
    const csvPath = path.join(tmpDir, 'out.csv');
    await fs.promises.writeFile(csvPath, 'id,sentiment\n1,positive\n');

    const specPath = path.join(tmpDir, 'verify.yaml');
    await fs.promises.writeFile(
      specPath,
      [
        'rules:',
        '  requiredColumns:',
        '    - reason',
      ].join('\n')
    );

    const report = await runVerify([csvPath], specPath, ',');
    expect(report.passed).toBe(false);
    expect(report.issues.some(i => i.rule === 'requiredColumns')).toBe(true);
  });
});

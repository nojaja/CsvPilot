import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createExecutionPlan } from '../../src/planCommand';
import type { CsvPilotOptions } from '../../src/types';

describe('planCommand', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'csvpilot-plan-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  function baseOptions(): CsvPilotOptions {
    return {
      prompts: [tmpDir],
      input: [tmpDir],
      output: path.join(tmpDir, 'out'),
      mode: 'record',
      delimiter: ',',
    };
  }

  it('ヘッダ衝突を errors として返す', async () => {
    const promptPath = path.join(tmpDir, 'sentiment.record.prompt.md');
    await fs.promises.writeFile(
      promptPath,
      [
        '---',
        'output:',
        '  columns:',
        '    - name: comment',
        '      path: comment',
        '      required: true',
        '---',
        'Analyze: {{comment}}',
      ].join('\n')
    );

    const csvPath = path.join(tmpDir, 'data.csv');
    await fs.promises.writeFile(csvPath, 'id,comment\n1,hello\n');

    const plan = await createExecutionPlan(baseOptions());
    expect(plan.errors.some(e => e.code === 'HEADER_COLLISION')).toBe(true);
  });

  it('正常系では plannedOutputs を生成する', async () => {
    const promptPath = path.join(tmpDir, 'sentiment.record.prompt.md');
    await fs.promises.writeFile(
      promptPath,
      [
        '---',
        'output:',
        '  columns:',
        '    - name: sentiment',
        '      path: sentiment',
        '      required: true',
        '---',
        'Analyze: {{comment}}',
      ].join('\n')
    );

    const csvPath = path.join(tmpDir, 'data.csv');
    await fs.promises.writeFile(csvPath, 'id,comment\n1,hello\n');

    const plan = await createExecutionPlan(baseOptions());
    expect(plan.errors.length).toBe(0);
    expect(plan.plannedOutputs.length).toBe(1);
    expect(plan.plannedOutputs[0].additionalColumns).toEqual(['sentiment']);
  });

  it('-o がファイルパスの場合 plannedOutput.output が指定パスそのまま', async () => {
    const promptPath = path.join(tmpDir, 'sentiment.record.prompt.md');
    await fs.promises.writeFile(
      promptPath,
      [
        '---',
        'output:',
        '  columns:',
        '    - name: sentiment',
        '      path: sentiment',
        '      required: true',
        '---',
        'Analyze: {{comment}}',
      ].join('\n')
    );

    const csvPath = path.join(tmpDir, 'data.csv');
    await fs.promises.writeFile(csvPath, 'id,comment\n1,hello\n');

    const outputFilePath = path.join(tmpDir, 'result.csv');
    const options = { ...baseOptions(), output: outputFilePath };
    const plan = await createExecutionPlan(options);

    expect(plan.errors.length).toBe(0);
    expect(plan.plannedOutputs[0].output).toBe(outputFilePath);
  });
});

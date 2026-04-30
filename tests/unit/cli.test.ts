import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildOptions } from '../../src/cli';

describe('cli buildOptions', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'csvpilot-cli-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('configの値を読み込みつつ、個別CLI引数を優先する', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await fs.promises.writeFile(
      configPath,
      JSON.stringify({
        prompts: ['from-config.prompt.md'],
        input: ['from-config.csv'],
        output: 'from-config-out',
        mode: 'record',
        model: 'config-model',
        delimiter: ';',
      })
    );

    const options = buildOptions({
      config: [configPath],
      mode: 'whole',
      model: 'cli-model',
      delimiter: ',',
    });

    expect(options.prompts).toEqual(['from-config.prompt.md']);
    expect(options.input).toEqual(['from-config.csv']);
    expect(options.output).toBe('from-config-out');
    expect(options.mode).toBe('whole');
    expect(options.model).toBe('cli-model');
    expect(options.delimiter).toBe(',');
  });

  it('yaml設定ファイルも読み込める', async () => {
    const configPath = path.join(tmpDir, 'config.yaml');
    await fs.promises.writeFile(
      configPath,
      [
        'prompts:',
        '  - prompt.record.prompt.md',
        'input:',
        '  - input.csv',
        'output: out',
        'mode: record',
        'delimiter: "\\t"',
      ].join('\n')
    );

    const options = buildOptions({
      config: [configPath],
    });

    expect(options.mode).toBe('record');
    expect(options.delimiter).toBe('\t');
  });

  it('mode に folder と file を指定できる', async () => {
    const configPath = path.join(tmpDir, 'config.yaml');
    await fs.promises.writeFile(
      configPath,
      [
        'prompts:',
        '  - prompt.record.prompt.md',
        'input:',
        '  - input.csv',
        'output: out',
        'mode: folder',
      ].join('\n')
    );

    const fromConfig = buildOptions({ config: [configPath] });
    expect(fromConfig.mode).toBe('folder');

    const fromCli = buildOptions({
      config: [configPath],
      mode: 'file',
    });
    expect(fromCli.mode).toBe('file');
  });

  it('byok設定時にmodel未指定ならエラーにする', async () => {
    const configPath = path.join(tmpDir, 'config.json');
    await fs.promises.writeFile(
      configPath,
      JSON.stringify({
        prompts: ['prompt.record.prompt.md'],
        input: ['input.csv'],
        output: 'out',
        byok: {
          provider: {
            type: 'openai',
            baseUrl: 'https://api.example.com/v1',
            apiKey: 'secret',
          },
        },
      })
    );

    expect(() => buildOptions({ config: [configPath] })).toThrow(
      'model is required when byok.provider is configured.'
    );
  });

  it('必須値がconfig/CLIのどちらにもない場合はエラーにする', () => {
    expect(() => buildOptions({})).toThrow('prompts is required. Use --prompts or set prompts in --config.');
  });
});

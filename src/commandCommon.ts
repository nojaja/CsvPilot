import * as fs from 'fs';
import * as path from 'path';
import ConfigLoder from 'nodeconfigloder';

export type OutputFormat = 'text' | 'json';

export function resolveOutputFormat(value: unknown): OutputFormat {
  return value === 'json' ? 'json' : 'text';
}

export function isExistingPath(targetPath: string): boolean {
  return fs.existsSync(targetPath);
}

export function toAbsList(values: string[] | undefined): string[] {
  if (!values) return [];
  return values.map(v => path.resolve(v));
}

export function loadJsonOrYaml(filePath: string): unknown {
  const loader = new ConfigLoder();
  const text = loader.readConfigSync(filePath);
  return JSON.parse(text);
}

export function printByFormat(format: OutputFormat, payload: unknown, text: string): void {
  if (format === 'json') {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(text);
}

export function resolveToken(token?: string): string | undefined {
  if (token) return token;
  const candidates = [
    process.env['GITHUB_TOKEN'],
    process.env['GH_TOKEN'],
    process.env['COPILOT_GITHUB_TOKEN'],
  ];
  return candidates.find(t => typeof t === 'string' && t.length > 0);
}

import * as path from 'path';
import ConfigLoder from 'nodeconfigloder';
import type { ProviderConfig } from '@github/copilot-sdk';
import type { CsvPilotConfigFile } from './types';

const SUPPORTED_EXTENSIONS = new Set(['.json', '.yaml', '.yml']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSessionMode(value: unknown): CsvPilotConfigFile['mode'] {
  return value === 'whole' || value === 'folder' || value === 'file' || value === 'record'
    ? value
    : undefined;
}

function mergeConfig(
  base: CsvPilotConfigFile,
  override: CsvPilotConfigFile
): CsvPilotConfigFile {
  const mergedProvider = {
    ...(base.byok?.provider ?? {}),
    ...(override.byok?.provider ?? {}),
    azure: {
      ...(base.byok?.provider?.azure ?? {}),
      ...(override.byok?.provider?.azure ?? {}),
    },
    headers: {
      ...(base.byok?.provider?.headers ?? {}),
      ...(override.byok?.provider?.headers ?? {}),
    },
  };

  const providerBaseUrl = mergedProvider.baseUrl;
  let provider: ProviderConfig | undefined;
  if (typeof providerBaseUrl === 'string' && providerBaseUrl.length > 0) {
    provider = {
      type: mergedProvider.type,
      wireApi: mergedProvider.wireApi,
      baseUrl: providerBaseUrl,
      apiKey: mergedProvider.apiKey,
      bearerToken: mergedProvider.bearerToken,
      azure: mergedProvider.azure,
      headers: mergedProvider.headers,
    };
  }

  return {
    ...base,
    ...override,
    byok: provider ? { provider } : undefined,
    proxy: {
      ...base.proxy,
      ...override.proxy,
    },
  };
}

function normalizeConfig(json: Record<string, unknown>): CsvPilotConfigFile {
  const noProxyValue = json['proxy'] && isObject(json['proxy']) ? json['proxy']['noProxy'] : undefined;

  let noProxy: string | undefined;
  if (Array.isArray(noProxyValue)) {
    noProxy = noProxyValue
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join(',');
  } else if (typeof noProxyValue === 'string') {
    noProxy = noProxyValue;
  }

  const proxyJson = json['proxy'];
  const byokJson = json['byok'];

  return {
    prompts: Array.isArray(json['prompts'])
      ? json['prompts'].filter((v): v is string => typeof v === 'string')
      : undefined,
    input: Array.isArray(json['input'])
      ? json['input'].filter((v): v is string => typeof v === 'string')
      : undefined,
    query: typeof json['query'] === 'string' ? json['query'] : undefined,
    output: typeof json['output'] === 'string' ? json['output'] : undefined,
    mode: parseSessionMode(json['mode']),
    token: typeof json['token'] === 'string' ? json['token'] : undefined,
    model: typeof json['model'] === 'string' ? json['model'] : undefined,
    delimiter: typeof json['delimiter'] === 'string' ? json['delimiter'] : undefined,
    byok: isObject(byokJson) && isObject(byokJson['provider'])
      ? {
          provider: {
            type: byokJson['provider']['type'] as 'openai' | 'azure' | 'anthropic' | undefined,
            wireApi: byokJson['provider']['wireApi'] as 'completions' | 'responses' | undefined,
            baseUrl: byokJson['provider']['baseUrl'] as string,
            apiKey: byokJson['provider']['apiKey'] as string | undefined,
            bearerToken: byokJson['provider']['bearerToken'] as string | undefined,
            azure: isObject(byokJson['provider']['azure'])
              ? {
                  apiVersion: byokJson['provider']['azure']['apiVersion'] as string | undefined,
                }
              : undefined,
            headers: isObject(byokJson['provider']['headers'])
              ? (byokJson['provider']['headers'] as Record<string, string>)
              : undefined,
          },
        }
      : undefined,
    proxy: isObject(proxyJson)
      ? {
          http: typeof proxyJson['http'] === 'string' ? proxyJson['http'] : undefined,
          https: typeof proxyJson['https'] === 'string' ? proxyJson['https'] : undefined,
          noProxy,
        }
      : undefined,
  };
}

/**
 * 設定ファイル群（JSON/YAML）を順に読み込み、後勝ちでマージする
 */
export function loadConfigFiles(paths: string[] | undefined): CsvPilotConfigFile {
  if (!paths || paths.length === 0) {
    return {};
  }

  const loader = new ConfigLoder();
  let merged: CsvPilotConfigFile = {};

  for (const configPath of paths) {
    const ext = path.extname(configPath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported config extension: ${configPath}`);
    }

    const configText = loader.readConfigSync(configPath);
    const parsed = JSON.parse(configText) as unknown;

    if (!isObject(parsed)) {
      throw new Error(`Config root must be an object: ${configPath}`);
    }

    merged = mergeConfig(merged, normalizeConfig(parsed));
  }

  return merged;
}

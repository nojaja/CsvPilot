import * as path from 'path';
import ConfigLoder from 'nodeconfigloder';
import type { ProviderConfig } from '@github/copilot-sdk';
import type { CsvPilotConfigFile } from './types';

const SUPPORTED_EXTENSIONS = new Set(['.json', '.yaml', '.yml']);

/**
 * 処理名: オブジェクト型ガード
 *
 * 処理概要: 値が非null非配列オブジェクトかを判定する
 *
 * 実装理由: 設定ファイルの型安全なネスト参照に使用するため
 * @param value 判定対象の値
 * @returns オブジェクトであれば true
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 処理名: セッションモード解析
 *
 * 処理概要: 文字列をセッションモードに変換する。未知の値は undefined を返す
 *
 * 実装理由: 設定ファイル読み込み時に有効なモード値のみを受け付けるため
 * @param value 解析対象の値
 * @returns セッションモード、または undefined
 */
function parseSessionMode(value: unknown): CsvPilotConfigFile['mode'] {
  return value === 'whole' || value === 'folder' || value === 'file' || value === 'record'
    ? value
    : undefined;
}

/**
 * 処理名: 設定マージ
 *
 * 処理概要: ベース設定に上書き設定を後勝ちでマージする
 *
 * 実装理由: 複数設定ファイルを優先度順に統合するため
 * @param base ベース設定
 * @param override 上書き設定
 * @returns マージ済み設定
 */
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

/**
 * 処理名: noProxy 値解決
 *
 * 処理概要: proxy.noProxy を配列またはカンマ区切り文字列に正規化する
 *
 * 実装理由: normalizeConfig の Cognitive Complexity を下げるために分離
 * @param proxyJson proxy 設定オブジェクト（unknown）
 * @returns noProxy 文字列、または undefined
 */
function resolveNoProxy(proxyJson: unknown): string | undefined {
  if (!isObject(proxyJson)) return undefined;
  const noProxyValue = proxyJson['noProxy'];
  if (Array.isArray(noProxyValue)) {
    return noProxyValue
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join(',');
  }
  return typeof noProxyValue === 'string' ? noProxyValue : undefined;
}

/**
 * 処理名: proxy 設定解決
 *
 * 処理概要: 生の proxy オブジェクトを型安全な設定に変換する
 *
 * 実装理由: normalizeConfig の Cognitive Complexity を下げるために分離
 * @param proxyJson 生の proxy 設定値
 * @returns 型安全な proxy 設定、または undefined
 */
function resolveProxy(proxyJson: unknown): CsvPilotConfigFile['proxy'] {
  if (!isObject(proxyJson)) return undefined;
  return {
    http: typeof proxyJson['http'] === 'string' ? proxyJson['http'] : undefined,
    https: typeof proxyJson['https'] === 'string' ? proxyJson['https'] : undefined,
    noProxy: resolveNoProxy(proxyJson),
  };
}

/**
 * 処理名: byok provider 解決
 *
 * 処理概要: 生の provider オブジェクトを ProviderConfig に変換する
 *
 * 実装理由: normalizeConfig の Cognitive Complexity を下げるために分離
 * @param providerJson 生の provider 設定値
 * @returns ProviderConfig、または undefined
 */
function resolveByokProvider(providerJson: unknown): ProviderConfig | undefined {
  if (!isObject(providerJson)) return undefined;
  const baseUrl = providerJson['baseUrl'];
  if (typeof baseUrl !== 'string' || !baseUrl) return undefined;

  return {
    type: providerJson['type'] as 'openai' | 'azure' | 'anthropic' | undefined,
    wireApi: providerJson['wireApi'] as 'completions' | 'responses' | undefined,
    baseUrl,
    apiKey: providerJson['apiKey'] as string | undefined,
    bearerToken: providerJson['bearerToken'] as string | undefined,
    azure: isObject(providerJson['azure'])
      ? { apiVersion: providerJson['azure']['apiVersion'] as string | undefined }
      : undefined,
    headers: isObject(providerJson['headers'])
      ? (providerJson['headers'] as Record<string, string>)
      : undefined,
  };
}

/**
 * 処理名: byok 設定解決
 *
 * 処理概要: 生の byok オブジェクトを型安全な byok 設定に変換する
 *
 * 実装理由: normalizeConfig の Cognitive Complexity を下げるために分離
 * @param byokJson 生の byok 設定値
 * @returns byok 設定、または undefined
 */
function resolveByok(byokJson: unknown): CsvPilotConfigFile['byok'] {
  if (!isObject(byokJson)) return undefined;
  const provider = resolveByokProvider(byokJson['provider']);
  return provider ? { provider } : undefined;
}

/**
 * 処理名: 設定正規化
 *
 * 処理概要: 生のJSONオブジェクトを CsvPilotConfigFile 型に変換する
 *
 * 実装理由: 設定ファイルの型安全な読み込みを保証するため
 * @param json 生のJSONオブジェクト
 * @returns 正規化された設定
 */
function normalizeConfig(json: Record<string, unknown>): CsvPilotConfigFile {
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
    byok: resolveByok(json['byok']),
    proxy: resolveProxy(json['proxy']),
  };
}

/**
 * 設定ファイル群（JSON/YAML）を順に読み込み、後勝ちでマージする
 * @param paths 設定ファイルパス配列（undefined または空の場合は空設定を返す）
 * @returns マージ済み設定
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

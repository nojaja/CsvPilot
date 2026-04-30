import { CopilotClient, approveAll } from '@github/copilot-sdk';
import type { CopilotSession } from '@github/copilot-sdk';
import type { CopilotClientOptions, ProviderConfig } from '@github/copilot-sdk';
import type { CsvPilotOptions } from './types';

/** セッション管理コンテキスト */
export interface SessionContext {
  client: CopilotClient;
  session: CopilotSession | null;
  systemMessage: string;
  options: CsvPilotOptions;
}

/**
 * CopilotClientを初期化して起動する
 */
export async function startClient(options: CsvPilotOptions): Promise<CopilotClient> {
  const tokenFromOption = options.token;
  const tokenFromEnv = resolveToken();
  const token = tokenFromOption ?? tokenFromEnv;
  const clientOptions: CopilotClientOptions = {};

  const proxyEnv = buildProxyEnv(options);
  if (proxyEnv) {
    clientOptions.env = proxyEnv;
  }

  // If a token is provided (via --token or environment variable), treat as
  // OAuth GitHub App authentication and pass the token explicitly to the SDK.
  // Also set `useLoggedInUser: false` to avoid falling back to stored CLI
  // credentials.
  if (token) {
    clientOptions.gitHubToken = token;
    clientOptions.useLoggedInUser = false;
    const client = new CopilotClient(clientOptions);
    await client.start();
    return client;
  }

  // No token provided: treat as GitHub Signed-in User. The SDK will use any
  // stored CLI credentials (or prompt the user to sign in interactively).
  const client = new CopilotClient(clientOptions);
  await client.start();
  return client;
}

/**
 * 環境変数からGitHubトークンを解決する
 */
function resolveToken(): string | undefined {
  return (
    process.env['COPILOT_GITHUB_TOKEN'] ??
    process.env['GH_TOKEN'] ??
    process.env['GITHUB_TOKEN']
  );
}

/**
 * 新しいCopilotSessionを作成する
 */
export async function createCopilotSession(
  client: CopilotClient,
  systemMessage: string,
  model?: string,
  provider?: ProviderConfig
): Promise<CopilotSession> {
  const config: Parameters<typeof client.createSession>[0] = {
    onPermissionRequest: approveAll,
  };

  if (model) {
    config.model = model;
  }

  if (systemMessage.trim()) {
    config.systemMessage = { content: systemMessage };
  }

  if (provider) {
    config.provider = provider;
  }

  return client.createSession(config);
}

function buildProxyEnv(options: CsvPilotOptions): Record<string, string | undefined> | undefined {
  const proxy = options.proxy;
  if (!proxy) {
    return undefined;
  }

  const env: Record<string, string | undefined> = { ...process.env };
  let hasOverride = false;

  if (proxy.http) {
    env['HTTP_PROXY'] = proxy.http;
    env['http_proxy'] = proxy.http;
    hasOverride = true;
  }

  if (proxy.https) {
    env['HTTPS_PROXY'] = proxy.https;
    env['https_proxy'] = proxy.https;
    hasOverride = true;
  }

  if (proxy.noProxy) {
    env['NO_PROXY'] = proxy.noProxy;
    env['no_proxy'] = proxy.noProxy;
    hasOverride = true;
  }

  return hasOverride ? env : undefined;
}

/**
 * sessionにプロンプトを送信して応答を取得する
 */
export async function sendPrompt(
  session: CopilotSession,
  prompt: string
): Promise<string> {
  const event = await session.sendAndWait({ prompt });
  return event?.data?.content ?? '';
}

/**
 * セッションを切断する
 */
export async function disconnectSession(session: CopilotSession): Promise<void> {
  await session.disconnect();
}

/**
 * クライアントを停止する
 */
export async function stopClient(client: CopilotClient): Promise<void> {
  await client.stop();
}

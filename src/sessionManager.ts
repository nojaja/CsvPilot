import { CopilotClient, approveAll } from '@github/copilot-sdk';
import type { CopilotSession } from '@github/copilot-sdk';
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

  // If a token is provided (via --token or environment variable), treat as
  // OAuth GitHub App authentication and pass the token explicitly to the SDK.
  // Also set `useLoggedInUser: false` to avoid falling back to stored CLI
  // credentials.
  if (token) {
    const client = new CopilotClient({ gitHubToken: token, useLoggedInUser: false });
    await client.start();
    return client;
  }

  // No token provided: treat as GitHub Signed-in User. The SDK will use any
  // stored CLI credentials (or prompt the user to sign in interactively).
  const client = new CopilotClient();
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
  model?: string
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

  return client.createSession(config);
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

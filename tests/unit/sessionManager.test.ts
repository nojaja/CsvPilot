import {
    startClient,
    createCopilotSession,
    sendPrompt,
    disconnectSession,
    stopClient,
} from '../../src/sessionManager';
import type { CsvPilotOptions } from '../../src/types';

jest.mock('@github/copilot-sdk', () => {
    const mockSession = {
        sendAndWait: jest.fn(),
        disconnect: jest.fn(),
    };
    const mockClient = {
        start: jest.fn(),
        stop: jest.fn(),
        createSession: jest.fn().mockResolvedValue(mockSession),
    };
    return {
        CopilotClient: jest.fn().mockImplementation(() => mockClient),
        approveAll: jest.fn(),
        __mockClient: mockClient,
        __mockSession: mockSession,
    };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sdk = require('@github/copilot-sdk');

/**
 * テスト用ベースオプションを生成する
 * @returns CsvPilotOptions
 */
function baseOptions(): CsvPilotOptions {
    return {
        prompts: [],
        input: [],
        output: '/tmp/out',
        mode: 'record',
        delimiter: ',',
    };
}

describe('sessionManager', () => {
    const mockClient = sdk.__mockClient;
    const mockSession = sdk.__mockSession;
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClient.start.mockResolvedValue(undefined);
        mockClient.stop.mockResolvedValue(undefined);
        mockClient.createSession.mockResolvedValue(mockSession);
        mockSession.sendAndWait.mockResolvedValue({ data: { content: 'response text' } });
        mockSession.disconnect.mockResolvedValue(undefined);
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('startClient', () => {
        it('トークンが指定された場合は gitHubToken を設定して start を呼ぶ', async () => {
            const options = { ...baseOptions(), token: 'my-token' };
            const client = await startClient(options);
            expect(mockClient.start).toHaveBeenCalled();
            expect(client).toBe(mockClient);
        });

        it('環境変数からトークンを取得して start を呼ぶ', async () => {
            delete process.env['GITHUB_TOKEN'];
            delete process.env['GH_TOKEN'];
            delete process.env['COPILOT_GITHUB_TOKEN'];
            process.env['GITHUB_TOKEN'] = 'env-token';
            const client = await startClient(baseOptions());
            expect(mockClient.start).toHaveBeenCalled();
            expect(client).toBe(mockClient);
        });

        it('トークンが一切ない場合も start を呼ぶ', async () => {
            delete process.env['GITHUB_TOKEN'];
            delete process.env['GH_TOKEN'];
            delete process.env['COPILOT_GITHUB_TOKEN'];
            const client = await startClient(baseOptions());
            expect(mockClient.start).toHaveBeenCalled();
            expect(client).toBe(mockClient);
        });

        it('proxy.http が設定された場合 env を設定する', async () => {
            const options = { ...baseOptions(), proxy: { http: 'http://proxy:8080' } };
            await startClient(options);
            expect(mockClient.start).toHaveBeenCalled();
        });
    });

    describe('createCopilotSession', () => {
        it('createSession を呼びセッションを返す', async () => {
            const session = await createCopilotSession(mockClient, 'system message');
            expect(mockClient.createSession).toHaveBeenCalled();
            expect(session).toBe(mockSession);
        });

        it('model が指定された場合は config に含める', async () => {
            await createCopilotSession(mockClient, 'system', 'gpt-4');
            const call = mockClient.createSession.mock.calls[0][0];
            expect(call.model).toBe('gpt-4');
        });

        it('systemMessage が空文字の場合は config に含めない', async () => {
            await createCopilotSession(mockClient, '   ');
            const call = mockClient.createSession.mock.calls[0][0];
            expect(call.systemMessage).toBeUndefined();
        });

        it('systemMessage があれば config に含める', async () => {
            await createCopilotSession(mockClient, 'You are helpful.');
            const call = mockClient.createSession.mock.calls[0][0];
            expect(call.systemMessage).toEqual({ content: 'You are helpful.' });
        });
    });

    describe('sendPrompt', () => {
        it('sendAndWait を呼び content を返す', async () => {
            const result = await sendPrompt(mockSession, 'hello');
            expect(mockSession.sendAndWait).toHaveBeenCalledWith({ prompt: 'hello' });
            expect(result).toBe('response text');
        });

        it('event が null の場合は空文字を返す', async () => {
            mockSession.sendAndWait.mockResolvedValue(null);
            const result = await sendPrompt(mockSession, 'hello');
            expect(result).toBe('');
        });

        it('data.content が undefined の場合は空文字を返す', async () => {
            mockSession.sendAndWait.mockResolvedValue({ data: {} });
            const result = await sendPrompt(mockSession, 'hello');
            expect(result).toBe('');
        });
    });

    describe('disconnectSession', () => {
        it('session.disconnect を呼ぶ', async () => {
            await disconnectSession(mockSession);
            expect(mockSession.disconnect).toHaveBeenCalled();
        });
    });

    describe('stopClient', () => {
        it('client.stop を呼ぶ', async () => {
            await stopClient(mockClient);
            expect(mockClient.stop).toHaveBeenCalled();
        });
    });
});
